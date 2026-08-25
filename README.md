# Curated

Semantic discovery and curation for music, film, and TV. You describe what you
want in ordinary language, for example "energetic pop like Dua Lipa for a
workout" or "a short thriller I can finish tonight". An agent pipeline reads
the intent, searches a locally embedded catalogue, ranks the results, and
explains why each one is there. What you like, you save into playlists and
watchlists.

Everything runs on your own machine. Postgres holds the data, Ollama runs the
language model, and no request leaves your network except to Spotify and TMDB
for catalogue data.

## Access model: one account, one database

The app is single-tenant and local. There is one Postgres database and one
Next.js process serving both the pages and the API.

Everyone signs in. Accounts are created from the sign-in page and everything
you curate is scoped to the account that created it. There is no shared or
anonymous mode: an unauthenticated request to a page is redirected to the
sign-in form, and an unauthenticated request to the API is refused with a
typed 401.

| | Signed out | Signed in |
|---|---|---|
| See any page | No, redirected to sign in | Yes |
| Search the catalogue | No | Yes |
| Create playlists and watchlists | No | Yes |
| See another account's collections | No | No |

Access is enforced on the server, not just in the UI. `src/middleware.ts`
gates every page before it renders, and every user-scoped route resolves the
caller from the session cookie rather than trusting anything the client sends.

## Roles

There is one role: the owner of an account. Collections, preferences, and
search history all belong to a single account, and no account can read
another's. The `user_id` column is present on every owned table, so a second
role could be added later without reshaping the schema.

## Tabs

- **Search** The landing page. One field for a plain-language request, a
  toggle between songs and movies or series, collapsible dropdown filters, and
  a panel showing how the results were found.
- **My Song Playlists** Music collections. Create, rename, reorder, remove.
- **Movies & Series Lists** The same for film and TV.

Sign-out and the day or night theme toggle live in the sidebar.

## Run locally

Prerequisites: Node 20 or newer, and PostgreSQL 16 or newer with the pgvector
extension. Ollama is optional but strongly recommended.

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Create your environment file and fill it in:
   ```bash
   cp .env.example .env
   ```
   Only `DATABASE_URL` is required. Spotify and TMDB keys are optional, and
   the app runs on a bundled catalogue without them.
3. Make sure Postgres is running and `DATABASE_URL` points at it, for example
   `postgresql://curated:curated@localhost:5432/curated`.
4. Confirm pgvector is present on that database before going further:
   ```bash
   psql "$DATABASE_URL" -c "SELECT extversion FROM pg_extension WHERE extname='vector'"
   ```
   This must print a version number. If it prints nothing, see
   [Installing pgvector](#installing-pgvector).
5. Pull the models, in a separate terminal:
   ```bash
   ollama pull llama3.1:8b
   ollama pull nomic-embed-text
   ```

### First run

```bash
# Terminal 1: Ollama
ollama serve

# Terminal 2: schema, catalogue, embeddings, first chart, an account
npm run setup

# then
npm run dev
```

Open `http://localhost:3000`. `npm run setup` prints an account you can sign
in with immediately, and creates a sample playlist and two watchlists so the
first screen is not empty. You can also create your own account from the
sign-in page.

### Day to day

Once set up, starting the app is two commands:

```bash
ollama serve      # terminal 1, if it is not already running
npm run dev       # terminal 2
```

### Production-style local build

```bash
npm run build && npm start      # http://localhost:3000
```

This runs in production mode, which enforces the secret checks described under
[Required variables](#required-variables). Set `AUTH_SECRET` and `JOB_TOKEN` to
any random strings first, or the process refuses to start.

### Tests and linting

```bash
npm test        # 122 unit tests against real Postgres, compiled to WebAssembly
npm run lint    # ESLint across the app, server, and tests
```

The test suite needs no database of its own and no Docker. PGlite is a full
Postgres build with pgvector, so the same migrations, the same cosine
operator, and the same full-text SQL run in process.

## Required variables

| Variable | Value |
|---|---|
| `DATABASE_URL` | Postgres connection string. The database must have pgvector |

Nothing else is required to run locally.

## Required in production only

These have development defaults that work locally. Running with
`NODE_ENV=production` while they are unset, empty, or left at their defaults
stops the process at boot with a message naming the fix.

| Variable | Value |
|---|---|
| `AUTH_SECRET` | 16+ random characters for signing the session cookie. `openssl rand -base64 32` |
| `JOB_TOKEN` | Shared secret for `POST /api/jobs/:name`, sent as `x-job-token` |

## Recommended variables

| Variable | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | Enables live music ingestion. Blank uses the bundled catalogue |
| `SPOTIFY_CLIENT_SECRET` | Paired with the client ID |
| `TMDB_API_KEY` | Enables live film and TV ingestion. Blank uses the bundled catalogue |
| `OLLAMA_BASE_URL` | Defaults to `http://localhost:11434` |
| `OLLAMA_CHAT_MODEL` | Defaults to `llama3.1:8b` |
| `OLLAMA_EMBED_MODEL` | Defaults to `nomic-embed-text`. Recorded on every stored vector |
| `EMBEDDING_DIMENSIONS` | `768`. Must match the `vector(N)` column in the migration |
| `VECTOR_TOP_K` | Candidates fetched before ranking. Defaults to `40` |
| `HYBRID_VECTOR_WEIGHT` | Vector, keyword, and popularity weights. Default `0.6 / 0.25 / 0.15` |
| `RESULT_LIMIT` | Results returned per search. Defaults to `20` |
| `DISABLE_LLM` | `1` forces the deterministic path. Used by the test suite |

### Notes

- Every value is validated at boot in `src/server/config/env.ts`. An empty
  string is treated as unset and the documented default applies.
- Secrets live in `.env`, which is gitignored. Nothing is hard coded.
- Migrations are not automatic. Run `npm run db:migrate` after pulling changes
  that add one. They are idempotent, so running them twice is safe.
- There is no Docker setup. Postgres runs natively on your machine.

## Installing pgvector

### macOS with Homebrew

```bash
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

createuser -s curated
createdb -O curated curated
psql -d curated -c "ALTER ROLE curated PASSWORD 'curated'"
brew install pgvector
psql -d curated -c "CREATE EXTENSION IF NOT EXISTS vector"
```

**The version trap.** Homebrew's `pgvector` formula builds against whatever
`postgresql` currently resolves to, which may be a different major version
than the one you are running. The symptom is `extension "vector" is not
available` even though the install reported success, because the extension
landed in another version's directory. Build it against the right server
explicitly:

```bash
git clone --branch v0.8.0 https://github.com/pgvector/pgvector.git /tmp/pgvector
cd /tmp/pgvector
make PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
make install PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config
```

### Debian or Ubuntu

```bash
sudo apt install postgresql-16 postgresql-16-pgvector
sudo -u postgres createuser -s curated
sudo -u postgres createdb -O curated curated
sudo -u postgres psql -d curated -c "CREATE EXTENSION IF NOT EXISTS vector"
```

## Architecture

```
Next.js App Router (React 19)
  src/middleware.ts      the auth gate, runs before every page
  src/app/               search, playlists, watchlists, sign in
  src/app/api/           20 route handlers, typed response envelope

Server (src/server/)
  auth/         scrypt password hashing, signed JWT sessions
  agents/       query parser, music and movie agents, reranker
  ai/           Ollama clients, structured output with one repair round
  vector/       embeddings, store, hybrid retrieval
  providers/    Spotify, TMDB, bundled seed catalogue, HTTP client
  services/     playlists, watchlists, preferences, charts, catalogue
  jobs/         ingestion, embedding backfill, chart refresh
  lib/          error taxonomy, structured logging, ids

PostgreSQL 16 + pgvector      Ollama (chat and embeddings)
```

The schema is created by migrations in `drizzle/`, applied with
`npm run db:migrate`. Every layer has a defined behaviour when the layer below
it is unavailable.

## Data notes

- The catalogue is a local cache. Items are fetched from Spotify and TMDB,
  enriched into a descriptive document, embedded, and stored. Collections
  reference catalogue rows rather than copying them, so an item enriched later
  improves every list it appears in.
- Each item is hashed by content plus embedding model name. Re-running
  ingestion skips unchanged items, so a second run costs seconds rather than
  minutes. Changing the embedding model invalidates every hash automatically,
  because the model name is part of the input.
- **Vectors from different embedding models are never compared.** Every stored
  vector is tagged with the model that produced it, and the store refuses to
  mix them. Mixing embedding spaces produces confident nonsense, which is
  worse than no result. If the catalogue was embedded by one model and a
  search arrives embedded by another, you get no semantic hits until
  `npm run embed` brings them back into agreement.
- When Ollama is unreachable, the app falls back to a deterministic hashing
  embedder, a heuristic query parser, and a metadata reranker. Search still
  returns results and the interface says "Degraded mode" rather than failing.
  The fallback is tagged as its own model, so those embeddings are replaced
  automatically once a real model is available.
- Filters set in the panel are enforced in SQL, not suggested to the model. A
  maximum runtime means nothing longer can appear, regardless of what the
  model would have chosen.
- The reranker may only reorder ids it was given. An id it invents is dropped
  rather than shown.
- Probability that a result matches your taste is learned from behaviour, not
  from a settings form. Saves, opens, removals, and dismissals are recorded in
  `recommendation_events` and become the affinity signal in ranking.
- Passwords are hashed with scrypt from Node's standard library, stored as
  `scrypt$N$r$p$salt$hash`. The parameters travel with the hash, so the cost
  can be raised later without invalidating existing accounts.
- Sessions are a signed JWT in an httpOnly cookie, valid for 30 days. Signing
  out clears the cookie. The account row is confirmed on every server request,
  so a deleted account cannot keep browsing on an unexpired token.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run setup` | Migrate, then seed the catalogue, chart, and an account |
| `npm run db:migrate` | Apply pending SQL migrations |
| `npm run db:studio` | Browse the database in Drizzle Studio |
| `npm run seed` | Catalogue, embeddings, first chart, sample collections |
| `npm run ingest` | Pull from Spotify and TMDB into the catalogue |
| `npm run embed` | Embed anything unembedded or stale |
| `npm run jobs:all` | Run every background job once |
| `npm run scheduler` | Simple in-process job loop |
| `npm test` | 122 unit tests |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

## Troubleshooting

**`ECONNREFUSED` on `npm run db:migrate`**
Postgres is not running. `brew services start postgresql@16`.

**`relation "users" does not exist`**
The schema was never created. Run `npm run db:migrate`.

**`column "password_hash" does not exist`, or sign-up returns a 500**
A migration is pending. Run `npm run db:migrate`. Accounts arrived in
`0001_auth.sql`, and without it registration has nowhere to write the hash.

**`extension "vector" is not available`**
pgvector was built against a different Postgres major version. See the version
trap above.

**Search says "Degraded mode"**
Ollama is unreachable or the model is not pulled. Run `ollama serve`, then
`ollama pull nomic-embed-text`, then `npm run embed`.

**Results are thin, or nothing matches**
Almost always an embedding model mismatch. `npm run embed` re-embeds
everything under the current model.

**Spotify keys are set but the catalogue is still 211 items**
Ingestion has not run, or it failed. Run `npm run ingest` and read the output,
then check what landed:
```sql
select source, count(*) from media_items group by 1;
```

**Anything else returning a 500**
`GET /api/health` reports the database, pgvector, Ollama, and both providers
independently. The server log prints one JSON object per request including the
error code and the full cause chain.

## Optional: hosted deployment

This build is local only and runs on Ollama. A separate copy, `curatorv2`,
adds a hosted model path (Groq for chat, Nomic for embeddings) so the same
codebase can run on a serverless host with no GPU. See its own README for the
deploy steps. Most local use does not need it.
