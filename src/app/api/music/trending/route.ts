import { z } from "zod";

import { newMusic, trendingMusic } from "@/server/agents/music-agent";
import { readQuery, route } from "@/server/http/handler";
import { numeric } from "@/server/http/schemas";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: numeric(24, 1, 60),
  kind: z.enum(["trending", "new"]).optional(),
});

export const GET = route("music.trending", async (request) => {
  const { limit, kind } = readQuery(request, querySchema);
  const items = kind === "new" ? await newMusic(limit) : await trendingMusic(limit);
  return { items };
});
