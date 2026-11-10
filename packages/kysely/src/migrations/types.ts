import type { ColumnDataType } from "kysely";
import { ValidationError } from "@vankyle/storage-shared";

/**
 * The database family a migration is generated for.
 *
 * - `"postgres"` — PostgreSQL.
 * - `"mysql"` — MySQL. Until 0.5.0 MySQL was covered by `"postgres"`; it has
 *   its own value because the two diverge from migration 0002 onwards
 *   (PostgreSQL has `timestamptz`, MySQL does not).
 * - `"sqlite"` — SQLite and Cloudflare D1.
 */
export type DatabaseType = "postgres" | "mysql" | "sqlite";

export interface MigrationOptions {
  /**
   * PostgreSQL only — the time zone the existing `timestamp` (without time
   * zone) values were written in. Migration 0002 interprets the old values
   * as wall-clock times in this zone when converting them to `timestamptz`.
   *
   * The old values are the local wall-clock time of the process that wrote
   * them (the Node.js process time zone, e.g. the `TZ` environment
   * variable), not the database server's zone. Use an IANA name
   * (`"Asia/Shanghai"`) or a fixed offset. Defaults to `"UTC"`.
   */
  readonly timestampSourceTimeZone?: string | undefined;
}

export const DEFAULT_TIMESTAMP_SOURCE_TIME_ZONE = "UTC";

// The zone is inlined into DDL as a literal (ALTER ... USING cannot take bind
// parameters), so restrict it to the characters time zone names and offsets
// are made of.
const TIME_ZONE_PATTERN = /^[A-Za-z0-9_+\-/:]{1,64}$/;

/**
 * Resolves the source time zone for migration 0002.
 *
 * @throws ValidationError (`field: "timestampSourceTimeZone"`) when the value
 *   is not a plausible time zone name or offset.
 */
export function resolveTimestampSourceTimeZone(
  options?: MigrationOptions,
): string {
  const timeZone =
    options?.timestampSourceTimeZone ?? DEFAULT_TIMESTAMP_SOURCE_TIME_ZONE;
  if (!TIME_ZONE_PATTERN.test(timeZone)) {
    throw new ValidationError(
      `Invalid timestampSourceTimeZone: '${timeZone}'. Use an IANA time zone name such as 'UTC' or 'Asia/Shanghai', or a fixed offset.`,
      "timestampSourceTimeZone",
    );
  }
  return timeZone;
}

export interface ColumnTypeMap {
  uuid: ColumnDataType;
  bigint: ColumnDataType;
  timestamp: ColumnDataType;
  varchar(n: number): ColumnDataType;
  text: ColumnDataType;
  integer: ColumnDataType;
}

/**
 * Column types used by migration 0001. These are frozen: 0001 has shipped,
 * so `"mysql"` keeps the exact types it received while it was still covered
 * by `"postgres"`. Later migrations change types with their own statements.
 */
export function getColumnTypes(dbType: DatabaseType): ColumnTypeMap {
  if (dbType === "sqlite") {
    return {
      uuid: "text",
      bigint: "integer",
      timestamp: "text",
      varchar: () => "text",
      text: "text",
      integer: "integer",
    };
  }
  return {
    uuid: "varchar(36)",
    bigint: "bigint",
    timestamp: "timestamp",
    varchar: (n) => `varchar(${n})` as ColumnDataType,
    text: "text",
    integer: "integer",
  };
}
