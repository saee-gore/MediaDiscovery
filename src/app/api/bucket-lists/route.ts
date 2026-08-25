import { currentUserId } from "@/server/identity";
import { readJson, readQuery, route } from "@/server/http/handler";
import { collectionCreateSchema, listQuerySchema } from "@/server/http/schemas";
import { createBucketList, listBucketLists } from "@/server/services/bucket-lists";

export const dynamic = "force-dynamic";

export const GET = route("bucketLists.list", async (request) => {
  const userId = await currentUserId();
  const { q } = readQuery(request, listQuerySchema);
  return { bucketLists: await listBucketLists(userId, { query: q }) };
});

export const POST = route("bucketLists.create", async (request) => {
  const userId = await currentUserId();
  const body = await readJson(request, collectionCreateSchema);
  return { bucketList: await createBucketList(userId, body) };
});
