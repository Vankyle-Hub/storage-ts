// A date-time with no zone designator: 'YYYY-MM-DD HH:MM[:SS[.fff]]' (the
// SQLite CURRENT_TIMESTAMP shape) or the same with a 'T' separator.
const ZONELESS_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

/**
 * Converts a time column value to a `Date`.
 *
 * PostgreSQL and MySQL drivers return `Date` objects, which pass through.
 * SQLite and D1 return text. The canonical text form is ISO-8601 UTC
 * (`2026-01-31T08:00:00.000Z`); a value without a zone designator is read as
 * UTC, because that is what SQLite's `CURRENT_TIMESTAMP` writes. Leaving
 * such a value to `new Date()` would read it in the process time zone and
 * shift the instant.
 */
export function ensureDate(value: Date | string): Date {
  if (typeof value !== "string") {
    return value;
  }
  const zoneless = ZONELESS_DATE_TIME.exec(value.trim());
  return new Date(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : value);
}
