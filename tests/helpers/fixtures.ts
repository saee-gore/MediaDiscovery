import { createUser } from "@/server/services/users";
import { upsertRecords, generateMissingEmbeddings } from "@/server/services/catalog";
import { seedTitleRecords, seedTrackRecords } from "@/server/providers/seed";
import type { MediaRecord } from "@/server/media/types";
import type { User } from "@/server/db/schema";

let counter = 0;

export async function makeUser(overrides: Partial<{ email: string; name: string }> = {}): Promise<User> {
  counter += 1;
  return createUser({
    email: overrides.email ?? `user${counter}@example.test`,
    name: overrides.name ?? `User ${counter}`,
  });
}

/** Load the offline catalogue and embed it with the deterministic fallback. */
export async function loadCatalogue(options: { music?: number; video?: number } = {}) {
  const music = seedTrackRecords().slice(0, options.music ?? 60);
  const video = seedTitleRecords().slice(0, options.video ?? 50);
  await upsertRecords([...music, ...video]);
  await generateMissingEmbeddings(500);
  return { music, video };
}

export function fakeTrack(overrides: Partial<MediaRecord> = {}): MediaRecord {
  counter += 1;
  return {
    id: `seed:track:fixture-${counter}`,
    domain: "MUSIC",
    mediaType: "TRACK",
    title: `Fixture Track ${counter}`,
    subtitle: "Fixture Artist",
    album: "Fixtures",
    description: "A synthetic track used in tests.",
    imageUrl: null,
    externalUrl: null,
    releaseDate: new Date("2024-01-01"),
    releaseYear: 2024,
    popularity: 50,
    rating: null,
    voteCount: null,
    runtimeMin: null,
    seasons: null,
    episodes: null,
    language: "en",
    adult: false,
    genres: ["pop"],
    moods: ["upbeat"],
    themes: ["testing"],
    tags: [],
    energy: 0.8,
    danceability: 0.7,
    valence: 0.8,
    acousticness: null,
    tempo: 120,
    tone: null,
    pacing: null,
    intensity: null,
    source: "seed",
    raw: null,
    ...overrides,
  };
}
