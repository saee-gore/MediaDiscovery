/**
 * Playlist CRUD.
 *
 * Two decisions worth calling out:
 *
 *  - Every item stores a JSON snapshot of the track alongside its media id.
 *    A saved playlist therefore renders correctly even if the catalogue row is
 *    pruned or the upstream API changes, and the list survives losing an API
 *    key entirely.
 *  - Ownership failures return 404, not 403. Telling someone "this exists but
 *    isn't yours" leaks the existence of other people's lists.
 */
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { CollectionSource, MediaSummary, PlaylistDto, PlaylistItemDto } from "@/lib/types";
import { db } from "@/server/db";
import { playlistItems, playlists, type PlaylistItemRow, type PlaylistRow } from "@/server/db/schema";
import { badRequest, duplicate, notFound } from "@/server/lib/errors";
import { createId } from "@/server/lib/id";
import { recordEvent } from "@/server/services/preferences";
import { fetchMediaByIds } from "@/server/vector/store";

const PREVIEW_SIZE = 4;

function toItemDto(row: PlaylistItemRow): PlaylistItemDto {
  return {
    id: row.id,
    mediaId: row.mediaId,
    position: row.position,
    note: row.note,
    addedAt: row.addedAt.toISOString(),
    media: row.snapshot as unknown as MediaSummary,
  };
}

function toDto(row: PlaylistRow, items: PlaylistItemRow[], includeItems: boolean): PlaylistDto {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source as CollectionSource,
    seedQuery: row.seedQuery,
    accent: row.accent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    itemCount: sorted.length,
    items: includeItems ? sorted.map(toItemDto) : undefined,
    preview: sorted.slice(0, PREVIEW_SIZE).map((item) => item.snapshot as unknown as MediaSummary),
  };
}

async function ownedPlaylist(userId: string, playlistId: string): Promise<PlaylistRow> {
  const [row] = await db
    .select()
    .from(playlists)
    .where(and(eq(playlists.id, playlistId), eq(playlists.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That playlist");
  return row;
}

async function touch(playlistId: string): Promise<void> {
  await db.update(playlists).set({ updatedAt: new Date() }).where(eq(playlists.id, playlistId));
}

export async function listPlaylists(
  userId: string,
  options: { query?: string } = {},
): Promise<PlaylistDto[]> {
  const conditions = [eq(playlists.userId, userId)];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim()}%`;
    conditions.push(
      or(ilike(playlists.name, pattern), ilike(playlists.description, pattern))!,
    );
  }

  const rows = await db
    .select()
    .from(playlists)
    .where(and(...conditions))
    .orderBy(desc(playlists.updatedAt));
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(playlistItems)
    .where(inArray(playlistItems.playlistId, rows.map((row) => row.id)))
    .orderBy(asc(playlistItems.position));

  const grouped = new Map<string, PlaylistItemRow[]>();
  for (const item of items) {
    const list = grouped.get(item.playlistId) ?? [];
    list.push(item);
    grouped.set(item.playlistId, list);
  }

  return rows.map((row) => toDto(row, grouped.get(row.id) ?? [], false));
}

export async function getPlaylist(
  userId: string,
  playlistId: string,
  options: { search?: string } = {},
): Promise<PlaylistDto> {
  const row = await ownedPlaylist(userId, playlistId);
  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position));

  const filtered = options.search?.trim()
    ? items.filter((item) => matchesSearch(item.snapshot as unknown as MediaSummary, options.search!))
    : items;

  return toDto(row, filtered, true);
}

function matchesSearch(media: MediaSummary, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return [media.title, media.subtitle, media.album ?? "", ...media.genres, ...media.moods]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export interface CreatePlaylistInput {
  name: string;
  description?: string;
  source?: CollectionSource;
  seedQuery?: string | null;
  accent?: string;
  mediaIds?: string[];
}

export async function createPlaylist(
  userId: string,
  input: CreatePlaylistInput,
): Promise<PlaylistDto> {
  const name = input.name.trim();
  if (!name) throw badRequest("A playlist needs a name.");

  const [row] = await db
    .insert(playlists)
    .values({
      id: createId("pl"),
      userId,
      name,
      description: input.description?.trim() ?? "",
      source: input.source ?? "MANUAL",
      seedQuery: input.seedQuery ?? null,
      accent: input.accent ?? "violet",
    })
    .returning();

  if (input.mediaIds?.length) {
    await addItems(userId, row.id, input.mediaIds);
  }
  return getPlaylist(userId, row.id);
}

export interface UpdatePlaylistInput {
  name?: string;
  description?: string;
  accent?: string;
}

export async function updatePlaylist(
  userId: string,
  playlistId: string,
  input: UpdatePlaylistInput,
): Promise<PlaylistDto> {
  await ownedPlaylist(userId, playlistId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw badRequest("A playlist needs a name.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.accent !== undefined) patch.accent = input.accent;

  await db.update(playlists).set(patch).where(eq(playlists.id, playlistId));
  return getPlaylist(userId, playlistId);
}

export async function deletePlaylist(userId: string, playlistId: string): Promise<void> {
  await ownedPlaylist(userId, playlistId);
  await db.delete(playlists).where(eq(playlists.id, playlistId));
}

export interface AddItemsResult {
  added: number;
  skipped: string[];
  playlist: PlaylistDto;
}

/**
 * Adding an existing track is a no-op rather than an error — unless every id
 * was already present, which is worth telling the user about.
 */
export async function addItems(
  userId: string,
  playlistId: string,
  mediaIds: string[],
  note?: string,
): Promise<AddItemsResult> {
  await ownedPlaylist(userId, playlistId);
  const ids = [...new Set(mediaIds.filter(Boolean))];
  if (ids.length === 0) throw badRequest("No tracks were provided.");

  const media = await fetchMediaByIds(ids);
  const missing = ids.filter((id) => !media.has(id));
  if (missing.length === ids.length) {
    throw notFound(missing.length === 1 ? "That track" : "Those tracks");
  }

  const existing = await db
    .select({ mediaId: playlistItems.mediaId })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));
  const present = new Set(existing.map((row) => row.mediaId));

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${playlistItems.position}), -1)` })
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));

  let position = Number(max) + 1;
  const skipped: string[] = [...missing];
  const values: Array<typeof playlistItems.$inferInsert> = [];

  for (const id of ids) {
    const item = media.get(id);
    if (!item) continue;
    if (present.has(id)) {
      skipped.push(id);
      continue;
    }
    values.push({
      id: createId("pli"),
      playlistId,
      mediaId: id,
      position: position++,
      note: note ?? null,
      snapshot: item as unknown as Record<string, unknown>,
    });
  }

  if (values.length === 0) {
    throw duplicate(
      ids.length === 1 ? "That track is already in this playlist." : "Those tracks are already in this playlist.",
    );
  }

  await db.insert(playlistItems).values(values).onConflictDoNothing();
  await touch(playlistId);

  for (const value of values) {
    const item = media.get(value.mediaId!);
    if (item) {
      await recordEvent({ userId, domain: "MUSIC", action: "SAVED", media: item });
    }
  }

  return { added: values.length, skipped, playlist: await getPlaylist(userId, playlistId) };
}

export async function updateItem(
  userId: string,
  playlistId: string,
  itemId: string,
  input: { note?: string | null; position?: number },
): Promise<PlaylistDto> {
  await ownedPlaylist(userId, playlistId);
  const [item] = await db
    .select()
    .from(playlistItems)
    .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
    .limit(1);
  if (!item) throw notFound("That track");

  if (input.note !== undefined) {
    await db.update(playlistItems).set({ note: input.note }).where(eq(playlistItems.id, itemId));
  }
  if (input.position !== undefined) {
    await moveItem(playlistId, itemId, input.position);
  }
  await touch(playlistId);
  return getPlaylist(userId, playlistId);
}

/** Reposition one item and renumber the rest so positions stay dense. */
async function moveItem(playlistId: string, itemId: string, target: number): Promise<void> {
  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position));

  const current = items.findIndex((item) => item.id === itemId);
  if (current === -1) return;
  const clamped = Math.max(0, Math.min(items.length - 1, target));
  const [moved] = items.splice(current, 1);
  items.splice(clamped, 0, moved);

  for (let index = 0; index < items.length; index += 1) {
    if (items[index].position !== index) {
      await db.update(playlistItems).set({ position: index }).where(eq(playlistItems.id, items[index].id));
    }
  }
}

export async function reorderItems(
  userId: string,
  playlistId: string,
  orderedItemIds: string[],
): Promise<PlaylistDto> {
  await ownedPlaylist(userId, playlistId);
  const items = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId));
  const known = new Set(items.map((item) => item.id));
  const ordered = orderedItemIds.filter((id) => known.has(id));
  const rest = items.map((item) => item.id).filter((id) => !ordered.includes(id));
  const finalOrder = [...ordered, ...rest];

  for (let index = 0; index < finalOrder.length; index += 1) {
    await db.update(playlistItems).set({ position: index }).where(eq(playlistItems.id, finalOrder[index]));
  }
  await touch(playlistId);
  return getPlaylist(userId, playlistId);
}

export async function removeItem(
  userId: string,
  playlistId: string,
  itemId: string,
): Promise<PlaylistDto> {
  await ownedPlaylist(userId, playlistId);
  const deleted = await db
    .delete(playlistItems)
    .where(and(eq(playlistItems.id, itemId), eq(playlistItems.playlistId, playlistId)))
    .returning();
  if (deleted.length === 0) throw notFound("That track");

  const media = deleted[0].snapshot as unknown as MediaSummary;
  await recordEvent({ userId, domain: "MUSIC", action: "REMOVED", media });

  // Close the gap left behind.
  const remaining = await db
    .select()
    .from(playlistItems)
    .where(eq(playlistItems.playlistId, playlistId))
    .orderBy(asc(playlistItems.position));
  for (let index = 0; index < remaining.length; index += 1) {
    if (remaining[index].position !== index) {
      await db.update(playlistItems).set({ position: index }).where(eq(playlistItems.id, remaining[index].id));
    }
  }

  await touch(playlistId);
  return getPlaylist(userId, playlistId);
}

export async function countPlaylists(userId: string): Promise<{ lists: number; tracks: number }> {
  const [lists] = await db
    .select({ count: sql<number>`count(*)` })
    .from(playlists)
    .where(eq(playlists.userId, userId));
  const [tracks] = await db
    .select({ count: sql<number>`count(*)` })
    .from(playlistItems)
    .innerJoin(playlists, eq(playlists.id, playlistItems.playlistId))
    .where(eq(playlists.userId, userId));
  return { lists: Number(lists?.count ?? 0), tracks: Number(tracks?.count ?? 0) };
}
