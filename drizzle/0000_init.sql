-- pgvector must exist before media_items declares a vector(768) column.
-- Requires the extension to be available on the server (the pgvector/pgvector
-- Docker image in docker-compose.yml ships it).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."collection_source" AS ENUM('MANUAL', 'AI', 'SEARCH');--> statement-breakpoint
CREATE TYPE "public"."domain" AS ENUM('MUSIC', 'VIDEO');--> statement-breakpoint
CREATE TYPE "public"."event_action" AS ENUM('SHOWN', 'OPENED', 'SAVED', 'REMOVED', 'DISMISSED', 'WATCHED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('RUNNING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('TRACK', 'MOVIE', 'SERIES');--> statement-breakpoint
CREATE TABLE "bucket_list_items" (
	"id" text PRIMARY KEY NOT NULL,
	"bucket_list_id" text NOT NULL,
	"media_id" text,
	"media_type" "media_type" NOT NULL,
	"position" integer NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"watched_at" timestamp with time zone,
	"note" text,
	"snapshot" jsonb NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bucket_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "collection_source" DEFAULT 'MANUAL' NOT NULL,
	"seed_query" text,
	"accent" text DEFAULT 'amber' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"media_id" text,
	"rank" integer NOT NULL,
	"previous_rank" integer,
	"movement" integer,
	"is_new_entry" boolean DEFAULT false NOT NULL,
	"peak_rank" integer,
	"weeks_on_chart" integer DEFAULT 1 NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chart_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"chart_id" text NOT NULL,
	"period" text NOT NULL,
	"label" text NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "job_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"processed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"error" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" text PRIMARY KEY NOT NULL,
	"domain" "domain" NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"album" text,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"external_url" text,
	"release_date" timestamp with time zone,
	"release_year" integer,
	"popularity" double precision DEFAULT 0 NOT NULL,
	"rating" double precision,
	"vote_count" integer,
	"runtime_min" integer,
	"seasons" integer,
	"episodes" integer,
	"language" text DEFAULT 'en' NOT NULL,
	"adult" boolean DEFAULT false NOT NULL,
	"genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"moods" text[] DEFAULT '{}'::text[] NOT NULL,
	"themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"energy" double precision,
	"danceability" double precision,
	"valence" double precision,
	"acousticness" double precision,
	"tempo" double precision,
	"tone" text,
	"pacing" text,
	"intensity" text,
	"document" text DEFAULT '' NOT NULL,
	"content_hash" text DEFAULT '' NOT NULL,
	"embedding" vector(768),
	"embedded_at" timestamp with time zone,
	"embed_model" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"raw" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"playlist_id" text NOT NULL,
	"media_id" text,
	"position" integer NOT NULL,
	"note" text,
	"snapshot" jsonb NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playlists" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" "collection_source" DEFAULT 'MANUAL' NOT NULL,
	"seed_query" text,
	"accent" text DEFAULT 'violet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"domain" "domain" NOT NULL,
	"media_id" text,
	"media_type" "media_type",
	"action" "event_action" NOT NULL,
	"query" text,
	"score" double precision,
	"position" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_history" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"domain" "domain" NOT NULL,
	"query" text NOT NULL,
	"parsed" jsonb,
	"result_count" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"personalization_enabled" boolean DEFAULT true NOT NULL,
	"favorite_music_genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"favorite_video_genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"favorite_moods" text[] DEFAULT '{}'::text[] NOT NULL,
	"avoided_genres" text[] DEFAULT '{}'::text[] NOT NULL,
	"languages" text[] DEFAULT '{"en"}'::text[] NOT NULL,
	"max_runtime_minutes" integer,
	"family_friendly_only" boolean DEFAULT false NOT NULL,
	"preferred_tone" text,
	"affinity" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bucket_list_items" ADD CONSTRAINT "bucket_list_items_bucket_list_id_bucket_lists_id_fk" FOREIGN KEY ("bucket_list_id") REFERENCES "public"."bucket_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bucket_list_items" ADD CONSTRAINT "bucket_list_items_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bucket_lists" ADD CONSTRAINT "bucket_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_entries" ADD CONSTRAINT "chart_entries_snapshot_id_chart_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."chart_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chart_entries" ADD CONSTRAINT "chart_entries_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_playlist_id_playlists_id_fk" FOREIGN KEY ("playlist_id") REFERENCES "public"."playlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_items" ADD CONSTRAINT "playlist_items_media_id_media_items_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bucket_list_items_list_media_key" ON "bucket_list_items" USING btree ("bucket_list_id","media_id");--> statement-breakpoint
CREATE INDEX "bucket_list_items_list_position_idx" ON "bucket_list_items" USING btree ("bucket_list_id","position");--> statement-breakpoint
CREATE INDEX "bucket_lists_user_updated_idx" ON "bucket_lists" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_entries_snapshot_media_key" ON "chart_entries" USING btree ("snapshot_id","media_id");--> statement-breakpoint
CREATE INDEX "chart_entries_snapshot_rank_idx" ON "chart_entries" USING btree ("snapshot_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "chart_snapshots_chart_period_key" ON "chart_snapshots" USING btree ("chart_id","period");--> statement-breakpoint
CREATE INDEX "chart_snapshots_chart_generated_idx" ON "chart_snapshots" USING btree ("chart_id","generated_at");--> statement-breakpoint
CREATE INDEX "job_runs_name_started_idx" ON "job_runs" USING btree ("name","started_at");--> statement-breakpoint
CREATE INDEX "media_items_domain_type_idx" ON "media_items" USING btree ("domain","media_type");--> statement-breakpoint
CREATE INDEX "media_items_domain_popularity_idx" ON "media_items" USING btree ("domain","popularity");--> statement-breakpoint
CREATE INDEX "media_items_content_hash_idx" ON "media_items" USING btree ("content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "playlist_items_playlist_media_key" ON "playlist_items" USING btree ("playlist_id","media_id");--> statement-breakpoint
CREATE INDEX "playlist_items_playlist_position_idx" ON "playlist_items" USING btree ("playlist_id","position");--> statement-breakpoint
CREATE INDEX "playlists_user_updated_idx" ON "playlists" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "recommendation_events_user_created_idx" ON "recommendation_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "recommendation_events_media_idx" ON "recommendation_events" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "search_history_user_created_idx" ON "search_history" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");
--> statement-breakpoint
-- Approximate-nearest-neighbour index for cosine distance. HNSW gives better
-- recall/latency than ivfflat and needs no training pass, which matters when the
-- catalogue is small on first run and grows afterwards.
CREATE INDEX IF NOT EXISTS "media_items_embedding_hnsw_idx" ON "media_items" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
-- Full-text index backing the keyword half of hybrid retrieval.
CREATE INDEX IF NOT EXISTS "media_items_fts_idx" ON "media_items" USING gin ((
  setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('english', coalesce("subtitle", '')), 'B') ||
  setweight(to_tsvector('english', coalesce("document", '')), 'C')
));
