import { currentUserId } from "@/server/identity";
import { readJson, route } from "@/server/http/handler";
import { bucketItemUpdateSchema } from "@/server/http/schemas";
import { removeItem, updateItem } from "@/server/services/bucket-lists";

export const dynamic = "force-dynamic";

export const PUT = route("bucketLists.items.update", async (request, context) => {
  const userId = await currentUserId();
  const { id, itemId } = await context.params;
  const body = await readJson(request, bucketItemUpdateSchema);
  return { bucketList: await updateItem(userId, id, itemId, body) };
});

export const DELETE = route("bucketLists.items.remove", async (_request, context) => {
  const userId = await currentUserId();
  const { id, itemId } = await context.params;
  return { bucketList: await removeItem(userId, id, itemId) };
});
