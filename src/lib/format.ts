import type { MediaSummary } from "@/lib/types";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function formatRuntime(minutes?: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatSeries(media: MediaSummary): string | null {
  if (media.mediaType !== "SERIES") return null;
  const parts: string[] = [];
  if (media.seasons) parts.push(`${media.seasons} season${media.seasons === 1 ? "" : "s"}`);
  if (media.episodes) parts.push(`${media.episodes} eps`);
  const runtime = formatRuntime(media.runtimeMin);
  if (runtime) parts.push(`~${runtime} each`);
  return parts.length ? parts.join(" · ") : null;
}

/** The one-line subtitle under a card title, per media type. */
export function mediaMeta(media: MediaSummary): string {
  if (media.mediaType === "TRACK") {
    return [media.subtitle, media.album, media.releaseYear].filter(Boolean).join(" · ");
  }
  return [
    media.mediaType === "SERIES" ? "Series" : "Film",
    media.releaseYear,
    media.mediaType === "SERIES" ? formatSeries(media) : formatRuntime(media.runtimeMin),
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return formatter.format(-Math.round(seconds / size), unit);
  }
  return "just now";
}

/**
 * Deterministic artwork for catalogue items that have no image.
 *
 * The seed catalogue ships without cover art (we do not have the rights to it,
 * and inventing URLs would be worse), so an id is hashed into a stable pair of
 * hues. The same track always gets the same tile, which is what makes a grid of
 * them readable rather than noisy.
 */
export function artworkGradient(seed: string): { from: string; to: string; angle: number } {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const positive = Math.abs(hash);
  const hue = positive % 360;
  const secondary = (hue + 40 + (positive % 60)) % 360;
  const angle = 120 + (positive % 120);
  return {
    from: `hsl(${hue} 62% 46%)`,
    to: `hsl(${secondary} 58% 30%)`,
    angle,
  };
}

export function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

const ACCENTS: Record<string, string> = {
  violet: "#7c4dff",
  amber: "#f0a13c",
  sky: "#38a8e0",
  rose: "#e05a86",
  emerald: "#2fae70",
  orange: "#ec7a3c",
  fuchsia: "#c750d4",
  indigo: "#5a6ce0",
  teal: "#2aa6a0",
  lime: "#7fb833",
  cyan: "#34b3c4",
  red: "#e05252",
  purple: "#9257d8",
  pink: "#e46aa8",
  yellow: "#d8ae2a",
  blue: "#4a7ce0",
  stone: "#8a8a94",
  slate: "#6d7488",
};

export function accentColor(name: string | undefined): string {
  return ACCENTS[name ?? "violet"] ?? ACCENTS.violet;
}

export const ACCENT_NAMES = Object.keys(ACCENTS);

/** Percentage for the relevance meter shown on a result card. */
export function relevancePercent(score: number): number {
  return Math.max(4, Math.min(100, Math.round(score * 100)));
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
