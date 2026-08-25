import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateUserData } from "./helpers/database";
import { loadCatalogue, makeUser } from "./helpers/fixtures";
import { AppError } from "@/server/lib/errors";
import {
  addItems,
  countPlaylists,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  removeItem,
  reorderItems,
  updateItem,
  updatePlaylist,
} from "@/server/services/playlists";
import { listMedia } from "@/server/vector/store";
import type { MediaSummary } from "@/lib/types";
import type { User } from "@/server/db/schema";

let owner: User;
let intruder: User;
let tracks: MediaSummary[];

async function expectAppError(promise: Promise<unknown>, code: string, status?: number) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await promise.catch((error: AppError) => {
    expect(error.code).toBe(code);
    if (status) expect(error.status).toBe(status);
  });
}

describe("playlist CRUD", () => {
  beforeAll(async () => {
    await createTestDatabase();
    await loadCatalogue({ music: 40, video: 10 });
    tracks = await listMedia({ domain: "MUSIC", mediaTypes: ["TRACK"] }, 10);
  });
  afterAll(async () => {
    await destroyTestDatabase();
  });
  beforeEach(async () => {
    await truncateUserData();
    owner = await makeUser({ email: "owner@example.test" });
    intruder = await makeUser({ email: "intruder@example.test" });
  });

  it("creates a playlist, optionally pre-filled from AI results", async () => {
    const playlist = await createPlaylist(owner.id, {
      name: "Late Night Drive",
      description: "Synths and momentum.",
      source: "AI",
      seedQuery: "late night synth drive",
      mediaIds: tracks.slice(0, 3).map((track) => track.id),
    });

    expect(playlist.name).toBe("Late Night Drive");
    expect(playlist.source).toBe("AI");
    expect(playlist.seedQuery).toBe("late night synth drive");
    expect(playlist.itemCount).toBe(3);
    expect(playlist.items?.map((item) => item.position)).toEqual([0, 1, 2]);
    // Snapshots make a saved list self-sufficient.
    expect(playlist.items?.[0].media.title).toBeTruthy();
  });

  it("rejects an empty name", async () => {
    await expectAppError(createPlaylist(owner.id, { name: "   " }), "BAD_REQUEST", 400);
  });

  it("lists playlists newest-updated first and supports search", async () => {
    await createPlaylist(owner.id, { name: "Focus Mix", description: "for deep work" });
    await createPlaylist(owner.id, { name: "Party Starters" });

    const all = await listPlaylists(owner.id);
    expect(all).toHaveLength(2);
    expect(all[0].name).toBe("Party Starters");

    const found = await listPlaylists(owner.id, { query: "deep work" });
    expect(found.map((playlist) => playlist.name)).toEqual(["Focus Mix"]);
  });

  it("renames and re-describes a playlist", async () => {
    const created = await createPlaylist(owner.id, { name: "Untitled" });
    const updated = await updatePlaylist(owner.id, created.id, {
      name: "Sunday Morning",
      description: "Slow start.",
      accent: "sky",
    });
    expect(updated.name).toBe("Sunday Morning");
    expect(updated.description).toBe("Slow start.");
    expect(updated.accent).toBe("sky");
  });

  it("treats a repeat add as a duplicate rather than silently doubling up", async () => {
    const playlist = await createPlaylist(owner.id, { name: "Dupes" });
    const first = await addItems(owner.id, playlist.id, [tracks[0].id, tracks[1].id]);
    expect(first.added).toBe(2);

    // Partial overlap: adds the new one, reports the existing one as skipped.
    const second = await addItems(owner.id, playlist.id, [tracks[1].id, tracks[2].id]);
    expect(second.added).toBe(1);
    expect(second.skipped).toContain(tracks[1].id);
    expect(second.playlist.itemCount).toBe(3);

    // Complete overlap: an explicit, user-facing duplicate error.
    await expectAppError(addItems(owner.id, playlist.id, [tracks[0].id]), "DUPLICATE", 409);
  });

  it("refuses to add a track that isn't in the catalogue", async () => {
    const playlist = await createPlaylist(owner.id, { name: "Ghosts" });
    await expectAppError(addItems(owner.id, playlist.id, ["seed:track:does-not-exist"]), "NOT_FOUND", 404);
  });

  it("reorders items and keeps positions dense", async () => {
    const playlist = await createPlaylist(owner.id, {
      name: "Ordered",
      mediaIds: tracks.slice(0, 4).map((track) => track.id),
    });
    const ids = playlist.items!.map((item) => item.id);

    const reordered = await reorderItems(owner.id, playlist.id, [ids[3], ids[0]]);
    expect(reordered.items!.map((item) => item.id)).toEqual([ids[3], ids[0], ids[1], ids[2]]);
    expect(reordered.items!.map((item) => item.position)).toEqual([0, 1, 2, 3]);

    const moved = await updateItem(owner.id, playlist.id, ids[1], { position: 0 });
    expect(moved.items![0].id).toBe(ids[1]);
    expect(moved.items!.map((item) => item.position)).toEqual([0, 1, 2, 3]);
  });

  it("stores a per-track note", async () => {
    const playlist = await createPlaylist(owner.id, { name: "Noted", mediaIds: [tracks[0].id] });
    const updated = await updateItem(owner.id, playlist.id, playlist.items![0].id, {
      note: "the bridge is the whole song",
    });
    expect(updated.items![0].note).toBe("the bridge is the whole song");
  });

  it("removes an item and closes the positional gap", async () => {
    const playlist = await createPlaylist(owner.id, {
      name: "Shrinking",
      mediaIds: tracks.slice(0, 3).map((track) => track.id),
    });
    const middle = playlist.items![1].id;
    const after = await removeItem(owner.id, playlist.id, middle);
    expect(after.itemCount).toBe(2);
    expect(after.items!.map((item) => item.position)).toEqual([0, 1]);
  });

  it("deletes a playlist and cascades its items", async () => {
    const playlist = await createPlaylist(owner.id, { name: "Temporary", mediaIds: [tracks[0].id] });
    await deletePlaylist(owner.id, playlist.id);
    await expectAppError(getPlaylist(owner.id, playlist.id), "NOT_FOUND", 404);
    expect((await countPlaylists(owner.id)).tracks).toBe(0);
  });

  it("hides one user's playlists from another entirely", async () => {
    const playlist = await createPlaylist(owner.id, { name: "Private", mediaIds: [tracks[0].id] });

    // 404 rather than 403: confirming existence would itself be a leak.
    await expectAppError(getPlaylist(intruder.id, playlist.id), "NOT_FOUND", 404);
    await expectAppError(updatePlaylist(intruder.id, playlist.id, { name: "Mine now" }), "NOT_FOUND");
    await expectAppError(deletePlaylist(intruder.id, playlist.id), "NOT_FOUND");
    await expectAppError(addItems(intruder.id, playlist.id, [tracks[1].id]), "NOT_FOUND");
    expect(await listPlaylists(intruder.id)).toHaveLength(0);

    // And the owner's copy is untouched.
    expect((await getPlaylist(owner.id, playlist.id)).name).toBe("Private");
  });

  it("searches within a playlist", async () => {
    const playlist = await createPlaylist(owner.id, {
      name: "Big",
      mediaIds: tracks.map((track) => track.id),
    });
    const needle = tracks[2].title.split(" ")[0];
    const filtered = await getPlaylist(owner.id, playlist.id, { search: needle });
    expect(filtered.items!.length).toBeGreaterThan(0);
    expect(filtered.items!.every((item) => JSON.stringify(item.media).toLowerCase().includes(needle.toLowerCase()))).toBe(true);
  });
});
