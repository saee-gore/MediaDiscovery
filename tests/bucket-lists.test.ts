import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateUserData } from "./helpers/database";
import { loadCatalogue, makeUser } from "./helpers/fixtures";
import { AppError } from "@/server/lib/errors";
import {
  addItems,
  createBucketList,
  deleteBucketList,
  getBucketList,
  getOrCreateWatchLater,
  listBucketLists,
  removeItem,
  updateBucketList,
  updateItem,
} from "@/server/services/bucket-lists";
import { listMedia } from "@/server/vector/store";
import type { MediaSummary } from "@/lib/types";
import type { User } from "@/server/db/schema";

let owner: User;
let intruder: User;
let titles: MediaSummary[];

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((error: AppError) => expect(error.code).toBe(code));
}

describe("bucket list CRUD", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 10, video: 40 });
    titles = await listMedia({ domain: "VIDEO" }, 10);
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });
  beforeEach(async () => {
    await truncateUserData();
    owner = await makeUser({ email: "owner@example.test" });
    intruder = await makeUser({ email: "intruder@example.test" });
  });

  it("creates a collection with titles and tracks watched progress", async () => {
    const list = await createBucketList(owner.id, {
      name: "Weekend Watchlist",
      description: "Two evenings.",
      mediaIds: titles.slice(0, 3).map((title) => title.id),
    });
    expect(list.itemCount).toBe(3);
    expect(list.watchedCount).toBe(0);
    expect(list.items![0].mediaType).toMatch(/MOVIE|SERIES/);
  });

  it("marks a title watched and back again, stamping the time", async () => {
    const list = await createBucketList(owner.id, {
      name: "Progress",
      mediaIds: [titles[0].id, titles[1].id],
    });
    const itemId = list.items![0].id;

    const watched = await updateItem(owner.id, list.id, itemId, { watched: true });
    expect(watched.watchedCount).toBe(1);
    expect(watched.items!.find((item) => item.id === itemId)!.watchedAt).toBeTruthy();

    const unwatched = await updateItem(owner.id, list.id, itemId, { watched: false });
    expect(unwatched.watchedCount).toBe(0);
    expect(unwatched.items!.find((item) => item.id === itemId)!.watchedAt).toBeNull();
  });

  it("filters a collection by watched state and free text", async () => {
    const list = await createBucketList(owner.id, {
      name: "Filtered",
      mediaIds: titles.slice(0, 4).map((title) => title.id),
    });
    await updateItem(owner.id, list.id, list.items![0].id, { watched: true });

    expect((await getBucketList(owner.id, list.id, { filter: "watched" })).items).toHaveLength(1);
    expect((await getBucketList(owner.id, list.id, { filter: "unwatched" })).items).toHaveLength(3);

    const needle = titles[2].title.split(" ")[0];
    const searched = await getBucketList(owner.id, list.id, { search: needle });
    expect(searched.items!.length).toBeGreaterThan(0);
  });

  it("stores and edits a personal note", async () => {
    const list = await createBucketList(owner.id, { name: "Notes", mediaIds: [titles[0].id] });
    const withNote = await updateItem(owner.id, list.id, list.items![0].id, { note: "start here" });
    expect(withNote.items![0].note).toBe("start here");

    const edited = await updateItem(owner.id, list.id, list.items![0].id, { note: "actually watch this second" });
    expect(edited.items![0].note).toBe("actually watch this second");
  });

  it("moves a title between two collections the user owns", async () => {
    const from = await createBucketList(owner.id, { name: "From", mediaIds: [titles[0].id, titles[1].id] });
    const to = await createBucketList(owner.id, { name: "To" });

    const after = await updateItem(owner.id, from.id, from.items![0].id, { moveToListId: to.id });
    expect(after.itemCount).toBe(1);
    expect((await getBucketList(owner.id, to.id)).itemCount).toBe(1);
  });

  it("refuses to move a title into someone else's collection", async () => {
    const mine = await createBucketList(owner.id, { name: "Mine", mediaIds: [titles[0].id] });
    const theirs = await createBucketList(intruder.id, { name: "Theirs" });

    await expectAppError(
      updateItem(owner.id, mine.id, mine.items![0].id, { moveToListId: theirs.id }),
      "NOT_FOUND",
    );
    expect((await getBucketList(intruder.id, theirs.id)).itemCount).toBe(0);
  });

  it("rejects a duplicate title", async () => {
    const list = await createBucketList(owner.id, { name: "Dupes", mediaIds: [titles[0].id] });
    await expectAppError(addItems(owner.id, list.id, [titles[0].id]), "DUPLICATE");
  });

  it("renames, deletes and isolates collections per user", async () => {
    const list = await createBucketList(owner.id, { name: "Original" });
    expect((await updateBucketList(owner.id, list.id, { name: "Renamed" })).name).toBe("Renamed");

    await expectAppError(getBucketList(intruder.id, list.id), "NOT_FOUND");
    await expectAppError(deleteBucketList(intruder.id, list.id), "NOT_FOUND");
    expect(await listBucketLists(intruder.id)).toHaveLength(0);

    await deleteBucketList(owner.id, list.id);
    await expectAppError(getBucketList(owner.id, list.id), "NOT_FOUND");
  });

  it("creates Watch Later on demand and reuses it afterwards", async () => {
    const first = await getOrCreateWatchLater(owner.id);
    const second = await getOrCreateWatchLater(owner.id);
    expect(second.id).toBe(first.id);
    expect(await listBucketLists(owner.id)).toHaveLength(1);
  });

  it("removes a title and renumbers what's left", async () => {
    const list = await createBucketList(owner.id, {
      name: "Shrinking",
      mediaIds: titles.slice(0, 3).map((title) => title.id),
    });
    const after = await removeItem(owner.id, list.id, list.items![1].id);
    expect(after.itemCount).toBe(2);
    expect(after.items!.map((item) => item.position)).toEqual([0, 1]);
  });
});
