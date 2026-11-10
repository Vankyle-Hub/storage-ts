import { ValidationError } from "@vankyle/storage-shared";

/**
 * Maximum length of an object key, in UTF-8 bytes.
 *
 * 1024 bytes is the object key limit of S3 and R2, and it keeps the
 * `(provider, bucket, object_key)` unique index entry inside the limits of
 * every supported metadata database. The limit is in bytes, not characters:
 * both the storage providers and the database index limits count bytes, so a
 * key of 400 CJK characters (1200 bytes) is too long.
 */
export const MAX_OBJECT_KEY_BYTES = 1024;

const encoder = new TextEncoder();

/**
 * Checks an object key before it is used for an upload.
 *
 * @throws ValidationError (`field: "objectKey"`) when the key is empty or
 *   longer than {@link MAX_OBJECT_KEY_BYTES} UTF-8 bytes.
 */
export function assertValidObjectKey(objectKey: string): void {
  if (objectKey.length === 0) {
    throw new ValidationError("Object key must not be empty", "objectKey");
  }
  const byteLength = encoder.encode(objectKey).byteLength;
  if (byteLength > MAX_OBJECT_KEY_BYTES) {
    throw new ValidationError(
      `Object key is ${byteLength} bytes long; the maximum is ${MAX_OBJECT_KEY_BYTES} bytes (UTF-8)`,
      "objectKey",
    );
  }
}
