# Curated: Semantic Media Discovery

An agent-orchestrated retrieval engine and deterministic ranking pipeline for
personal music, film, and television curation. A LangChain.js agent chain
coordinates intent parsing, reference resolution, hybrid retrieval, and a
language-model explanation pass. A Next.js dashboard drives it. The reference
data covers a bundled catalogue of 211 real releases, extended at runtime from
Spotify and TMDB.

Supported on Node 20 and 22. The test suite runs against real PostgreSQL.

## Architecture

- **Frontend**: Next.js 15 (App Router, React 19), TypeScript strict, TailwindCSS v4.
- **Backend**: Next.js route handlers, fully async request path, typed response envelope.
- **Orchestration**: LangChain.js agent chain with a conditional degraded path and deterministic fallbacks at every stage.
- **Language model**: `@langchain/ollama` `ChatOllama`, called with a hard timeout and bounded retries.
- **Embeddings**: `nomic-embed-text` at 768 dimensions, with a deterministic hashing vectoriser as fallback.
- **Database**: PostgreSQL 16 with pgvector via Drizzle ORM (PGlite, the same Postgres compiled to WebAssembly, for tests).
- **Migrations**: Drizzle Kit, plain SQL, applied explicitly and verified against the ORM schema in the test suite.
- **Persistence of retrieval state**: none. Every search is stateless; only the results you save are durable.
- **Observability**: request correlation through `AsyncLocalStorage`, JSON logs, in-process span metrics, split health and metrics endpoints.
- **Deployment**: local process. No container runtime required.

### Authentication and the session

The browser never holds a signing secret. It holds an httpOnly cookie
containing a signed JWT, which JavaScript on the page cannot read. Session
verification happens twice: `src/middleware.ts` checks the signature before any
page renders, and each user-scoped route additionally confirms the account row
still exists in the database.

The two checks answer different questions. The middleware runs on the edge and
cannot reach the database, so it can only prove the token was signed by this
deployment. The server-side check proves the account has not since been
deleted. Without the second check, a token would outlive the account it names
and produce a foreign key error deep inside a service rather than a clean sign
in prompt.

`AUTH_SECRET` authenticates the *deployment*, not the algorithm. A signed token
is only as private as that value: publish it and anyone can mint a session for
any account id. In development an internal default applies, which is safe
because the server is reachable only from localhost. Production refuses to
start while it is unset or left at that default.

Sessions are stateless by choice. There is no session table to migrate and
nothing to clean up, but signing out clears the cookie rather than revoking a
token that has already been issued. For a single-user local application that is
the correct side of the trade. Put real revocation in front of this before
serving distinct tenants.

### Pipeline design

The pipeline is defined in `src/server/agents/`. Each stage receives its
dependencies explicitly, so no stage relies on module-level state and each is
unit testable. The flow is:

```
query -> parse -> resolve references -> apply filters -> retrieve -> rerank -> explain
            \                                                  /
             \-> heuristic parse (model unavailable) ----------/
```

Every stage has a defined behaviour when the stage it depends on is
unavailable, and the interface reports which path ran. State holds only
JSON-native values; Zod schemas validate every model response before it reaches
the rest of the system.

## Quickstart

1. Copy `.env.example` to `.env` and set at least `DATABASE_URL`. Add Spotify
   and TMDB keys to extend the catalogue beyond the bundled set (optional).
2. Run `npm install && npm run setup`.
3. Run `npm run dev` and open `http://localhost:3000`.

Without Ollama running, the app still works. The pipeline falls back to a
deterministic hashing embedder and a heuristic parser, and reports "Degraded
mode" rather than failing.

## Local development

Database:

```bash
brew services start postgresql@16
psql -d curated -c "CREATE EXTENSION IF NOT EXISTS vector"
npm run db:migrate
```

Models, in a separate terminal:

```bash
ollama serve
ollama pull llama3.1:8b
ollama pull nomic-embed-text
```

Application:

```bash
npm install
npm run setup                        # migrate, ingest, embed, seed an account
npm run dev                          # serves on :3000
```

## Configuration

Every variable is validated at boot in `src/server/config/env.ts`. An empty
string is treated as unset and the documented default applies.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://curated:curated@localhost:5432/curated` | Postgres connection. The database must have pgvector. |
| `AUTH_SECRET` | internal dev value | Signs the session cookie. Production refuses to start at the default. |
| `JOB_TOKEN` | internal dev value | Required as `x-job-token` on `POST /api/jobs/:name`. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Model host. |
| `OLLAMA_CHAT_MODEL` | `llama3.1:8b` | Chat model name. |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Recorded on every stored vector. Changing it invalidates the catalogue. |
| `EMBEDDING_DIMENSIONS` | `768` | Must match the `vector(N)` column in the migration. |
| `SPOTIFY_CLIENT_ID` | empty | Enables live music ingestion. |
| `SPOTIFY_CLIENT_SECRET` | empty | Paired with the client id. |
| `TMDB_API_KEY` | empty | Enables live film and television ingestion. |
| `VECTOR_TOP_K` | `40` | Candidates retrieved before ranking. |
| `VECTOR_MIN_SCORE` | `0.15` | Soft preference, not a hard cutoff. Thin results widen rather than empty. |
| `HYBRID_VECTOR_WEIGHT` | `0.6` | Weight of cosine similarity in the blend. |
| `HYBRID_KEYWORD_WEIGHT` | `0.25` | Weight of Postgres full-text rank. |
| `HYBRID_POPULARITY_WEIGHT` | `0.15` | Weight of the popularity prior. |
| `RERANK_CANDIDATES` | `24` | Shortlist size handed to the reranker. |
| `RESULT_LIMIT` | `20` | Results returned per search. |
| `LLM_TIMEOUT_MS` | `45000` | Hard ceiling on any single model call. |
| `DISABLE_LLM` | `false` | Forces the deterministic path. Used by the test suite. |

## Catalogue and providers

Reference data is bundled at `src/data/` and loaded into the database by
`npm run seed`. Items are matched by a namespaced id (`source:kind:externalId`)
and updated in place, so a corrected description reaches an existing
installation on the next ingestion. Rows you added yourself that are not in the
bundled data are left untouched.

The frontend never hardcodes catalogue contents; genres and prompts come from
`src/data/categories.ts`, which the same agents use for matching, so the
interface cannot drift from what the retrieval layer actually recognises.

Bundled catalogue: **128 music tracks** and **83 films and series**, 211 items
in total, each with hand-written descriptive metadata covering genre, mood,
theme, energy, tempo, pacing, and intended use.

Live providers extend this. Spotify supplies tracks with audio features; TMDB
supplies films and series with ratings and runtimes. Neither is required: with
no keys set, every feature works against the bundled set, and artwork is
generated locally from each item's identity rather than fetched.

## The retrieval model

The ranking engine is a **hybrid relevance calculator**. It is explicitly not a
recommender system in the collaborative-filtering sense: it knows nothing about
what other people liked, because there are no other people. A high score means
the item matches the stated request and your own recorded behaviour, nothing
more.

What the model accounts for:

| Signal | Treatment |
| --- | --- |
| Semantic similarity | Cosine distance between the query embedding and the item embedding, weighted `0.6`. |
| Lexical match | Postgres full-text rank over the enriched document, weighted `0.25`. |
| Popularity | Provider popularity as a prior, weighted `0.15`. Suppressed entirely when the query implies obscurity. |
| Reference traits | Overlap with the traits of a named artist or title, decayed by position as `1 / (1 + index mod 6)` so the strongest traits dominate. |
| Learned affinity | Facet scores from your own history, weighted genre `1.0`, mood `0.6`, theme `0.4`. |
| Structured filters | Enforced in SQL after scoring, not suggested to the model. |

All five scored signals are min-max normalised before blending, so one signal's
raw scale cannot dominate another's.

Affinity is accumulated per facet from recorded events: a save scores `+1.0`,
a watch `+0.8`, an open `+0.25`, a dismissal `-0.6`, a removal `-0.8`. Scores
decay by a factor of `0.98` per update and are dropped below an absolute value
of `0.05`, so old preferences fade rather than accumulating forever.

The choices above are deliberately conservative where the model is uncertain:
filters are enforced by the database rather than trusted to the model, the
reranker may only reorder ids it was given, and a low-confidence semantic match
widens the candidate pool rather than returning an empty page.

### Data provenance

Each catalogue field is published, derived, or authored:

- Published: title, artist or director, release date, runtime, popularity, and
  rating, from Spotify and TMDB where keys are configured.
- Derived: the enriched document that gets embedded, assembled from the
  structured fields; and the content hash, `sha256(document + model name)`.
- Authored: for the 211 bundled items, every descriptive field. Genre, mood,
  theme, energy, tempo, pacing, and intended use were written by hand to be
  plausible and internally consistent, not measured or sourced from the
  providers.

Two caveats before treating results as authoritative. First, the bundled
descriptive metadata is editorial judgment, so a mood or energy value reflects
one writer's reading of a track rather than an acoustic measurement. Spotify's
own audio features are used when live ingestion is configured and are more
defensible. Second, the popularity prior is provider-relative: Spotify
popularity and TMDB vote counts are not on the same scale, and no attempt is
made to reconcile them across domains. They are normalised within a result set
only.

The hashing fallback embedder deserves its own warning. It captures lexical
overlap and nothing else, so results generated in degraded mode are keyword
matching wearing the interface of semantic search. It is tagged as its own
model (`hash-fallback-v1`) precisely so those vectors are replaced rather than
silently trusted, and the interface labels every degraded result.

Embedding model isolation is enforced, not advisory. Vectors carry the name of
the model that produced them, and the store refuses to compare vectors from
different models. If the catalogue was embedded by `nomic-embed-text` and a
search arrives embedded by `hash-fallback-v1`, the correct number of semantic
hits is zero, and that is what you get, until `npm run embed` brings them back
into agreement.

## API

### Operations

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Checks the database, pgvector, Ollama, and both providers independently. |
| `GET` | `/api/metrics` | Per-span counts, error rates, and p50 and p95 latency for routes, retrieval, model calls, and jobs. |
| `POST` | `/api/jobs/:name` | Triggers a background job. Requires header `x-job-token`. |

### Discovery

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/music/search` | Semantic music search. `?q=&limit=` |
| `GET` | `/api/movies/search` | Semantic film and television search. |
| `GET` | `/api/music/trending` | Popularity-ranked music. |
| `GET` | `/api/movies/trending` | Popularity-ranked film and television. |

### Collections

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` `POST` | `/api/playlists`, `/api/bucket-lists` | List and create. |
| `GET` `PUT` `DELETE` | `/api/playlists/:id` | Read, rename, delete. |
| `POST` | `/api/playlists/:id/items` | Add catalogue items. |
| `PUT` `DELETE` | `/api/playlists/:id/items/:itemId` | Reorder, annotate, remove. |

Every response carries the same envelope and an `x-request-id` header. Supply
your own to correlate a client trace with server logs; one is generated when
absent.

```jsonc
{ "ok": true,  "data": { }, "requestId": "req_..." }
{ "ok": false, "error": { "code": "...", "message": "..." }, "requestId": "req_..." }
```

Error codes are stable and machine-readable. Messages are written for a person
reading a toast, and never contain a connection string, token, or key.

### Degraded results

When Ollama cannot be reached, the pipeline proceeds with deterministic
fallbacks rather than failing the request, but it never presents them as full
quality. The response carries `degraded: true`, the stage panel names which
substitutions ran, and the dashboard renders a "Degraded mode" badge. Treat any
degraded result as lexical rather than semantic.

The same applies to providers: when Spotify or TMDB is unreachable, the bundled
catalogue serves the request and live widening returns empty rather than
raising.

## Testing and quality gates

```bash
npm run typecheck                    # tsc --noEmit
npm run lint                         # ESLint across app, server, and tests
npm test                             # 122 tests, real Postgres via PGlite
npm run build                        # production build
```

The test database is not a mock and not a container. PGlite is a full Postgres
build compiled to WebAssembly with pgvector available, so the same migrations,
the same `<=>` cosine operator, and the same full-text SQL execute in process.
Only the driver differs from production.

`DISABLE_LLM=1` keeps every suite deterministic. Model-specific behaviour, JSON
repair and hallucinated-id rejection, is tested directly against those units
rather than through a live model.

Coverage by area: authentication (hashing, sessions, tampered tokens,
enumeration resistance), agents (parsing, structured output repair, id
rejection), retrieval (hybrid scoring, reference overlap, embedding model
isolation), collections (full CRUD, reordering, cross-account isolation),
preferences, catalogue (enrichment, content hashing, idempotent ingestion),
charts, providers (retries, backoff, fallback), and the API envelope.

## Coding standards

TypeScript strict throughout, with no suppressions in domain code. Every module
carries a header comment stating what it is for and, where a choice was not
obvious, why it was made rather than the alternative. Errors are a closed
taxonomy in `src/server/lib/errors.ts`: every failure the API can return is one
of a fixed set of codes with an HTTP status and a message safe to display.

Narrow, documented exceptions: one cast where a bound LangChain runnable is
narrowed to the interface the structured-output layer consumes, and the test
helpers use a driver cast to substitute PGlite for `node-postgres`.

## Project structure

```
src/
  middleware.ts       the auth gate, runs before every page renders
  app/
    page.tsx          search, both catalogues behind one toggle
    login/            sign in and registration
    playlists/        music collections
    bucket-lists/     film and television collections
    api/              20 route handlers
  components/
    layout/           shell, navigation, theme, account
    search/           search bar, collapsible filters, stage panel
    media/            cards, shelves, generated artwork, explanations
    providers/        theme, toasts, save sheet
    ui/               buttons, fields, dialogs
  server/
    agents/           query parser, music and movie agents, reranker
    ai/               Ollama clients, structured output with one repair round
    auth/             scrypt password hashing, signed JWT sessions
    vector/           embeddings, store, hybrid retrieval
    providers/        Spotify, TMDB, bundled seed, retrying HTTP client
    services/         playlists, watchlists, preferences, charts, catalogue
    db/               Drizzle schema and connection
    http/             route wrapper, validation schemas
    jobs/             ingestion, embedding backfill, chart refresh
    lib/              error taxonomy, structured logging, ids
  data/               bundled catalogue and category definitions
  lib/                typed API client, formatting, shared types
drizzle/              versioned SQL migrations
tests/                unit, service, retrieval, and API tests
```

## Operational notes

- **Migrations are not run automatically on boot.** Run `npm run db:migrate` as
  an explicit step after pulling changes that add one. They are idempotent.
  Skipping this is the single most common cause of an opaque 500: a missing
  column surfaces as SQLSTATE `42703`, which the error layer translates into
  the command that fixes it.
- **Jobs are per process.** `npm run scheduler` is a simple in-process loop, not
  a distributed scheduler. Two copies running will duplicate work. Use one, or
  drive `POST /api/jobs/:name` from your own scheduler.
- **Metrics are per process too.** The counters live in memory and reset when
  the process restarts. They are a local diagnostic, not a time series.
- **Embedding changes invalidate the catalogue.** Changing
  `OLLAMA_EMBED_MODEL` or the provider marks every stored vector stale by
  design. Run `npm run embed` afterwards; searching before you do returns
  nothing semantically.
- **Bundled descriptive metadata is editorial.** See Data provenance. Configure
  Spotify and TMDB keys and run `npm run ingest` before treating mood or energy
  values as anything but plausible.

## Known limitations

- **Ingestion has not been verified end to end against live providers.** A
  catalogue that reads exactly 211 items is the bundled set untouched, which
  means `npm run ingest` either has not run or wrote nothing. Confirm with
  `select source, count(*) from media_items group by 1;` before assuming live
  data is present.
- **No per-user rate limiting.** Any signed-in caller can issue searches as
  fast as the model answers. This is correct for a local single-user
  application and wrong for anything shared.
- **Registration is open.** Anyone who can reach the server can create an
  account. On localhost that is only you. Close it before exposing the app.
- **The popularity prior favours what providers already promote.** Nothing in
  the ranking counteracts that, so a search with weak semantic signal drifts
  toward the mainstream. Queries implying obscurity suppress the prior
  entirely, but that detection is keyword-based and imperfect.
- **Reranker quality is bounded by an 8B model.** It reorders competently and
  explains plausibly, but its explanations are post-hoc narration of a ranking
  the deterministic layer produced, not the reasoning that produced it.

## License

Unlicensed sample application. The bundled catalogue references real artists
and titles for demonstration purposes; artwork is generated locally rather than
copied, and live provider data is subject to Spotify's and TMDB's terms.
