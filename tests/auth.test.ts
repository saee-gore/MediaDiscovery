import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, destroyTestDatabase, truncateUserData } from "./helpers/database";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { signSession, verifySession } from "@/server/auth/session";
import { AppError } from "@/server/lib/errors";
import { authenticateUser, getUserByEmail, registerUser, setPassword } from "@/server/services/users";
import { getOrCreatePreferences } from "@/server/services/preferences";

beforeAll(async () => {
  await createTestDatabase();
});

afterAll(async () => {
  await destroyTestDatabase();
});

beforeEach(async () => {
  await truncateUserData();
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("Correct horse battery", stored)).toBe(false);
  });

  it("produces a different hash for the same password each time", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("never stores the password in the hash string", async () => {
    const stored = await hashPassword("hunter2-and-then-some");
    expect(stored).not.toContain("hunter2");
    expect(stored.startsWith("scrypt$")).toBe(true);
  });

  it("treats a missing or malformed hash as a failed sign-in rather than an error", async () => {
    expect(await verifyPassword("anything", null)).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
    expect(await verifyPassword("anything", "not-a-hash")).toBe(false);
    expect(await verifyPassword("anything", "scrypt$16384$8$1$zz$zz")).toBe(false);
  });
});

describe("sessions", () => {
  it("round-trips a signed session", async () => {
    const token = await signSession({ userId: "usr_1", email: "a@b.test", name: "Ada" });
    const session = await verifySession(token);
    expect(session).toEqual({ userId: "usr_1", email: "a@b.test", name: "Ada" });
  });

  it("rejects a tampered, empty or absent token instead of throwing", async () => {
    const token = await signSession({ userId: "usr_1", email: "a@b.test", name: "Ada" });
    expect(await verifySession(`${token}x`)).toBeNull();
    expect(await verifySession("")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
    expect(await verifySession("a.b.c")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const original = process.env.AUTH_SECRET;
    const token = await signSession({ userId: "usr_1", email: "a@b.test", name: "Ada" });
    process.env.AUTH_SECRET = "a-completely-different-secret-value";
    try {
      expect(await verifySession(token)).toBeNull();
    } finally {
      process.env.AUTH_SECRET = original;
    }
  });
});

describe("registration", () => {
  it("creates an account, normalises the email and signs in with it", async () => {
    const user = await registerUser({ email: "  Ada@Example.TEST ", password: "password123" });
    expect(user.email).toBe("ada@example.test");

    const signedIn = await authenticateUser({ email: "ADA@example.test", password: "password123" });
    expect(signedIn.id).toBe(user.id);
  });

  it("gives every new account its preference row", async () => {
    const user = await registerUser({ email: "prefs@example.test", password: "password123" });
    const preferences = await getOrCreatePreferences(user.id);
    expect(preferences.userId).toBe(user.id);
  });

  it("defaults the display name to the local part of the email", async () => {
    const user = await registerUser({ email: "marta@example.test", password: "password123" });
    expect(user.name).toBe("marta");
  });

  it("refuses a duplicate email", async () => {
    await registerUser({ email: "dupe@example.test", password: "password123" });
    await expect(
      registerUser({ email: "DUPE@example.test", password: "otherpassword" }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
  });

  it("refuses a short password and an invalid email", async () => {
    await expect(registerUser({ email: "short@example.test", password: "abc" })).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(registerUser({ email: "not-an-email", password: "password123" })).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("does not store the password anywhere in the row", async () => {
    await registerUser({ email: "secret@example.test", password: "plaintext-secret" });
    const stored = await getUserByEmail("secret@example.test");
    expect(JSON.stringify(stored)).not.toContain("plaintext-secret");
  });
});

describe("sign-in", () => {
  it("rejects a wrong password with a 401 and a message that reveals nothing", async () => {
    await registerUser({ email: "real@example.test", password: "password123" });

    const attempt = async (email: string, password: string): Promise<AppError> => {
      try {
        await authenticateUser({ email, password });
      } catch (error) {
        return error as AppError;
      }
      throw new Error("expected the sign-in to be rejected");
    };

    const wrongPassword = await attempt("real@example.test", "nope12345");
    const unknownEmail = await attempt("ghost@example.test", "password123");

    for (const error of [wrongPassword, unknownEmail]) {
      expect(error).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    }

    // Identical message either way, so it cannot be used to enumerate accounts.
    expect(wrongPassword.userMessage).toBe(unknownEmail.userMessage);
  });

  it("refuses an account that has no password set", async () => {
    const { createUser } = await import("@/server/services/users");
    await createUser({ email: "nopass@example.test", name: "No Password" });
    await expect(
      authenticateUser({ email: "nopass@example.test", password: "" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      authenticateUser({ email: "nopass@example.test", password: "anything" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("honours a password that was changed after registration", async () => {
    const user = await registerUser({ email: "rotate@example.test", password: "password123" });
    await setPassword(user.id, "a-new-password");

    await expect(
      authenticateUser({ email: "rotate@example.test", password: "password123" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    const signedIn = await authenticateUser({ email: "rotate@example.test", password: "a-new-password" });
    expect(signedIn.id).toBe(user.id);
  });
});
