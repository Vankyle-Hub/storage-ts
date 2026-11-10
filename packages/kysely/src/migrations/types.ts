import type { ColumnDataType } from "kysely";
import { ValidationError } from "@vankyle/storage-shared";

/**
 * The database family a migration is generated for.
 *
 * - `"postgres"` — PostgreSQL.
 * - `"mysql"` — MySQL 5.6.4+, 5.7 and 8.x. New in 0.5.0, with a schema of
 *   its own (see `0001_init.mysql.ts`). Up to 0.4.x the documentation placed
 *   MySQL under `"postgres"`, which never worked: do not use `"postgres"`
 *   for a MySQL database.
 * - `"sqlite"` — SQLite and Cloudflare D1.
 *
 * SQL Server is not supported.
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
 * Column types used by migration 0001 on PostgreSQL and SQLite. These are
 * frozen: 0001 has shipped. Later migrations change types with their own
 * statements. MySQL does not use this map; its 0001 is written out in full
 * in `0001_init.mysql.ts`.
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
