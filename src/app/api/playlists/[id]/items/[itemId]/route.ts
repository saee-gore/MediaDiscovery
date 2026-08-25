import { currentUserId } from "@/server/identity";
import { readJson, route } from "@/server/http/handler";
import { playlistItemUpdateSchema } from "@/server/http/schemas";
import { removeItem, updateItem } from "@/server/services/playlists";

export const dynamic = "force-dynamic";

export const PUT = route("playlists.items.update", async (request, context) => {
  const userId = await currentUserId();
  const { id, itemId } = await context.params;
  const body = await readJson(request, playlistItemUpdateSchema);
  return { playlist: await updateItem(userId, id, itemId, body) };
});

export const DELETE = route("playlists.items.remove", async (_request, context) => {
  const userId = await currentUserId();
  const { id, itemId } = await context.params;
  return { playlist: await removeItem(userId, id, itemId) };
});
