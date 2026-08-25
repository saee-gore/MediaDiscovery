"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { MediaCard } from "@/components/media/cards";
import { Skeleton } from "@/components/ui/primitives";
import { cx } from "@/lib/format";
import type { MediaSummary, ScoredMedia } from "@/lib/types";

/**
 * Horizontal shelf. Scroll buttons appear on pointer devices; touch users just
 * swipe, and keyboard users tab through the cards themselves.
 */
export function Shelf({
  title,
  description,
  items,
  loading,
  href,
  linkLabel = "See all",
  emptyMessage,
}: {
  title: string;
  description?: string;
  items: Array<MediaSummary | ScoredMedia>;
  loading?: boolean;
  href?: string;
  linkLabel?: string;
  emptyMessage?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const isVideo = items[0]?.domain === "VIDEO";

  const nudge = (direction: 1 | -1) => {
    scroller.current?.scrollBy({ left: direction * 480, behavior: "smooth" });
  };

  if (!loading && items.length === 0) {
    return emptyMessage ? (
      <section className="mb-8">
        <ShelfHeading title={title} description={description} href={href} linkLabel={linkLabel} />
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          {emptyMessage}
        </p>
      </section>
    ) : null;
  }

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <ShelfHeading title={title} description={description} href={href} linkLabel={linkLabel} inline />
        <div className="hidden shrink-0 gap-1 sm:flex">
          <button
            type="button"
            onClick={() => nudge(-1)}
            aria-label={`Scroll ${title} left`}
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => nudge(1)}
            aria-label={`Scroll ${title} right`}
            className="rounded-lg border border-line p-1.5 text-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div
        ref={scroller}
        className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1"
      >
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className={cx("shrink-0 snap-start", isVideo ? "w-40 sm:w-44" : "w-40 sm:w-44")}
              >
                <Skeleton className={isVideo ? "aspect-[2/3] w-full" : "aspect-square w-full"} />
                <Skeleton className="mt-2 h-3 w-3/4" />
                <Skeleton className="mt-1.5 h-2.5 w-1/2" />
              </div>
            ))
          : items.map((item) => (
              <div key={item.id} className="w-40 shrink-0 snap-start sm:w-44">
                <MediaCard item={item} showWhy={false} compact />
              </div>
            ))}
      </div>
    </section>
  );
}

function ShelfHeading({
  title,
  description,
  href,
  linkLabel,
  inline,
}: {
  title: string;
  description?: string;
  href?: string;
  linkLabel?: string;
  inline?: boolean;
}) {
  return (
    <div className={cx("min-w-0", !inline && "mb-3")}>
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {href ? (
          <Link href={href} className="shrink-0 text-xs font-medium text-accent hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
    </div>
  );
}
