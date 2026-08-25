import { currentUserId } from "@/server/identity";
import { readJson, route } from "@/server/http/handler";
import { addItemsSchema, reorderSchema } from "@/server/http/schemas";
import { addItems, reorderItems } from "@/server/services/bucket-lists";

export const dynamic = "force-dynamic";

export const POST = route("bucketLists.items.add", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, addItemsSchema);
  const result = await addItems(userId, id, body.mediaIds, body.note);
  return { added: result.added, skipped: result.skipped, bucketList: result.list };
});

export const PUT = route("bucketLists.items.reorder", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, reorderSchema);
  return { bucketList: await reorderItems(userId, id, body.itemIds) };
});
