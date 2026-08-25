import { z } from "zod";

import { currentUserId } from "@/server/identity";
import { readJson, readQuery, route } from "@/server/http/handler";
import { collectionUpdateSchema } from "@/server/http/schemas";
import { deletePlaylist, getPlaylist, updatePlaylist } from "@/server/services/playlists";

export const dynamic = "force-dynamic";

const querySchema = z.object({ q: z.string().max(200).optional() });

export const GET = route("playlists.get", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const { q } = readQuery(request, querySchema);
  return { playlist: await getPlaylist(userId, id, { search: q }) };
});

export const PUT = route("playlists.update", async (request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  const body = await readJson(request, collectionUpdateSchema);
  return { playlist: await updatePlaylist(userId, id, body) };
});

export const DELETE = route("playlists.delete", async (_request, context) => {
  const userId = await currentUserId();
  const { id } = await context.params;
  await deletePlaylist(userId, id);
  return { deleted: true };
});
