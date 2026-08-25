import { z } from "zod";

import { currentUserId } from "@/server/identity";
import { readJson, readQuery, route } from "@/server/http/handler";
import { collectionUpdateSchema } from "@/server/http/schemas";
import { deleteBucketList, getBucketList, updateBucketList } from "@/server/services/bucket-lists";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().max(200).optional(),
  filter: z.enum(["all", "watched", "unwatched"]).optional(),
});

export const GET = route("bucketLists.get", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const { q, filter } = readQuery(request, querySchema);
  return { bucketList: await getBucketList(userId, id, { search: q, filter }) };
});

export const PUT = route("bucketLists.update", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, collectionUpdateSchema);
  return { bucketList: await updateBucketList(userId, id, body) };
});

export const DELETE = route("bucketLists.delete", async (_request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  await deleteBucketList(userId, id);
  return { deleted: true };
});
