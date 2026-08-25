/**
 * Curated — database schema (Drizzle ORM / PostgreSQL + pgvector).
 *
 * Two concerns live here:
 *   1. Application state — users, preferences, playlists, bucket lists,
 *      search history, recommendation events.
 *   2. A local catalogue cache of media fetched from Spotify / TMDB, enriched
 *      with an LLM-friendly document and an embedding for semantic retrieval.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

import { EMBEDDING_DIMENSIONS } from "@/server/config/constants";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const domainEnum = pgEnum("domain", ["MUSIC", "VIDEO"]);
export const mediaTypeEnum = pgEnum("media_type", ["TRACK", "MOVIE", "SERIES"]);
export const collectionSourceEnum = pgEnum("collection_source", ["MANUAL", "AI", "SEARCH"]);
export const eventActionEnum = pgEnum("event_action", [
  "SHOWN",
  "OPENED",
  "SAVED",
  "REMOVED",
  "DISMISSED",
  "WATCHED",
]);
export const jobStatusEnum = pgEnum("job_status", ["RUNNING", "SUCCESS", "FAILED"]);

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    /**
     * Nullable on purpose. Rows the test suite creates to prove ownership
     * isolation never sign in; only rows created through registration carry a
     * hash, and a null hash can never match a password.
     */
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email)],
);

export const userPreferences = pgTable(
  "user_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    personalizationEnabled: boolean("personalization_enabled").notNull().default(true),
    favoriteMusicGenres: text("favorite_music_genres").array().notNull().default(sql`'{}'::text[]`),
    favoriteVideoGenres: text("favorite_video_genres").array().notNull().default(sql`'{}'::text[]`),
    favoriteMoods: text("favorite_moods").array().notNull().default(sql`'{}'::text[]`),
    avoidedGenres: text("avoided_genres").array().notNull().default(sql`'{}'::text[]`),
    languages: text("languages").array().notNull().default(sql`'{"en"}'::text[]`),
    maxRuntimeMinutes: integer("max_runtime_minutes"),
    familyFriendlyOnly: boolean("family_friendly_only").notNull().default(false),
    preferredTone: text("preferred_tone"),
    /** Learned affinity, e.g. { "video:genre:science fiction": 3.5 }. */
    affinity: jsonb("affinity").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_preferences_user_id_key").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Catalogue cache + embeddings
// ---------------------------------------------------------------------------

export const mediaItems = pgTable(
  "media_items",
  {
    /** Namespaced: "spotify:track:<id>", "tmdb:movie:<id>", "seed:track:<slug>". */
    id: text("id").primaryKey(),
    domain: domainEnum("domain").notNull(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    title: text("title").notNull(),
    /** Artist(s) for music, tagline for video. */
    subtitle: text("subtitle").notNull().default(""),
    album: text("album"),
    description: text("description").notNull().default(""),
    imageUrl: text("image_url"),
    externalUrl: text("external_url"),
    releaseDate: timestamp("release_date", { withTimezone: true }),
    releaseYear: integer("release_year"),
    popularity: doublePrecision("popularity").notNull().default(0),
    rating: doublePrecision("rating"),
    voteCount: integer("vote_count"),
    runtimeMin: integer("runtime_min"),
    seasons: integer("seasons"),
    episodes: integer("episodes"),
    language: text("language").notNull().default("en"),
    adult: boolean("adult").notNull().default(false),
    genres: text("genres").array().notNull().default(sql`'{}'::text[]`),
    moods: text("moods").array().notNull().default(sql`'{}'::text[]`),
    themes: text("themes").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Music audio features (0..1 unless noted). Null for video.
    energy: doublePrecision("energy"),
    danceability: doublePrecision("danceability"),
    valence: doublePrecision("valence"),
    acousticness: doublePrecision("acousticness"),
    tempo: doublePrecision("tempo"),
    // Video narrative descriptors. Null for music.
    tone: text("tone"),
    pacing: text("pacing"),
    intensity: text("intensity"),
    /** Enriched natural-language document that gets embedded. */
    document: text("document").notNull().default(""),
    /** sha256 of `document` — embeddings regenerate only when this changes. */
    contentHash: text("content_hash").notNull().default(""),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
    embedModel: text("embed_model"),
    source: text("source").notNull().default("seed"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_items_domain_type_idx").on(t.domain, t.mediaType),
    index("media_items_domain_popularity_idx").on(t.domain, t.popularity),
    index("media_items_content_hash_idx").on(t.contentHash),
  ],
);

// ---------------------------------------------------------------------------
// Music curation
// ---------------------------------------------------------------------------

export const playlists = pgTable(
  "playlists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    source: collectionSourceEnum("source").notNull().default("MANUAL"),
    /** The natural-language query the list came from, when AI-generated. */
    seedQuery: text("seed_query"),
    accent: text("accent").notNull().default("violet"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("playlists_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const playlistItems = pgTable(
  "playlist_items",
  {
    id: text("id").primaryKey(),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => playlists.id, { onDelete: "cascade" }),
    mediaId: text("media_id").references(() => mediaItems.id, { onDelete: "set null" }),
    position: integer("position").notNull(),
    note: text("note"),
    /** Denormalised track copy so saved lists render without the catalogue. */
    snapshot: jsonb("snapshot").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("playlist_items_playlist_media_key").on(t.playlistId, t.mediaId),
    index("playlist_items_playlist_position_idx").on(t.playlistId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Movie & series curation
// ---------------------------------------------------------------------------

export const bucketLists = pgTable(
  "bucket_lists",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    source: collectionSourceEnum("source").notNull().default("MANUAL"),
    seedQuery: text("seed_query"),
    accent: text("accent").notNull().default("amber"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bucket_lists_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const bucketListItems = pgTable(
  "bucket_list_items",
  {
    id: text("id").primaryKey(),
    bucketListId: text("bucket_list_id")
      .notNull()
      .references(() => bucketLists.id, { onDelete: "cascade" }),
    mediaId: text("media_id").references(() => mediaItems.id, { onDelete: "set null" }),
    mediaType: mediaTypeEnum("media_type").notNull(),
    position: integer("position").notNull(),
    watched: boolean("watched").notNull().default(false),
    watchedAt: timestamp("watched_at", { withTimezone: true }),
    note: text("note"),
    snapshot: jsonb("snapshot").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bucket_list_items_list_media_key").on(t.bucketListId, t.mediaId),
    index("bucket_list_items_list_position_idx").on(t.bucketListId, t.position),
  ],
);

// ---------------------------------------------------------------------------
// Charts (Top 50 and friends)
// ---------------------------------------------------------------------------

export const chartSnapshots = pgTable(
  "chart_snapshots",
  {
    id: text("id").primaryKey(),
    chartId: text("chart_id").notNull(),
    /** Calendar month the snapshot belongs to, "YYYY-MM". */
    period: text("period").notNull(),
    label: text("label").notNull(),
    source: text("source").notNull().default("seed"),
    itemCount: integer("item_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("chart_snapshots_chart_period_key").on(t.chartId, t.period),
    index("chart_snapshots_chart_generated_idx").on(t.chartId, t.generatedAt),
  ],
);

export const chartEntries = pgTable(
  "chart_entries",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => chartSnapshots.id, { onDelete: "cascade" }),
    mediaId: text("media_id").references(() => mediaItems.id, { onDelete: "set null" }),
    rank: integer("rank").notNull(),
    previousRank: integer("previous_rank"),
    /** Positive = climbed, negative = fell, null = new entry. */
    movement: integer("movement"),
    isNewEntry: boolean("is_new_entry").notNull().default(false),
    peakRank: integer("peak_rank"),
    weeksOnChart: integer("weeks_on_chart").notNull().default(1),
    score: doublePrecision("score").notNull().default(0),
    snapshot: jsonb("snapshot").notNull(),
  },
  (t) => [
    uniqueIndex("chart_entries_snapshot_media_key").on(t.snapshotId, t.mediaId),
    index("chart_entries_snapshot_rank_idx").on(t.snapshotId, t.rank),
  ],
);

// ---------------------------------------------------------------------------
// Behaviour signals
// ---------------------------------------------------------------------------

export const searchHistory = pgTable(
  "search_history",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    domain: domainEnum("domain").notNull(),
    query: text("query").notNull(),
    /** Structured preferences the query parser extracted. */
    parsed: jsonb("parsed"),
    resultCount: integer("result_count").notNull().default(0),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("search_history_user_created_idx").on(t.userId, t.createdAt)],
);

export const recommendationEvents = pgTable(
  "recommendation_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    domain: domainEnum("domain").notNull(),
    mediaId: text("media_id"),
    mediaType: mediaTypeEnum("media_type"),
    action: eventActionEnum("action").notNull(),
    query: text("query"),
    score: doublePrecision("score"),
    position: integer("position"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recommendation_events_user_created_idx").on(t.userId, t.createdAt),
    index("recommendation_events_media_idx").on(t.mediaId),
  ],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    status: jobStatusEnum("status").notNull().default("RUNNING"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    processed: integer("processed").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    error: text("error"),
    detail: jsonb("detail"),
  },
  (t) => [index("job_runs_name_started_idx").on(t.name, t.startedAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ one, many }) => ({
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId],
  }),
  playlists: many(playlists),
  bucketLists: many(bucketLists),
  searches: many(searchHistory),
  events: many(recommendationEvents),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, { fields: [userPreferences.userId], references: [users.id] }),
}));

export const playlistsRelations = relations(playlists, ({ one, many }) => ({
  user: one(users, { fields: [playlists.userId], references: [users.id] }),
  items: many(playlistItems),
}));

export const playlistItemsRelations = relations(playlistItems, ({ one }) => ({
  playlist: one(playlists, { fields: [playlistItems.playlistId], references: [playlists.id] }),
  media: one(mediaItems, { fields: [playlistItems.mediaId], references: [mediaItems.id] }),
}));

export const bucketListsRelations = relations(bucketLists, ({ one, many }) => ({
  user: one(users, { fields: [bucketLists.userId], references: [users.id] }),
  items: many(bucketListItems),
}));

export const bucketListItemsRelations = relations(bucketListItems, ({ one }) => ({
  bucketList: one(bucketLists, {
    fields: [bucketListItems.bucketListId],
    references: [bucketLists.id],
  }),
  media: one(mediaItems, { fields: [bucketListItems.mediaId], references: [mediaItems.id] }),
}));

export const chartSnapshotsRelations = relations(chartSnapshots, ({ many }) => ({
  entries: many(chartEntries),
}));

export const chartEntriesRelations = relations(chartEntries, ({ one }) => ({
  chartSnapshot: one(chartSnapshots, {
    fields: [chartEntries.snapshotId],
    references: [chartSnapshots.id],
  }),
  media: one(mediaItems, { fields: [chartEntries.mediaId], references: [mediaItems.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserPreferenceRow = typeof userPreferences.$inferSelect;
export type MediaItemRow = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type PlaylistRow = typeof playlists.$inferSelect;
export type PlaylistItemRow = typeof playlistItems.$inferSelect;
export type BucketListRow = typeof bucketLists.$inferSelect;
export type BucketListItemRow = typeof bucketListItems.$inferSelect;
export type ChartSnapshotRow = typeof chartSnapshots.$inferSelect;
export type ChartEntryRow = typeof chartEntries.$inferSelect;
export type SearchHistoryRow = typeof searchHistory.$inferSelect;
export type RecommendationEventRow = typeof recommendationEvents.$inferSelect;
export type JobRunRow = typeof jobRuns.$inferSelect;
