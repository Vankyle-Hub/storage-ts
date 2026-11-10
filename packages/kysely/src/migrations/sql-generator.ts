import {
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type QueryCompiler,
  type QueryResult,
} from "kysely";
import { ValidationError } from "@vankyle/storage-shared";
import type { DatabaseType, MigrationOptions } from "./types";
import { createMigrations } from "./index";

class SqlCollector {
  readonly statements: string[] = [];
}

class CollectingConnection implements DatabaseConnection {
  constructor(private readonly collector: SqlCollector) {}

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    this.collector.statements.push(compiledQuery.sql);
    return { rows: [] as R[] };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    // no-op — SQL generation never streams
  }
}

class CollectingDriver implements Driver {
  constructor(private readonly collector: SqlCollector) {}
  async init(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new CollectingConnection(this.collector);
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
  async destroy(): Promise<void> {}
}

function makeCollectingDialect(
  dbType: DatabaseType,
  collector: SqlCollector,
): Dialect {
  const driver = new CollectingDriver(collector);
  if (dbType === "sqlite") {
    return {
      createDriver: () => driver,
      createQueryCompiler: (): QueryCompiler => new SqliteQueryCompiler(),
      createAdapter: (): DialectAdapter => new SqliteAdapter(),
      createIntrospector: (db): DatabaseIntrospector =>
        new SqliteIntrospector(db),
    };
  }
  if (dbType === "mysql") {
    return {
      createDriver: () => driver,
      createQueryCompiler: (): QueryCompiler => new MysqlQueryCompiler(),
      createAdapter: (): DialectAdapter => new MysqlAdapter(),
      createIntrospector: (db): DatabaseIntrospector =>
        new MysqlIntrospector(db),
    };
  }
  return {
    createDriver: () => driver,
    createQueryCompiler: (): QueryCompiler => new PostgresQueryCompiler(),
    createAdapter: (): DialectAdapter => new PostgresAdapter(),
    createIntrospector: (db): DatabaseIntrospector =>
      new PostgresIntrospector(db),
  };
}

/**
 * Returns the `up` SQL of one migration as a plain string, statements
 * separated by `;` and a blank line.
 *
 * A migration that runs no statement for the given database type (for
 * example `0002_timestamptz` on MySQL) yields a single SQL comment, so the
 * result is never an empty script.
 *
 * @param options Same as for `createMigrations`; e.g. the source time zone
 *   baked into the PostgreSQL SQL of `0002_timestamptz`.
 * @throws ValidationError (`field: "migrationKey"`) for an unknown key.
 */
export async function generateMigrationSql(
  migrationKey: string,
  dbType: DatabaseType,
  options?: MigrationOptions,
): Promise<string> {
  const collector = new SqlCollector();
  const db = new Kysely<unknown>({
    dialect: makeCollectingDialect(dbType, collector),
  });
  try {
    const migrations = createMigrations(dbType, options);
    const migration = migrations[migrationKey];
    if (!migration) {
      throw new ValidationError(
        `Unknown migration key: '${migrationKey}'`,
        "migrationKey",
      );
    }
    await migration.up(db);
    if (collector.statements.length === 0) {
      return `-- ${migrationKey}: no statements required for ${dbType}`;
    }
    return collector.statements.join(";\n\n") + ";";
  } finally {
    await db.destroy();
  }
}

/** `generateMigrationSql` for every migration, keyed by migration name. */
export async function generateAllMigrationSql(
  dbType: DatabaseType,
  options?: MigrationOptions,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(createMigrations(dbType, options))) {
    result[key] = await generateMigrationSql(key, dbType, options);
  }
  return result;
}
