/**
 * Bucket list (movie & series collection) CRUD.
 *
 * Same shape as playlists, plus the things watching implies: a watched flag
 * with a timestamp, per-title personal notes, and moving a title from one
 * collection to another without losing either.
 */
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type {
  BucketListDto,
  BucketListItemDto,
  CollectionSource,
  MediaSummary,
} from "@/lib/types";
import { db } from "@/server/db";
import {
  bucketListItems,
  bucketLists,
  type BucketListItemRow,
  type BucketListRow,
} from "@/server/db/schema";
import { badRequest, duplicate, notFound } from "@/server/lib/errors";
import { createId } from "@/server/lib/id";
import { recordEvent } from "@/server/services/preferences";
import { fetchMediaByIds } from "@/server/vector/store";

const PREVIEW_SIZE = 4;

function toItemDto(row: BucketListItemRow): BucketListItemDto {
  return {
    id: row.id,
    mediaId: row.mediaId,
    mediaType: row.mediaType,
    position: row.position,
    watched: row.watched,
    watchedAt: row.watchedAt ? row.watchedAt.toISOString() : null,
    note: row.note,
    addedAt: row.addedAt.toISOString(),
    media: row.snapshot as unknown as MediaSummary,
  };
}

function toDto(
  row: BucketListRow,
  items: BucketListItemRow[],
  includeItems: boolean,
): BucketListDto {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    source: row.source as CollectionSource,
    seedQuery: row.seedQuery,
    accent: row.accent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    itemCount: sorted.length,
    watchedCount: sorted.filter((item) => item.watched).length,
    items: includeItems ? sorted.map(toItemDto) : undefined,
    preview: sorted.slice(0, PREVIEW_SIZE).map((item) => item.snapshot as unknown as MediaSummary),
  };
}

async function ownedList(userId: string, listId: string): Promise<BucketListRow> {
  const [row] = await db
    .select()
    .from(bucketLists)
    .where(and(eq(bucketLists.id, listId), eq(bucketLists.userId, userId)))
    .limit(1);
  if (!row) throw notFound("That collection");
  return row;
}

async function touch(listId: string): Promise<void> {
  await db.update(bucketLists).set({ updatedAt: new Date() }).where(eq(bucketLists.id, listId));
}

export async function listBucketLists(
  userId: string,
  options: { query?: string } = {},
): Promise<BucketListDto[]> {
  const conditions = [eq(bucketLists.userId, userId)];
  if (options.query?.trim()) {
    const pattern = `%${options.query.trim()}%`;
    conditions.push(or(ilike(bucketLists.name, pattern), ilike(bucketLists.description, pattern))!);
  }

  const rows = await db
    .select()
    .from(bucketLists)
    .where(and(...conditions))
    .orderBy(desc(bucketLists.updatedAt));
  if (rows.length === 0) return [];

  const items = await db
    .select()
    .from(bucketListItems)
    .where(inArray(bucketListItems.bucketListId, rows.map((row) => row.id)))
    .orderBy(asc(bucketListItems.position));

  const grouped = new Map<string, BucketListItemRow[]>();
  for (const item of items) {
    const list = grouped.get(item.bucketListId) ?? [];
    list.push(item);
    grouped.set(item.bucketListId, list);
  }

  return rows.map((row) => toDto(row, grouped.get(row.id) ?? [], false));
}

export async function getBucketList(
  userId: string,
  listId: string,
  options: { search?: string; filter?: "all" | "watched" | "unwatched" } = {},
): Promise<BucketListDto> {
  const row = await ownedList(userId, listId);
  const items = await db
    .select()
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId))
    .orderBy(asc(bucketListItems.position));

  let filtered = items;
  if (options.filter === "watched") filtered = filtered.filter((item) => item.watched);
  if (options.filter === "unwatched") filtered = filtered.filter((item) => !item.watched);
  if (options.search?.trim()) {
    const needle = options.search.trim().toLowerCase();
    filtered = filtered.filter((item) => {
      const media = item.snapshot as unknown as MediaSummary;
      return [media.title, media.subtitle, ...media.genres, ...media.themes, item.note ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }

  return toDto(row, filtered, true);
}

export interface CreateBucketListInput {
  name: string;
  description?: string;
  source?: CollectionSource;
  seedQuery?: string | null;
  accent?: string;
  mediaIds?: string[];
}

export async function createBucketList(
  userId: string,
  input: CreateBucketListInput,
): Promise<BucketListDto> {
  const name = input.name.trim();
  if (!name) throw badRequest("A collection needs a name.");

  const [row] = await db
    .insert(bucketLists)
    .values({
      id: createId("bl"),
      userId,
      name,
      description: input.description?.trim() ?? "",
      source: input.source ?? "MANUAL",
      seedQuery: input.seedQuery ?? null,
      accent: input.accent ?? "amber",
    })
    .returning();

  if (input.mediaIds?.length) await addItems(userId, row.id, input.mediaIds);
  return getBucketList(userId, row.id);
}

export async function updateBucketList(
  userId: string,
  listId: string,
  input: { name?: string; description?: string; accent?: string },
): Promise<BucketListDto> {
  await ownedList(userId, listId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw badRequest("A collection needs a name.");
    patch.name = name;
  }
  if (input.description !== undefined) patch.description = input.description.trim();
  if (input.accent !== undefined) patch.accent = input.accent;

  await db.update(bucketLists).set(patch).where(eq(bucketLists.id, listId));
  return getBucketList(userId, listId);
}

export async function deleteBucketList(userId: string, listId: string): Promise<void> {
  await ownedList(userId, listId);
  await db.delete(bucketLists).where(eq(bucketLists.id, listId));
}

export interface AddItemsResult {
  added: number;
  skipped: string[];
  list: BucketListDto;
}

export async function addItems(
  userId: string,
  listId: string,
  mediaIds: string[],
  note?: string,
): Promise<AddItemsResult> {
  await ownedList(userId, listId);
  const ids = [...new Set(mediaIds.filter(Boolean))];
  if (ids.length === 0) throw badRequest("No titles were provided.");

  const media = await fetchMediaByIds(ids);
  const missing = ids.filter((id) => !media.has(id));
  if (missing.length === ids.length) throw notFound(ids.length === 1 ? "That title" : "Those titles");

  const existing = await db
    .select({ mediaId: bucketListItems.mediaId })
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId));
  const present = new Set(existing.map((row) => row.mediaId));

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${bucketListItems.position}), -1)` })
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId));

  let position = Number(max) + 1;
  const skipped: string[] = [...missing];
  const values: Array<typeof bucketListItems.$inferInsert> = [];

  for (const id of ids) {
    const item = media.get(id);
    if (!item) continue;
    if (present.has(id)) {
      skipped.push(id);
      continue;
    }
    values.push({
      id: createId("bli"),
      bucketListId: listId,
      mediaId: id,
      mediaType: item.mediaType,
      position: position++,
      note: note ?? null,
      snapshot: item as unknown as Record<string, unknown>,
    });
  }

  if (values.length === 0) {
    throw duplicate(
      ids.length === 1
        ? "That title is already in this collection."
        : "Those titles are already in this collection.",
    );
  }

  await db.insert(bucketListItems).values(values).onConflictDoNothing();
  await touch(listId);

  for (const value of values) {
    const item = media.get(value.mediaId!);
    if (item) await recordEvent({ userId, domain: "VIDEO", action: "SAVED", media: item });
  }

  return { added: values.length, skipped, list: await getBucketList(userId, listId) };
}

export interface UpdateItemInput {
  note?: string | null;
  watched?: boolean;
  position?: number;
  /** Move this item to a different collection the user also owns. */
  moveToListId?: string;
}

export async function updateItem(
  userId: string,
  listId: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<BucketListDto> {
  await ownedList(userId, listId);
  const [item] = await db
    .select()
    .from(bucketListItems)
    .where(and(eq(bucketListItems.id, itemId), eq(bucketListItems.bucketListId, listId)))
    .limit(1);
  if (!item) throw notFound("That title");

  if (input.moveToListId && input.moveToListId !== listId) {
    await moveToList(userId, item, input.moveToListId);
    await touch(listId);
    return getBucketList(userId, listId);
  }

  const patch: Record<string, unknown> = {};
  if (input.note !== undefined) patch.note = input.note;
  if (input.watched !== undefined) {
    patch.watched = input.watched;
    patch.watchedAt = input.watched ? new Date() : null;
  }
  if (Object.keys(patch).length) {
    await db.update(bucketListItems).set(patch).where(eq(bucketListItems.id, itemId));
  }
  if (input.position !== undefined) await moveItem(listId, itemId, input.position);
  if (input.watched) {
    await recordEvent({
      userId,
      domain: "VIDEO",
      action: "WATCHED",
      media: item.snapshot as unknown as MediaSummary,
    });
  }

  await touch(listId);
  return getBucketList(userId, listId);
}

async function moveToList(
  userId: string,
  item: BucketListItemRow,
  targetListId: string,
): Promise<void> {
  await ownedList(userId, targetListId);

  const [existing] = await db
    .select({ id: bucketListItems.id })
    .from(bucketListItems)
    .where(
      and(
        eq(bucketListItems.bucketListId, targetListId),
        eq(bucketListItems.mediaId, item.mediaId ?? ""),
      ),
    )
    .limit(1);
  if (existing) {
    // Already there: moving becomes removing from the source.
    await db.delete(bucketListItems).where(eq(bucketListItems.id, item.id));
    await touch(targetListId);
    return;
  }

  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${bucketListItems.position}), -1)` })
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, targetListId));

  await db
    .update(bucketListItems)
    .set({ bucketListId: targetListId, position: Number(max) + 1 })
    .where(eq(bucketListItems.id, item.id));
  await touch(targetListId);
}

async function moveItem(listId: string, itemId: string, target: number): Promise<void> {
  const items = await db
    .select()
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId))
    .orderBy(asc(bucketListItems.position));

  const current = items.findIndex((item) => item.id === itemId);
  if (current === -1) return;
  const clamped = Math.max(0, Math.min(items.length - 1, target));
  const [moved] = items.splice(current, 1);
  items.splice(clamped, 0, moved);

  for (let index = 0; index < items.length; index += 1) {
    if (items[index].position !== index) {
      await db
        .update(bucketListItems)
        .set({ position: index })
        .where(eq(bucketListItems.id, items[index].id));
    }
  }
}

export async function reorderItems(
  userId: string,
  listId: string,
  orderedItemIds: string[],
): Promise<BucketListDto> {
  await ownedList(userId, listId);
  const items = await db
    .select()
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId));
  const known = new Set(items.map((item) => item.id));
  const ordered = orderedItemIds.filter((id) => known.has(id));
  const rest = items.map((item) => item.id).filter((id) => !ordered.includes(id));
  const finalOrder = [...ordered, ...rest];

  for (let index = 0; index < finalOrder.length; index += 1) {
    await db
      .update(bucketListItems)
      .set({ position: index })
      .where(eq(bucketListItems.id, finalOrder[index]));
  }
  await touch(listId);
  return getBucketList(userId, listId);
}

export async function removeItem(
  userId: string,
  listId: string,
  itemId: string,
): Promise<BucketListDto> {
  await ownedList(userId, listId);
  const deleted = await db
    .delete(bucketListItems)
    .where(and(eq(bucketListItems.id, itemId), eq(bucketListItems.bucketListId, listId)))
    .returning();
  if (deleted.length === 0) throw notFound("That title");

  await recordEvent({
    userId,
    domain: "VIDEO",
    action: "REMOVED",
    media: deleted[0].snapshot as unknown as MediaSummary,
  });

  const remaining = await db
    .select()
    .from(bucketListItems)
    .where(eq(bucketListItems.bucketListId, listId))
    .orderBy(asc(bucketListItems.position));
  for (let index = 0; index < remaining.length; index += 1) {
    if (remaining[index].position !== index) {
      await db
        .update(bucketListItems)
        .set({ position: index })
        .where(eq(bucketListItems.id, remaining[index].id));
    }
  }

  await touch(listId);
  return getBucketList(userId, listId);
}

export async function countBucketLists(userId: string): Promise<{ lists: number; titles: number }> {
  const [lists] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bucketLists)
    .where(eq(bucketLists.userId, userId));
  const [titles] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bucketListItems)
    .innerJoin(bucketLists, eq(bucketLists.id, bucketListItems.bucketListId))
    .where(eq(bucketLists.userId, userId));
  return { lists: Number(lists?.count ?? 0), titles: Number(titles?.count ?? 0) };
}

/** Convenience: the default "Watch Later" list, created on first use. */
export async function getOrCreateWatchLater(userId: string): Promise<BucketListDto> {
  const [existing] = await db
    .select()
    .from(bucketLists)
    .where(and(eq(bucketLists.userId, userId), eq(bucketLists.name, "Watch Later")))
    .limit(1);
  if (existing) return getBucketList(userId, existing.id);
  return createBucketList(userId, {
    name: "Watch Later",
    description: "Everything you've saved to get to.",
    accent: "amber",
  });
}
