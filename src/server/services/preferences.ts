/**
 * Personalisation.
 *
 * Two layers, deliberately separated:
 *
 *   declared  — what the user explicitly set on their profile. Always wins.
 *   learned   — affinity scores accumulated from what they actually save.
 *
 * Learned affinity is a small weighted counter per (domain, facet, value), with
 * decay so old behaviour fades. It only ever nudges ranking; it never filters
 * anything out. Personalisation can be switched off entirely, and the profile
 * page exposes the learned values so the system is inspectable, not spooky.
 */
import { and, desc, eq, sql } from "drizzle-orm";

import type { Domain, EventAction, MediaSummary, PreferencesDto, SearchHistoryDto } from "@/lib/types";
import { db } from "@/server/db";
import {
  recommendationEvents,
  searchHistory,
  userPreferences,
  type UserPreferenceRow,
} from "@/server/db/schema";
import { createId } from "@/server/lib/id";
import { logger } from "@/server/lib/logger";

const DECAY = 0.98;
const MAX_AFFINITY = 12;
const FACET_WEIGHTS: Record<string, number> = { genre: 1, mood: 0.6, theme: 0.4 };
const ACTION_WEIGHTS: Partial<Record<EventAction, number>> = {
  SAVED: 1,
  WATCHED: 0.8,
  OPENED: 0.25,
  DISMISSED: -0.6,
  REMOVED: -0.8,
};

export async function getOrCreatePreferences(userId: string): Promise<UserPreferenceRow> {
  const existing = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  if (existing.length) return existing[0];

  const [created] = await db
    .insert(userPreferences)
    .values({ id: createId("pref"), userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row;
}

export interface PreferenceUpdate {
  personalizationEnabled?: boolean;
  favoriteMusicGenres?: string[];
  favoriteVideoGenres?: string[];
  favoriteMoods?: string[];
  avoidedGenres?: string[];
  languages?: string[];
  maxRuntimeMinutes?: number | null;
  familyFriendlyOnly?: boolean;
  preferredTone?: string | null;
}

export async function updatePreferences(
  userId: string,
  update: PreferenceUpdate,
): Promise<UserPreferenceRow> {
  await getOrCreatePreferences(userId);
  const [row] = await db
    .update(userPreferences)
    .set({ ...update, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId))
    .returning();
  return row;
}

/** Wipe learned affinity but keep declared settings. */
export async function resetLearnedAffinity(userId: string): Promise<void> {
  await getOrCreatePreferences(userId);
  await db
    .update(userPreferences)
    .set({ affinity: {}, updatedAt: new Date() })
    .where(eq(userPreferences.userId, userId));
}

export async function resetPreferences(userId: string): Promise<UserPreferenceRow> {
  await getOrCreatePreferences(userId);
  const [row] = await db
    .update(userPreferences)
    .set({
      personalizationEnabled: true,
      favoriteMusicGenres: [],
      favoriteVideoGenres: [],
      favoriteMoods: [],
      avoidedGenres: [],
      languages: ["en"],
      maxRuntimeMinutes: null,
      familyFriendlyOnly: false,
      preferredTone: null,
      affinity: {},
      updatedAt: new Date(),
    })
    .where(eq(userPreferences.userId, userId))
    .returning();
  return row;
}

function asAffinity(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, score] of Object.entries(value as Record<string, unknown>)) {
    const numeric = Number(score);
    if (Number.isFinite(numeric)) out[key] = numeric;
  }
  return out;
}

/** Fold one interaction into the user's affinity map. */
export function applyAffinity(
  current: Record<string, number>,
  media: Pick<MediaSummary, "domain" | "genres" | "moods" | "themes">,
  action: EventAction,
): Record<string, number> {
  const actionWeight = ACTION_WEIGHTS[action];
  if (!actionWeight) return current;

  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(current)) {
    const decayed = value * DECAY;
    if (Math.abs(decayed) >= 0.05) next[key] = Number(decayed.toFixed(4));
  }

  const domain = media.domain.toLowerCase();
  const bump = (facet: string, values: string[]) => {
    const weight = FACET_WEIGHTS[facet] ?? 0.3;
    for (const value of values.slice(0, 6)) {
      const key = `${domain}:${facet}:${value.toLowerCase()}`;
      const updated = (next[key] ?? 0) + weight * actionWeight;
      next[key] = Number(Math.max(-MAX_AFFINITY, Math.min(MAX_AFFINITY, updated)).toFixed(4));
      if (Math.abs(next[key]) < 0.05) delete next[key];
    }
  };

  bump("genre", media.genres);
  bump("mood", media.moods);
  bump("theme", media.themes);
  return next;
}

export interface RecordEventInput {
  userId?: string | null;
  domain: Domain;
  action: EventAction;
  media?: MediaSummary | null;
  mediaId?: string | null;
  query?: string | null;
  score?: number | null;
  position?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Log an interaction and, when it is a strong signal from a signed-in user,
 * update their affinity. Never throws into the caller's path — a failed
 * analytics write must not fail a save.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await db.insert(recommendationEvents).values({
      id: createId("evt"),
      userId: input.userId ?? null,
      domain: input.domain,
      mediaId: input.mediaId ?? input.media?.id ?? null,
      mediaType: input.media?.mediaType ?? null,
      action: input.action,
      query: input.query ?? null,
      score: input.score ?? null,
      position: input.position ?? null,
      metadata: input.metadata ?? null,
    });

    if (!input.userId || !input.media) return;
    if (!ACTION_WEIGHTS[input.action]) return;

    const preferences = await getOrCreatePreferences(input.userId);
    if (!preferences.personalizationEnabled) return;

    const affinity = applyAffinity(asAffinity(preferences.affinity), input.media, input.action);
    await db
      .update(userPreferences)
      .set({ affinity, updatedAt: new Date() })
      .where(eq(userPreferences.userId, input.userId));
  } catch (error) {
    logger.warn("failed to record recommendation event", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recordSearch(input: {
  userId: string;
  domain: Domain;
  query: string;
  parsed?: unknown;
  resultCount: number;
  latencyMs?: number;
}): Promise<void> {
  try {
    await db.insert(searchHistory).values({
      id: createId("sh"),
      userId: input.userId,
      domain: input.domain,
      query: input.query,
      parsed: (input.parsed ?? null) as Record<string, unknown> | null,
      resultCount: input.resultCount,
      latencyMs: input.latencyMs ?? null,
    });
  } catch (error) {
    logger.warn("failed to record search history", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listSearchHistory(userId: string, limit = 25): Promise<SearchHistoryDto[]> {
  const rows = await db
    .select()
    .from(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .orderBy(desc(searchHistory.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    domain: row.domain,
    query: row.query,
    resultCount: row.resultCount,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function clearSearchHistory(userId: string): Promise<number> {
  const deleted = await db
    .delete(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .returning({ id: searchHistory.id });
  return deleted.length;
}

export async function deleteSearchHistoryEntry(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(searchHistory)
    .where(and(eq(searchHistory.userId, userId), eq(searchHistory.id, id)))
    .returning({ id: searchHistory.id });
  return deleted.length > 0;
}

/** Affinity map for the retrieval layer — empty when personalisation is off. */
export async function affinityFor(userId: string | null | undefined): Promise<Record<string, number>> {
  if (!userId) return {};
  const preferences = await getOrCreatePreferences(userId);
  if (!preferences.personalizationEnabled) return {};
  return asAffinity(preferences.affinity);
}

const FACET_LABEL: Record<string, string> = {
  genre: "Genre",
  mood: "Mood",
  theme: "Theme",
};

export function toPreferencesDto(row: UserPreferenceRow): PreferencesDto {
  const affinity = asAffinity(row.affinity);
  const learned = Object.entries(affinity)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([key, score]) => {
      const [domain, facet, ...rest] = key.split(":");
      const value = rest.join(":");
      return {
        key,
        label: `${domain === "music" ? "Music" : "Film & TV"} · ${FACET_LABEL[facet] ?? facet}: ${value}`,
        score: Number(score.toFixed(2)),
      };
    });

  return {
    personalizationEnabled: row.personalizationEnabled,
    favoriteMusicGenres: row.favoriteMusicGenres,
    favoriteVideoGenres: row.favoriteVideoGenres,
    favoriteMoods: row.favoriteMoods,
    avoidedGenres: row.avoidedGenres,
    languages: row.languages,
    maxRuntimeMinutes: row.maxRuntimeMinutes,
    familyFriendlyOnly: row.familyFriendlyOnly,
    preferredTone: row.preferredTone,
    learned,
    updatedAt: row.updatedAt.toISOString(),
  };
}
