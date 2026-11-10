import type { Kysely } from "kysely";
import type { Migration } from "kysely/migration";
import { sql } from "kysely";
import type { DatabaseType, MigrationOptions } from "./types";
import { resolveTimestampSourceTimeZone } from "./types";

interface TimestampColumn {
  readonly name: string;
  /** Created by 0001 as `NOT NULL DEFAULT CURRENT_TIMESTAMP`. */
  readonly hasDefault: boolean;
}

/**
 * Every time column created by migration 0001, by table. Frozen with 0001:
 * columns added by later migrations are created time-zone-aware from the
 * start and do not belong here.
 */
export const TIMESTAMP_COLUMNS_0001: Readonly<
  Record<string, readonly TimestampColumn[]>
> = {
  upload_sessions: [
    { name: "created_at", hasDefault: true },
    { name: "updated_at", hasDefault: true },
    { name: "expires_at", hasDefault: false },
    { name: "completed_at", hasDefault: false },
    { name: "aborted_at", hasDefault: false },
  ],
  uploaded_parts: [{ name: "uploaded_at", hasDefault: true }],
  blobs: [
    { name: "created_at", hasDefault: true },
    { name: "updated_at", hasDefault: true },
    { name: "deleted_at", hasDefault: false },
  ],
  blob_references: [{ name: "created_at", hasDefault: true }],
  files: [
    { name: "created_at", hasDefault: true },
    { name: "updated_at", hasDefault: true },
    { name: "deleted_at", hasDefault: false },
  ],
  file_versions: [{ name: "created_at", hasDefault: true }],
};

// What SQLite's CURRENT_TIMESTAMP produces: 'YYYY-MM-DD HH:MM:SS', always UTC.
const SQLITE_LEGACY_TIMESTAMP_GLOB =
  "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]";

/**
 * Migration 0002 — make every time column an unambiguous instant.
 *
 * - **PostgreSQL:** `timestamp` → `timestamptz`. Existing values are
 *   wall-clock times in the time zone of the process that wrote them; they
 *   are converted with `AT TIME ZONE <timestampSourceTimeZone>` (default
 *   `'UTC'`). One `ALTER TABLE` per table, so each table is rewritten once.
 * - **MySQL:** nothing to do. `TIMESTAMP` already stores a UTC instant and
 *   MySQL has no `timestamptz`. The migration is recorded but runs no
 *   statement.
 * - **SQLite / D1:** the columns stay `text`. The canonical format is
 *   ISO-8601 UTC (`2026-01-31T08:00:00.000Z`). Values in the
 *   `CURRENT_TIMESTAMP` format (`2026-01-31 08:00:00`, UTC by SQLite's
 *   definition) are rewritten to it; values already carrying a zone are left
 *   alone.
 */
export function createMigration0002(
  dbType: DatabaseType,
  options?: MigrationOptions,
): Migration {
  // Validate eagerly for every database type, so a typo fails at
  // construction rather than only on the PostgreSQL code path.
  const timeZone = resolveTimestampSourceTimeZone(options);

  return {
    async up(db: Kysely<unknown>): Promise<void> {
      if (dbType === "postgres") {
        await alterPostgresTimestamps(db, "timestamptz", timeZone);
      } else if (dbType === "sqlite") {
        await normalizeSqliteTimestamps(db);
      }
    },

    async down(db: Kysely<unknown>): Promise<void> {
      if (dbType === "postgres") {
        // timestamptz AT TIME ZONE z yields the wall-clock time in z, which
        // is exactly what the column held before `up`.
        await alterPostgresTimestamps(db, "timestamp", timeZone);
      }
      // SQLite: the ISO-8601 form is still valid input for the mappers of
      // every release, so there is nothing to undo.
    },
  };
}

async function alterPostgresTimestamps(
  db: Kysely<unknown>,
  targetType: "timestamptz" | "timestamp",
  timeZone: string,
): Promise<void> {
  for (const [table, columns] of Object.entries(TIMESTAMP_COLUMNS_0001)) {
    const actions = columns.flatMap((column) => {
      const ref = sql.ref(column.name);
      const alterType = sql`alter column ${ref} type ${sql.raw(targetType)} using ${ref} at time zone ${sql.lit(timeZone)}`;
      if (!column.hasDefault) {
        return [alterType];
      }
      // Re-create the default so it is stored as a plain CURRENT_TIMESTAMP
      // of the new type instead of the old expression wrapped in a cast.
      return [
        sql`alter column ${ref} drop default`,
        alterType,
        sql`alter column ${ref} set default CURRENT_TIMESTAMP`,
      ];
    });

    await sql`alter table ${sql.table(table)} ${sql.join(actions, sql`, `)}`.execute(db);
  }
}

async function normalizeSqliteTimestamps(db: Kysely<unknown>): Promise<void> {
  for (const [table, columns] of Object.entries(TIMESTAMP_COLUMNS_0001)) {
    for (const column of columns) {
      const ref = sql.ref(column.name);
      await sql`update ${sql.table(table)} set ${ref} = strftime('%Y-%m-%dT%H:%M:%fZ', ${ref}) where ${ref} glob ${sql.lit(SQLITE_LEGACY_TIMESTAMP_GLOB)}`.execute(db);
    }
  }
}
