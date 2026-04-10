import type { Migration, MigrationProvider } from "kysely";
import type { DatabaseType } from "./types";
import { createMigration0001 } from "./0001_init";

export function createMigrations(dbType: DatabaseType): Record<string, Migration> {
  return {
    "0001_init": createMigration0001(dbType),
  };
}

export function createMigrationProvider(dbType: DatabaseType): MigrationProvider {
  return {
    getMigrations: () => Promise.resolve(createMigrations(dbType)),
  };
}

export { generateMigrationSql, generateAllMigrationSql } from "./sql-generator";
export type { DatabaseType } from "./types";
