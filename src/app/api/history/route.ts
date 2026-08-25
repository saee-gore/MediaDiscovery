import { z } from "zod";

import { currentUserId } from "@/server/identity";
import { readQuery, route } from "@/server/http/handler";
import { numeric } from "@/server/http/schemas";
import { clearSearchHistory, listSearchHistory } from "@/server/services/preferences";

export const dynamic = "force-dynamic";

const querySchema = z.object({ limit: numeric(25, 1, 100) });

export const GET = route("history.list", async (request) => {
  const userId = await currentUserId();
  const { limit } = readQuery(request, querySchema);
  return { history: await listSearchHistory(userId, limit) };
});

export const DELETE = route("history.clear", async () => {
  const userId = await currentUserId();
  return { deleted: await clearSearchHistory(userId) };
});
