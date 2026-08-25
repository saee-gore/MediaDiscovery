/**
 * Password hashing.
 *
 * scrypt from node:crypto rather than a native bcrypt binding: it is memory-hard,
 * it is in the standard library, and it has no build step — which matters because
 * a native module that fails to compile turns every sign-in into an opaque 500.
 *
 * Stored format: `scrypt$<N>$<r>$<p>$<salt-hex>$<hash-hex>`. Keeping the
 * parameters in the string means the cost can be raised later without
 * invalidating hashes that already exist.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16_384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
/** scrypt needs roughly 128 * N * r bytes; the default 32MB cap is too low for N=16384. */
const MAXMEM = 64 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;

async function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAXMEM });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

/**
 * Constant-time comparison, and never throws: a malformed or missing hash is a
 * failed sign-in, not a server error.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  try {
    const [scheme, n, r, p, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = await derive(password, Buffer.from(saltHex, "hex"), Number(n), Number(r), Number(p));
    if (expected.length !== actual.length) return false;
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
