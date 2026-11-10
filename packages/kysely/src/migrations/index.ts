import type { Migration, MigrationProvider } from "kysely/migration";
import type { DatabaseType, MigrationOptions } from "./types";
import { createMigration0001 } from "./0001_init";
import { createMigration0002 } from "./0002_timestamptz";

/**
 * All migrations for a database type, keyed by name. Kysely's `Migrator`
 * runs them in key order.
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
    "0001_init": createMigration0001(dbType),
    "0002_timestamptz": createMigration0002(dbType, options),
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
