import {
  Kysely,
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
import type { DatabaseType } from "./types";
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
  return {
    createDriver: () => driver,
    createQueryCompiler: (): QueryCompiler => new PostgresQueryCompiler(),
    createAdapter: (): DialectAdapter => new PostgresAdapter(),
    createIntrospector: (db): DatabaseIntrospector =>
      new PostgresIntrospector(db),
  };
}

export async function generateMigrationSql(
  migrationKey: string,
  dbType: DatabaseType,
): Promise<string> {
  const collector = new SqlCollector();
  const db = new Kysely<unknown>({
    dialect: makeCollectingDialect(dbType, collector),
  });
  try {
    const migrations = createMigrations(dbType);
    const migration = migrations[migrationKey];
    if (!migration) {
      throw new Error(`Unknown migration key: '${migrationKey}'`);
    }
    await migration.up(db);
    return collector.statements.join(";\n\n") + ";";
  } finally {
    await db.destroy();
  }
}

export async function generateAllMigrationSql(
  dbType: DatabaseType,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const key of Object.keys(createMigrations(dbType))) {
    result[key] = await generateMigrationSql(key, dbType);
  }
  return result;
}
