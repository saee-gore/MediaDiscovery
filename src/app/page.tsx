"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ListPlus, Music4, Sparkles, SlidersHorizontal, Tv } from "lucide-react";

import { MediaGrid } from "@/components/media/cards";
import { Shelf } from "@/components/media/shelf";
import { useCollections } from "@/components/providers/collections";
import { useToast } from "@/components/providers/toast";
import { AgentProgress, Notices } from "@/components/search/agent-progress";
import { SearchBar } from "@/components/search/search-bar";
import { Dialog } from "@/components/ui/dialog";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui/primitives";
import { MUSIC_PROMPTS, VIDEO_PROMPTS } from "@/data/categories";
import { api, errorMessage } from "@/lib/api";
import { cx } from "@/lib/format";
import { useRecentSearches, useResource } from "@/lib/hooks";
import type { DiscoveryResponse, MediaSummary, MediaType } from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Filter vocabulary                                                          */
/* -------------------------------------------------------------------------- */

const MUSIC_GENRES = [
  "pop", "rock", "hip-hop", "rap", "r&b", "indie", "electronic", "edm", "house",
  "jazz", "classical", "country", "latin", "k-pop", "bollywood", "afrobeats", "soul", "folk",
];

const MUSIC_MOODS = [
  "energetic", "upbeat", "calm", "melancholy", "romantic", "dark", "nostalgic",
  "confident", "dreamy", "playful",
];

const VIDEO_GENRES = [
  "science fiction", "thriller", "mystery", "crime", "drama", "comedy", "romance",
  "horror", "animation", "documentary", "action", "adventure", "fantasy", "history", "musical",
];

const VIDEO_MOODS = [
  "emotional", "thought-provoking", "tense", "warm", "funny", "dark", "gentle",
  "epic", "nostalgic", "atmospheric",
];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ko", label: "Korean" },
  { value: "ja", label: "Japanese" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "zh", label: "Chinese" },
];

/** Era presets, resolved to concrete year bounds at request time. */
const ERAS = [
  { value: "recent", label: "Last 3 years" },
  { value: "2020s", label: "2020s" },
  { value: "2010s", label: "2010s" },
  { value: "2000s", label: "2000s" },
  { value: "1990s", label: "1990s" },
  { value: "classic", label: "Before 2000" },
];

function eraBounds(era: string): { yearFrom: number | null; yearTo: number | null } {
  const year = new Date().getFullYear();
  switch (era) {
    case "recent":
      return { yearFrom: year - 3, yearTo: null };
    case "2020s":
      return { yearFrom: 2020, yearTo: 2029 };
    case "2010s":
      return { yearFrom: 2010, yearTo: 2019 };
    case "2000s":
      return { yearFrom: 2000, yearTo: 2009 };
    case "1990s":
      return { yearFrom: 1990, yearTo: 1999 };
    case "classic":
      return { yearFrom: null, yearTo: 1999 };
    default:
      return { yearFrom: null, yearTo: null };
  }
}

type Mode = "songs" | "screen";

interface Filters {
  genre: string;
  mood: string;
  era: string;
  // songs
  energy: string;
  // screen
  mediaType: string;
  runtime: string;
  rating: string;
  language: string;
}

const EMPTY: Filters = {
  genre: "",
  mood: "",
  era: "",
  energy: "",
  mediaType: "",
  runtime: "",
  rating: "",
  language: "",
};

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The search area — the app's landing surface.
 *
 * One page covers both catalogues. The toggle switches which one is being
 * searched, and the dropdown row changes with it, because the useful filters
 * genuinely differ: energy and tempo matter for a track, runtime and rating for
 * a film. Both halves feed the same pipeline.
 */
export default function SearchPage() {
  const { invalidate } = useCollections();
  const toast = useToast();

  const [mode, setMode] = useState<Mode>("songs");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [result, setResult] = useState<DiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters start collapsed: most searches are a sentence, and a wall of
  // dropdowns above the results is noise until you actually want to narrow.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [listDescription, setListDescription] = useState("");
  const [savingList, setSavingList] = useState(false);

  const { queries: recent, refresh: refreshRecent, clear: clearRecent } = useRecentSearches(true);

  const isSongs = mode === "songs";
  const trending = useResource<{ items: MediaSummary[] }>(
    isSongs ? "/api/music/trending?limit=14" : "/api/movies/trending?limit=14",
    [mode],
  );

  const activeFilterCount = useMemo(() => {
    const relevant: Array<keyof Filters> = isSongs
      ? ["genre", "mood", "era", "energy"]
      : ["genre", "mood", "era", "mediaType", "runtime", "rating", "language"];
    return relevant.filter((key) => filters[key]).length;
  }, [filters, isSongs]);

  const buildPreferences = useCallback(() => {
    const { yearFrom, yearTo } = eraBounds(filters.era);
    if (isSongs) {
      return {
        genres: filters.genre ? [filters.genre] : undefined,
        moods: filters.mood ? [filters.mood] : undefined,
        energy: (filters.energy || null) as "low" | "medium" | "high" | null,
        yearFrom,
        yearTo,
      };
    }
    return {
      mediaTypes: filters.mediaType ? [filters.mediaType as MediaType] : undefined,
      genres: filters.genre ? [filters.genre] : undefined,
      moods: filters.mood ? [filters.mood] : undefined,
      languages: filters.language ? [filters.language] : undefined,
      maxRuntimeMinutes: filters.runtime ? Number(filters.runtime) : null,
      minRating: filters.rating ? Number(filters.rating) : null,
      yearFrom,
      yearTo,
    };
  }, [filters, isSongs]);

  const run = useCallback(
    async (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      // Filters alone are a valid request. When nothing was typed, describe the
      // selections in words instead of sending filler — the phrase is what gets
      // embedded, so it needs to carry actual meaning.
      const described = [
        filters.energy && isSongs ? `${filters.energy} energy` : "",
        filters.mood,
        filters.genre,
        isSongs ? "music" : filters.mediaType === "SERIES" ? "series" : "films",
        filters.era ? `from the ${ERAS.find((e) => e.value === filters.era)?.label ?? filters.era}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();
      const effective =
        trimmed ||
        described ||
        (isSongs ? "something good to listen to" : "something worth watching");

      setQuery(trimmed);
      setLoading(true);
      setError(null);
      try {
        const data = await api.post<DiscoveryResponse>(
          isSongs ? "/api/music/search" : "/api/movies/search",
          { query: effective, preferences: buildPreferences(), limit: 24 },
        );
        setResult(data);
        void refreshRecent();
      } catch (requestError) {
        setError(errorMessage(requestError));
        setResult(null);
      } finally {
        setLoading(false);
      }
    },
    [isSongs, filters, buildPreferences, refreshRecent],
  );

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setResult(null);
    setError(null);
    setFilters(EMPTY);
  };

  const set = (key: keyof Filters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const saveResults = async () => {
    if (!result) return;
    setSavingList(true);
    try {
      const payload = {
        name: listName.trim() || result.query || (isSongs ? "New playlist" : "New collection"),
        description: listDescription.trim() || result.summary,
        source: "SEARCH" as const,
        seedQuery: result.query,
        mediaIds: result.results.slice(0, 50).map((item) => item.id),
      };
      if (isSongs) await api.post("/api/playlists", payload);
      else await api.post("/api/bucket-lists", payload);
      toast.success(
        isSongs ? "Playlist saved" : "Collection saved",
        `${result.results.length} ${isSongs ? "tracks" : "titles"} added.`,
      );
      invalidate();
      setSaveOpen(false);
      setListName("");
      setListDescription("");
    } catch (requestError) {
      toast.error("Couldn't save that", errorMessage(requestError));
    } finally {
      setSavingList(false);
    }
  };

  const showingResults = Boolean(result || loading || error);

  return (
    <div className="space-y-6">
      {/* Header + mode toggle ------------------------------------------- */}
      <header className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Search</h1>
          <p className="mt-1 text-sm text-muted">
            Describe what you&apos;re in the mood for, narrow it with the filters, or use
            either on its own.
          </p>
        </div>

        <div
          role="radiogroup"
          aria-label="What are you searching for?"
          className="inline-flex rounded-xl border border-line bg-surface p-1"
        >
          {([
            { value: "songs" as const, label: "Songs", icon: Music4 },
            { value: "screen" as const, label: "Movies & Series", icon: Tv },
          ]).map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={mode === option.value}
              onClick={() => switchMode(option.value)}
              className={cx(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                mode === option.value
                  ? "bg-accent text-accent-text"
                  : "text-muted hover:bg-surface-hover hover:text-ink",
              )}
            >
              <option.icon className="h-4 w-4" aria-hidden />
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {/* Search bar ------------------------------------------------------ */}
      <SearchBar
        value={query}
        onChange={setQuery}
        onSubmit={run}
        loading={loading}
        placeholders={isSongs ? MUSIC_PROMPTS : VIDEO_PROMPTS}
        suggestions={isSongs ? MUSIC_PROMPTS : VIDEO_PROMPTS}
        recent={recent}
        onClearRecent={() => void clearRecent()}
        label={isSongs ? "Describe the music you want" : "Describe what you want to watch"}
      />

      {/* Dropdown filters ------------------------------------------------ */}
      <section
        aria-label="Filters"
        className="rounded-xl border border-line bg-surface p-4"
      >
        <div className={cx("flex items-center justify-between gap-3", filtersOpen && "mb-3")}>
          <button
            type="button"
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls="filter-body"
            className="flex items-center gap-2 text-sm font-medium text-ink transition-opacity hover:opacity-80"
          >
            <SlidersHorizontal className="h-4 w-4 text-muted" aria-hidden />
            Filters
            {activeFilterCount > 0 ? <Badge tone="accent">{activeFilterCount}</Badge> : null}
            <ChevronDown
              className={cx("h-4 w-4 text-subtle transition-transform", filtersOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          <div className="flex items-center gap-2">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={() => setFilters(EMPTY)}
                className="text-xs text-subtle transition-colors hover:text-ink"
              >
                Clear
              </button>
            ) : null}
            {filtersOpen ? (
              <Button size="sm" variant="primary" onClick={() => void run(query)} loading={loading}>
                Apply
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
        <div id="filter-body" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {!isSongs ? (
            <Dropdown label="Type" value={filters.mediaType} onChange={(v) => set("mediaType", v)}>
              <option value="">Films and series</option>
              <option value="MOVIE">Films only</option>
              <option value="SERIES">Series only</option>
            </Dropdown>
          ) : null}

          <Dropdown label="Genre" value={filters.genre} onChange={(v) => set("genre", v)}>
            <option value="">Any genre</option>
            {(isSongs ? MUSIC_GENRES : VIDEO_GENRES).map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </Dropdown>

          <Dropdown label="Mood" value={filters.mood} onChange={(v) => set("mood", v)}>
            <option value="">Any mood</option>
            {(isSongs ? MUSIC_MOODS : VIDEO_MOODS).map((mood) => (
              <option key={mood} value={mood}>
                {mood}
              </option>
            ))}
          </Dropdown>

          {isSongs ? (
            <Dropdown label="Energy" value={filters.energy} onChange={(v) => set("energy", v)}>
              <option value="">Any energy</option>
              <option value="low">Low (calm)</option>
              <option value="medium">Medium</option>
              <option value="high">High (driving)</option>
            </Dropdown>
          ) : (
            <Dropdown label="Runtime" value={filters.runtime} onChange={(v) => set("runtime", v)}>
              <option value="">Any length</option>
              <option value="35">Up to 35 min</option>
              <option value="60">Up to 1 hour</option>
              <option value="100">Up to 100 min</option>
              <option value="130">Up to 2h 10</option>
            </Dropdown>
          )}

          <Dropdown label="Era" value={filters.era} onChange={(v) => set("era", v)}>
            <option value="">Any era</option>
            {ERAS.map((era) => (
              <option key={era.value} value={era.value}>
                {era.label}
              </option>
            ))}
          </Dropdown>

          {!isSongs ? (
            <>
              <Dropdown label="Rating" value={filters.rating} onChange={(v) => set("rating", v)}>
                <option value="">Any rating</option>
                {[6, 7, 7.5, 8, 8.5].map((value) => (
                  <option key={value} value={value}>
                    {value}+ / 10
                  </option>
                ))}
              </Dropdown>

              <Dropdown label="Language" value={filters.language} onChange={(v) => set("language", v)}>
                <option value="">Any language</option>
                {LANGUAGES.map((language) => (
                  <option key={language.value} value={language.value}>
                    {language.label}
                  </option>
                ))}
              </Dropdown>
            </>
          ) : null}
        </div>
        ) : null}
      </section>

      {/* Results --------------------------------------------------------- */}
      {showingResults ? (
        <section className="space-y-4" aria-live="polite">
          {error ? (
            <ErrorState message={error} onRetry={() => void run(query)} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="order-2 space-y-4 lg:order-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">
                        {query ? `Results for “${query}”` : "Filtered results"}
                      </h2>
                      {result && !loading ? (
                        <Badge>
                          {result.results.length} result{result.results.length === 1 ? "" : "s"}
                          {result.timings.total !== undefined ? ` in ${result.timings.total} ms` : ""}
                        </Badge>
                      ) : null}
                    </div>
                    {result?.summary ? (
                      <p className="mt-1 text-sm leading-relaxed text-muted">{result.summary}</p>
                    ) : null}
                  </div>
                  {result && result.results.length > 0 ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setListName(result.query);
                        setSaveOpen(true);
                      }}
                    >
                      <ListPlus className="h-4 w-4" aria-hidden />
                      {isSongs ? "Save as playlist" : "Save as collection"}
                    </Button>
                  ) : null}
                </div>

                {result?.notices.length ? <Notices notices={result.notices} /> : null}

                {loading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, index) => (
                      <div key={index}>
                        <Skeleton className={isSongs ? "aspect-square w-full" : "aspect-[2/3] w-full"} />
                        <Skeleton className="mt-2 h-3 w-3/4" />
                        <Skeleton className="mt-1.5 h-2.5 w-1/2" />
                      </div>
                    ))}
                  </div>
                ) : result && result.results.length > 0 ? (
                  <MediaGrid items={result.results} />
                ) : (
                  <EmptyState
                    icon={Sparkles}
                    title="No strong matches found"
                    description="Loosen one constraint: a wider genre, a longer runtime, or fewer filters."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setFilters(EMPTY);
                          setResult(null);
                          setQuery("");
                        }}
                      >
                        Clear everything
                      </Button>
                    }
                  />
                )}
              </div>

              <aside className="order-1 lg:order-2">
                <AgentProgress
                  steps={result?.steps ?? []}
                  running={loading}
                  timings={result?.timings}
                  degraded={result?.degraded}
                />
              </aside>
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {(isSongs ? MUSIC_PROMPTS : VIDEO_PROMPTS).slice(0, 5).map((prompt) => (
              <Chip key={prompt} onClick={() => void run(prompt)}>
                {prompt}
              </Chip>
            ))}
          </div>

          <Shelf
            title={isSongs ? "Trending music" : "Trending on screen"}
            description="Most popular in the catalogue right now."
            items={trending.data?.items ?? []}
            loading={trending.loading}
          />
        </>
      )}

      {/* Save results ----------------------------------------------------- */}
      <Dialog
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={isSongs ? "Save these results as a playlist" : "Save these results as a collection"}
        description={
          result ? `${result.results.length} ${isSongs ? "tracks" : "titles"}` : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={savingList} onClick={() => void saveResults()}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Name" htmlFor="save-name" required>
            <Input
              id="save-name"
              value={listName}
              maxLength={80}
              onChange={(event) => setListName(event.target.value)}
            />
          </Field>
          <Field label="Description" htmlFor="save-description" hint="Optional.">
            <Textarea
              id="save-description"
              rows={2}
              maxLength={500}
              value={listDescription}
              placeholder={result?.summary}
              onChange={(event) => setListDescription(event.target.value)}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function Dropdown({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  const id = `filter-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <label className="space-y-1.5" htmlFor={id}>
      <span className="block text-[11px] font-medium uppercase tracking-wide text-subtle">
        {label}
      </span>
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </Select>
    </label>
  );
}
