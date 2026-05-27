import type { Migration, MigrationProvider } from "kysely";
import type { DatabaseType } from "./types";
import { createMigration0001 } from "./0001_init";
import { createMigration0002 } from "./0002_add_tags";

export function createMigrations(dbType: DatabaseType): Record<string, Migration> {
  return {
    "0001_init": createMigration0001(dbType),
    "0002_add_tags": createMigration0002(dbType),
  };
}

export function createMigrationProvider(dbType: DatabaseType): MigrationProvider {
  return {
    getMigrations: () => Promise.resolve(createMigrations(dbType)),
  };
}

export { generateMigrationSql, generateAllMigrationSql } from "./sql-generator";
export type { DatabaseType } from "./types";
