import { currentUserId } from "@/server/identity";
import { readJson, route } from "@/server/http/handler";
import { addItemsSchema, reorderSchema } from "@/server/http/schemas";
import { addItems, reorderItems } from "@/server/services/playlists";

export const dynamic = "force-dynamic";

export const POST = route("playlists.items.add", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, addItemsSchema);
  const result = await addItems(userId, id, body.mediaIds, body.note);
  return { added: result.added, skipped: result.skipped, playlist: result.playlist };
});

/** Whole-list reorder — used by drag and drop, which knows the final order. */
export const PUT = route("playlists.items.reorder", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, reorderSchema);
  return { playlist: await reorderItems(userId, id, body.itemIds) };
});
