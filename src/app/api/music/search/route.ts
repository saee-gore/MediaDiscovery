import { currentUserId } from "@/server/identity";
import { searchMusic } from "@/server/agents/music-agent";
import { readJson, route } from "@/server/http/handler";
import { musicPreferencesSchema, searchSchema } from "@/server/http/schemas";
import { recordSpan } from "@/server/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = searchSchema.extend({ preferences: musicPreferencesSchema.optional() });

export const POST = route("music.search", async (request) => {
  const body = await readJson(request, bodySchema);
  const userId = await currentUserId();
  const result = await searchMusic({
    query: body.query,
    preferences: body.preferences,
    userId: userId,
    limit: body.limit,
    fastPath: body.fastPath,
  });
  recordSpan("search:total", result.timings.total ?? 0, true);
  if (result.results.length === 0) recordSpan("search:empty", result.timings.total ?? 0, true);
  return result;
});
