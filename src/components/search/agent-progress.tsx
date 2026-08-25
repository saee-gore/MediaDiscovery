"use client";

import { AlertTriangle, Check, Loader2, Minus } from "lucide-react";

import { Badge } from "@/components/ui/primitives";
import { cx } from "@/lib/format";
import type { DiscoveryStep } from "@/lib/types";

const STAGES = [
  "Understanding your request",
  "Matching your references",
  "Applying filters",
  "Searching the catalogue",
  "Ranking and explaining",
];

/**
 * The agent's progress, at the level a person actually benefits from.
 *
 * It shows *what* the system did — parsed, filtered, retrieved, ranked — and
 * never the model's internal reasoning. The value is that a surprising result
 * becomes explicable: you can see the filter that excluded what you expected.
 */
export function AgentProgress({
  steps,
  running,
  timings,
  degraded,
}: {
  steps: DiscoveryStep[];
  running?: boolean;
  timings?: Record<string, number>;
  degraded?: boolean;
}) {
  const shown = running && steps.length === 0
    ? STAGES.map((label) => ({ label, status: "ok" as const, detail: undefined }))
    : steps;

  if (shown.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface-sunken p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-subtle">
          {running ? "Working" : "How these were found"}
        </span>
        <span className="flex items-center gap-2">
          {degraded ? <Badge tone="warning">Degraded mode</Badge> : null}
          {!running && timings?.total ? <Badge>{timings.total} ms</Badge> : null}
        </span>
      </div>

      <ol className="space-y-2">
        {shown.map((step, index) => {
          const pending = running && index >= steps.length;
          return (
            <li key={`${step.label}-${index}`} className="flex items-start gap-2.5 text-sm">
              <span className="mt-0.5 shrink-0">
                {pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-subtle" aria-hidden />
                ) : step.status === "ok" ? (
                  <Check className="h-3.5 w-3.5 text-success" aria-hidden />
                ) : step.status === "skipped" ? (
                  <Minus className="h-3.5 w-3.5 text-subtle" aria-hidden />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className={cx("block", pending ? "text-subtle" : "text-ink")}>{step.label}</span>
                {step.detail && !pending ? (
                  <span className="block text-xs leading-relaxed text-muted">{step.detail}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function Notices({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;
  return (
    <div className="space-y-2">
      {notices.map((notice) => (
        <p
          key={notice}
          className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {notice}
        </p>
      ))}
    </div>
  );
}
