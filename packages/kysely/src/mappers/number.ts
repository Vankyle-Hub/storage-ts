/**
 * Converts a `bigint` column value to a JavaScript number.
 *
 * Drivers disagree on 64-bit integers: SQLite returns a number, but the
 * PostgreSQL driver (`pg`) returns `bigint` columns as **strings**, and some
 * drivers can be configured to return a `bigint`. The domain models use
 * `number` for byte sizes, so the mappers normalise here. Left as a string,
 * `"3" !== 3` makes size checks such as the `expectedSize` verification in
 * `completeUploadSession` fail for a correct upload.
 *
 * Byte sizes are far below `Number.MAX_SAFE_INTEGER` (8 PiB), so the
 * conversion is exact.
 */
export function ensureNumber(value: number | string | bigint): number {
  return typeof value === "number" ? value : Number(value);
}

/** {@link ensureNumber} for nullable columns; `null` becomes `undefined`. */
export function ensureOptionalNumber(
  value: number | string | bigint | null,
): number | undefined {
  return value === null ? undefined : ensureNumber(value);
}
