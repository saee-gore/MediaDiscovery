import { z } from "zod";

export const searchSchema = z.object({
  query: z.string().trim().min(1, "Type what you're in the mood for.").max(500),
  limit: z.number().int().min(1).max(50).optional(),
  fastPath: z.boolean().optional(),
});

export const mediaTypeSchema = z.enum(["TRACK", "MOVIE", "SERIES"]);

export const videoPreferencesSchema = z.object({
  mediaTypes: z.array(mediaTypeSchema).max(3).optional(),
  genres: z.array(z.string().max(40)).max(8).optional(),
  moods: z.array(z.string().max(40)).max(8).optional(),
  languages: z.array(z.string().max(10)).max(5).optional(),
  yearFrom: z.number().int().min(1900).max(2100).nullable().optional(),
  yearTo: z.number().int().min(1900).max(2100).nullable().optional(),
  maxRuntimeMinutes: z.number().int().min(1).max(1000).nullable().optional(),
  minRating: z.number().min(0).max(10).nullable().optional(),
  familyFriendly: z.boolean().nullable().optional(),
  tone: z.enum(["light", "balanced", "serious", "dark"]).nullable().optional(),
  minPopularity: z.number().min(0).max(100).nullable().optional(),
});

export const musicPreferencesSchema = z.object({
  genres: z.array(z.string().max(40)).max(8).optional(),
  moods: z.array(z.string().max(40)).max(8).optional(),
  energy: z.enum(["low", "medium", "high"]).nullable().optional(),
  yearFrom: z.number().int().min(1900).max(2100).nullable().optional(),
  yearTo: z.number().int().min(1900).max(2100).nullable().optional(),
  minPopularity: z.number().min(0).max(100).nullable().optional(),
});

export const collectionCreateSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(80),
  description: z.string().trim().max(500).optional(),
  source: z.enum(["MANUAL", "AI", "SEARCH"]).optional(),
  seedQuery: z.string().max(500).nullable().optional(),
  accent: z.string().max(20).optional(),
  mediaIds: z.array(z.string().max(200)).max(100).optional(),
});

export const collectionUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "Give it a name.").max(80).optional(),
    description: z.string().trim().max(500).optional(),
    accent: z.string().max(20).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

export const addItemsSchema = z.object({
  mediaIds: z.array(z.string().min(1).max(200)).min(1, "Pick at least one.").max(100),
  note: z.string().max(500).optional(),
});

export const reorderSchema = z.object({
  itemIds: z.array(z.string().min(1).max(200)).min(1).max(500),
});

export const playlistItemUpdateSchema = z
  .object({
    note: z.string().max(500).nullable().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

export const bucketItemUpdateSchema = z
  .object({
    note: z.string().max(500).nullable().optional(),
    watched: z.boolean().optional(),
    position: z.number().int().min(0).max(10_000).optional(),
    moveToListId: z.string().min(1).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "Nothing to update." });

/** Query-string helpers — everything arrives as a string. */
export const numeric = (fallback: number, min = 1, max = 100) =>
  z
    .string()
    .optional()
    .transform((value) => {
      const parsed = value === undefined || value === "" ? fallback : Number(value);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(parsed)));
    });

export const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
});

