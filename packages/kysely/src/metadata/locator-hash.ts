const encoder = new TextEncoder();

/**
 * SHA-256 (lowercase hex) identifying a blob's location.
 *
 * MySQL cannot put a unique index on `(provider, bucket, object_key)` — the
 * key would be too long — so the constraint lives on this hash instead (the
 * `blobs.locator_hash` column, MySQL only). The three parts are JSON-encoded
 * as an array before hashing, which keeps them unambiguous: `("a", "b/c")`
 * and `("a/b", "c")` cannot produce the same input, and nothing is trimmed
 * or case-folded, so keys differing only in case or trailing spaces get
 * different hashes.
 *
 * Uses the Web Crypto API, available in Node.js 20+, browsers and Workers.
 */
export async function computeLocatorHash(
  provider: string,
  bucket: string,
  objectKey: string,
): Promise<string> {
  const input = encoder.encode(JSON.stringify([provider, bucket, objectKey]));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
