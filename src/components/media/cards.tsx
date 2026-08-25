"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Sparkles, Star } from "lucide-react";

import { Artwork } from "@/components/media/artwork";
import { WhyRecommended } from "@/components/media/why";
import { useCollections } from "@/components/providers/collections";
import { Badge } from "@/components/ui/primitives";
import { cx, formatRuntime, formatSeries, mediaMeta } from "@/lib/format";
import type { ChartEntryDto, MediaSummary, ScoredMedia } from "@/lib/types";

function isScored(item: MediaSummary | ScoredMedia): item is ScoredMedia {
  return "score" in item;
}

function AiBadge() {
  return (
    <Badge tone="accent" className="shrink-0">
      <Sparkles className="h-2.5 w-2.5" aria-hidden />
      AI pick
    </Badge>
  );
}

function SaveButton({ media, label }: { media: MediaSummary; label?: string }) {
  const { save } = useCollections();
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
        save(media);
      }}
      aria-label={`Save ${media.title}`}
      className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      {label ?? "Save"}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Track card — square artwork, used in music grids                           */
/* -------------------------------------------------------------------------- */

export function TrackCard({
  item,
  showWhy = true,
  compact,
}: {
  item: MediaSummary | ScoredMedia;
  showWhy?: boolean;
  /** Shelf variant: fixed height, no tag row, no explanation. */
  compact?: boolean;
}) {
  const scored = isScored(item) ? item : null;
  return (
    <article className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-hover">
      <div className="aspect-square w-full overflow-hidden rounded-lg">
        <Artwork media={item} />
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-ink" title={item.title}>
            {item.title}
          </h3>
          {scored?.reason ? <AiBadge /> : null}
        </div>
        <p className="truncate text-xs text-muted" title={mediaMeta(item)}>
          {mediaMeta(item)}
        </p>
      </div>

      {!compact && (item.genres.length || item.moods.length) ? (
        <div className="flex flex-wrap gap-1">
          {[...item.genres.slice(0, 2), ...item.moods.slice(0, 2)].map((tag) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <SaveButton media={item} />
        {scored && showWhy && !compact ? <WhyRecommended item={scored} /> : null}
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Title card — poster shape, used in film & TV grids                         */
/* -------------------------------------------------------------------------- */

export function TitleCard({
  item,
  showWhy = true,
  compact,
}: {
  item: MediaSummary | ScoredMedia;
  showWhy?: boolean;
  /** Shelf variant: fixed height, no synopsis, no tag row. */
  compact?: boolean;
}) {
  const scored = isScored(item) ? item : null;
  const shape = item.mediaType === "SERIES" ? formatSeries(item) : formatRuntime(item.runtimeMin);

  return (
    <article className="group flex flex-col gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-surface-hover">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg">
        <Artwork media={item} />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          <Badge tone={item.mediaType === "SERIES" ? "amber" : "neutral"}>
            {item.mediaType === "SERIES" ? "Series" : "Film"}
          </Badge>
        </div>
        {item.rating ? (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-medium text-white">
            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
            {item.rating.toFixed(1)}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 truncate text-sm font-semibold text-ink" title={item.title}>
            {item.title}
          </h3>
          {scored?.reason ? <AiBadge /> : null}
        </div>
        <p className="truncate text-xs text-muted">
          {[item.releaseYear, shape].filter(Boolean).join(" · ")}
        </p>
        {!compact && item.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-subtle">{item.description}</p>
        ) : null}
      </div>

      {!compact && item.genres.length ? (
        <div className="flex flex-wrap gap-1">
          {item.genres.slice(0, 3).map((genre) => (
            <Badge key={genre}>{genre}</Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <SaveButton media={item} label={compact ? "Save" : "Watch later"} />
        {scored && showWhy && !compact ? <WhyRecommended item={scored} /> : null}
      </div>
    </article>
  );
}

/** Picks the right card shape for the media type. */
export function MediaCard({
  item,
  showWhy,
  compact,
}: {
  item: MediaSummary | ScoredMedia;
  showWhy?: boolean;
  compact?: boolean;
}) {
  return item.domain === "MUSIC" ? (
    <TrackCard item={item} showWhy={showWhy} compact={compact} />
  ) : (
    <TitleCard item={item} showWhy={showWhy} compact={compact} />
  );
}

export function MediaGrid({
  items,
  showWhy,
  className,
}: {
  items: Array<MediaSummary | ScoredMedia>;
  showWhy?: boolean;
  className?: string;
}) {
  const posters = items[0]?.domain === "VIDEO";
  return (
    <div
      className={cx(
        "grid gap-3",
        posters
          ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
        className,
      )}
    >
      {items.map((item) => (
        <MediaCard key={item.id} item={item} showWhy={showWhy} />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Row layouts                                                                */
/* -------------------------------------------------------------------------- */

export function TrackRow({
  item,
  index,
  actions,
  showWhy = false,
}: {
  item: MediaSummary | ScoredMedia;
  index?: number;
  actions?: React.ReactNode;
  showWhy?: boolean;
}) {
  const scored = isScored(item) ? item : null;
  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover">
      {index !== undefined ? (
        <span className="w-6 shrink-0 text-right text-xs tabular-nums text-subtle">{index}</span>
      ) : null}
      <span className="h-11 w-11 shrink-0 overflow-hidden rounded-md">
        <Artwork media={item} rounded="rounded-md" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
        <span className="block truncate text-xs text-muted">{mediaMeta(item)}</span>
        {showWhy && scored ? <WhyRecommended item={scored} className="mt-1" /> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">{actions ?? <SaveButton media={item} />}</span>
    </li>
  );
}

/** Chart row with rank, movement and the same actions as a track row. */
export function ChartRow({ entry }: { entry: ChartEntryDto }) {
  const movement = entry.movement;
  const MovementIcon = movement === null ? null : movement > 0 ? ArrowUp : movement < 0 ? ArrowDown : Minus;
  const movementTone =
    movement === null
      ? "text-accent"
      : movement > 0
        ? "text-success"
        : movement < 0
          ? "text-danger"
          : "text-subtle";

  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-hover">
      <span className="w-9 shrink-0 text-right text-lg font-semibold tabular-nums text-ink">
        {entry.rank}
      </span>

      <span className={cx("flex w-12 shrink-0 items-center gap-0.5 text-xs font-medium", movementTone)}>
        {entry.isNewEntry ? (
          <span className="rounded bg-accent-soft px-1 py-0.5 text-[10px] uppercase tracking-wide text-accent">
            New
          </span>
        ) : MovementIcon ? (
          <>
            <MovementIcon className="h-3 w-3" aria-hidden />
            {movement === 0 ? "" : Math.abs(movement!)}
          </>
        ) : null}
      </span>

      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-md">
        <Artwork media={entry.media} rounded="rounded-md" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink">{entry.media.title}</span>
        <span className="block truncate text-xs text-muted">
          {[entry.media.subtitle, entry.media.album].filter(Boolean).join(" · ")}
        </span>
      </span>

      <span className="hidden shrink-0 items-center gap-2 sm:flex">
        {entry.peakRank && entry.peakRank < entry.rank ? (
          <Badge>Peak {entry.peakRank}</Badge>
        ) : null}
        <Badge>{entry.weeksOnChart}m on chart</Badge>
      </span>

      <span className="shrink-0">
        <SaveButton media={entry.media} />
      </span>
    </li>
  );
}
