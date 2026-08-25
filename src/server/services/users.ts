/**
 * Accounts.
 *
 * Registration, sign-in and the library counters. Everything a person curates
 * hangs off a `users` row, and every service in the app is already scoped by
 * `userId`, so this is the only place that decides *which* row you are.
 */
import { eq, sql } from "drizzle-orm";

import { db } from "@/server/db";
import { searchHistory, users, type User } from "@/server/db/schema";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { badRequest, duplicate, unauthenticated } from "@/server/lib/errors";
import { createId } from "@/server/lib/id";
import { countBucketLists } from "@/server/services/bucket-lists";
import { countPlaylists } from "@/server/services/playlists";
import { getOrCreatePreferences } from "@/server/services/preferences";

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A bare owner row with no credentials. Used by the seed script and by tests
 * that need a second owner to prove collections stay isolated.
 */
export async function createUser(input: { email?: string; name?: string } = {}): Promise<User> {
  const id = createId("usr");
  const [user] = await db
    .insert(users)
    .values({
      id,
      email: normaliseEmail(input.email ?? `${id}@local`),
      name: input.name ?? "You",
    })
    .returning();
  await getOrCreatePreferences(user.id);
  return user;
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, normaliseEmail(email)))
    .limit(1);
  return user ?? null;
}

export interface Credentials {
  email: string;
  password: string;
  name?: string;
}

/**
 * Create an account.
 *
 * The duplicate check happens twice: once as a friendly lookup, and once by
 * catching the unique-index violation, because two simultaneous registrations
 * would both pass the lookup. The index is the actual guarantee.
 */
export async function registerUser(input: Credentials): Promise<User> {
  const email = normaliseEmail(input.email);
  if (!email.includes("@")) throw badRequest("Enter a valid email address.");
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  const existing = await getUserByEmail(email);
  if (existing) throw duplicate("An account with that email already exists.");

  const name = input.name?.trim() || email.split("@")[0];
  const passwordHash = await hashPassword(input.password);

  try {
    const [user] = await db
      .insert(users)
      .values({ id: createId("usr"), email, name, passwordHash })
      .returning();
    await getOrCreatePreferences(user.id);
    return user;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/users_email_key|unique/i.test(message)) {
      throw duplicate("An account with that email already exists.");
    }
    throw error;
  }
}

/**
 * Verify credentials.
 *
 * The same message comes back whether the email is unknown or the password is
 * wrong, so the response cannot be used to work out which emails are
 * registered. An unknown email still runs a hash comparison, so both paths take
 * about the same time.
 */
export async function authenticateUser(input: { email: string; password: string }): Promise<User> {
  const user = await getUserByEmail(input.email);
  const ok = await verifyPassword(input.password, user?.passwordHash ?? null);
  if (!user || !ok) throw unauthenticated("That email and password do not match.");
  return user;
}

/** Set or replace a password on an existing row. Used by the seed script. */
export async function setPassword(userId: string, password: string): Promise<void> {
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export interface LibraryStats {
  playlists: number;
  savedTracks: number;
  bucketLists: number;
  savedTitles: number;
  searches: number;
}

export async function libraryStats(userId: string): Promise<LibraryStats> {
  const [playlistCounts, bucketCounts, searches] = await Promise.all([
    countPlaylists(userId),
    countBucketLists(userId),
    db
      .select({ count: sql<number>`count(*)` })
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId)),
  ]);
  return {
    playlists: playlistCounts.lists,
    savedTracks: playlistCounts.tracks,
    bucketLists: bucketCounts.lists,
    savedTitles: bucketCounts.titles,
    searches: Number(searches[0]?.count ?? 0),
  };
}
