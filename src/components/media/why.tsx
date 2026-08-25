"use client";

import { useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";

import { cx, relevancePercent } from "@/lib/format";
import type { ScoredMedia } from "@/lib/types";

/**
 * "Why this was recommended".
 *
 * Deliberately shows the evidence, not just the prose: which retrieval signals
 * fired and how strongly. A recommendation you can audit is a recommendation
 * you can disagree with, which is the point.
 */
export function WhyRecommended({ item, className }: { item: ScoredMedia; className?: string }) {
  const [open, setOpen] = useState(false);

  const signals: Array<{ label: string; value: number }> = [
    { label: "Meaning", value: item.vectorScore },
    { label: "Keywords", value: item.keywordScore },
    { label: "Popularity", value: item.popularityScore },
  ];
  if (item.affinityScore > 0) signals.push({ label: "Your taste", value: item.affinityScore });

  return (
    <div className={cx("text-xs", className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 font-medium text-accent transition-opacity hover:opacity-80"
      >
        <Sparkles className="h-3 w-3" aria-hidden />
        Why this?
        <ChevronDown
          className={cx("h-3 w-3 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="animate-fade-up mt-2 space-y-3 rounded-lg border border-line bg-surface-sunken p-3">
          {item.reason ? <p className="leading-relaxed text-muted">{item.reason}</p> : null}

          <div className="space-y-1.5">
            {signals.map((signal) => (
              <div key={signal.label} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-[11px] text-subtle">{signal.label}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent"
                    style={{ width: `${relevancePercent(signal.value)}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-subtle">
                  {relevancePercent(signal.value)}
                </span>
              </div>
            ))}
          </div>

          {item.matchedOn.length ? (
            <p className="text-[11px] text-subtle">Matched on {item.matchedOn.join(", ")}.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
