/**
 * Password hashing using Web Crypto API (PBKDF2).
 * Compatible with Cloudflare Workers (no Node.js crypto).
 */

const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

async function deriveKey(password: string, salt: BufferSource): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Hash a password with a random salt.
 * Returns "salt:hash" string.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await deriveKey(password, salt);
  return `${toHex(salt.buffer as ArrayBuffer)}:${toHex(key)}`;
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = fromHex(saltHex) as unknown as BufferSource;
  const key = await deriveKey(password, salt);
  return toHex(key) === hashHex;
}
