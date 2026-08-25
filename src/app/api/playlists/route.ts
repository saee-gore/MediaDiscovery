import { currentUserId } from "@/server/identity";
import { readJson, readQuery, route } from "@/server/http/handler";
import { collectionCreateSchema, listQuerySchema } from "@/server/http/schemas";
import { createPlaylist, listPlaylists } from "@/server/services/playlists";

export const dynamic = "force-dynamic";

export const GET = route("playlists.list", async (request) => {
  const userId = await currentUserId();
  const { q } = readQuery(request, listQuerySchema);
  return { playlists: await listPlaylists(userId, { query: q }) };
});

export const POST = route("playlists.create", async (request) => {
  const userId = await currentUserId();
  const body = await readJson(request, collectionCreateSchema);
  return { playlist: await createPlaylist(userId, body) };
});
