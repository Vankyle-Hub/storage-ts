import type { Migration, MigrationProvider } from "kysely/migration";
import type { DatabaseType, MigrationOptions } from "./types";
import { createMigration0001 } from "./0001_init";
import { createMysqlMigration0001 } from "./0001_init.mysql";
import { createMigration0002 } from "./0002_timestamptz";
import { createMigration0003 } from "./0003_add_tags";

/**
 * All migrations for a database type, keyed by name. Kysely's `Migrator`
 * runs them in key order. Every database type has the same keys, so the
 * migration history reads the same everywhere; a migration that has nothing
 * to do for a type (for example `0002_timestamptz` on MySQL, whose 0001 is
 * already time-zone-safe) is recorded without running a statement.
 *
 * @param options Parameters for data-converting migrations; see
 *   {@link MigrationOptions}. Only `0002_timestamptz` on PostgreSQL uses
 *   them today.
 * @throws ValidationError when `options.timestampSourceTimeZone` is not a
 *   plausible time zone.
 */
export function createMigrations(
  dbType: DatabaseType,
  options?: MigrationOptions,
): Record<string, Migration> {
  return {
    "0001_init":
      dbType === "mysql"
        ? createMysqlMigration0001()
        : createMigration0001(dbType),
    "0002_timestamptz": createMigration0002(dbType, options),
    "0003_add_tags": createMigration0003(dbType),
  };
}

export function createMigrationProvider(
  dbType: DatabaseType,
  options?: MigrationOptions,
): MigrationProvider {
  // Build once so invalid options fail here, not on the first migrate call.
  const migrations = createMigrations(dbType, options);
  return {
    getMigrations: () => Promise.resolve(migrations),
  };
}

export { generateMigrationSql, generateAllMigrationSql } from "./sql-generator";
export type { DatabaseType, MigrationOptions } from "./types";
