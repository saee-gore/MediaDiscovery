import { z } from "zod";

import { searchVideo } from "@/server/agents/movie-agent";
import { currentUserId } from "@/server/identity";
import { readJson, route } from "@/server/http/handler";
import { searchSchema, videoPreferencesSchema } from "@/server/http/schemas";
import { recordSpan } from "@/server/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = searchSchema.extend({ preferences: videoPreferencesSchema.optional() });

export const POST = route("movies.search", async (request) => {
  const body = await readJson(request, bodySchema);
  const userId = await currentUserId();
  const result = await searchVideo({
    query: body.query,
    preferences: body.preferences as z.infer<typeof videoPreferencesSchema> | undefined,
    userId: userId,
    limit: body.limit,
    fastPath: body.fastPath,
  });
  recordSpan("search:total", result.timings.total ?? 0, true);
  if (result.results.length === 0) recordSpan("search:empty", result.timings.total ?? 0, true);
  return result;
});
