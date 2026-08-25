import { randomUUID } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Short, sortable-ish, collision-resistant id.
 * `<base36 timestamp><12 random base36 chars>` — lexicographic order roughly
 * follows creation order, which keeps index locality reasonable.
 */
export function createId(prefix?: string): string {
  const time = Date.now().toString(36);
  const random = randomUUID()
    .replace(/-/g, "")
    .slice(0, 16)
    .split("")
    .map((c) => ALPHABET[parseInt(c, 16) % ALPHABET.length])
    .join("");
  const id = `${time}${random}`;
  return prefix ? `${prefix}_${id}` : id;
}

/** Namespaced catalogue id, e.g. `mediaId("spotify", "track", "6WrI0")`. */
export function mediaId(source: string, kind: string, externalId: string): string {
  return `${source}:${kind}:${externalId}`;
}

/** URL-safe slug used for seed catalogue ids and share links. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
