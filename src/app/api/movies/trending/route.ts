import { z } from "zod";

import { trendingVideo } from "@/server/agents/movie-agent";
import { readQuery, route } from "@/server/http/handler";
import { mediaTypeSchema, numeric } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: numeric(24, 1, 60),
  mediaType: mediaTypeSchema.optional(),
});

export const GET = route("movies.trending", async (request) => {
  const { limit, mediaType } = readQuery(request, querySchema);
  return { items: await trendingVideo(limit, mediaType) };
});
