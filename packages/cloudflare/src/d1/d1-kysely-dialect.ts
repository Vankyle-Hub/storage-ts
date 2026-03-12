import {
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type DialectAdapter,
  type Driver,
  type Kysely,
  type QueryCompiler,
  type QueryResult,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  CompiledQuery,
} from "kysely";

export class D1Dialect implements Dialect {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  createDriver(): Driver {
    return new D1Driver(this.db);
  }

  createQueryCompiler(): QueryCompiler {
    return new SqliteQueryCompiler();
  }

  createAdapter(): DialectAdapter {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<unknown>): DatabaseIntrospector {
    return new SqliteIntrospector(db);
  }
}

class D1Driver implements Driver {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async init(): Promise<void> {
    // No initialization needed
  }

  async acquireConnection(): Promise<DatabaseConnection> {
    return new D1Connection(this.db);
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    // D1 doesn't support transactions in the traditional sense
    // Batch operations are used instead
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    // D1 doesn't support transactions
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    // D1 doesn't support transactions
  }

  async releaseConnection(connection: DatabaseConnection): Promise<void> {
    // No-op
  }

  async destroy(): Promise<void> {
    // No-op
  }
}

class D1Connection implements DatabaseConnection {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.db.prepare(sql).bind(...parameters);
    const result = await stmt.all();

    if (result.error) {
      throw new Error(result.error);
    }

    const rows = (result.results ?? []) as R[];

    const numAffectedRows = result.meta.changes > 0
      ? BigInt(result.meta.changes)
      : undefined;

    const insertId = result.meta.last_row_id === null || result.meta.last_row_id === undefined
      ? undefined
      : BigInt(result.meta.last_row_id);

    return {
      rows,
      ...(numAffectedRows !== undefined ? { numAffectedRows } : {}),
      ...(insertId !== undefined ? { insertId } : {}),
    } as QueryResult<R>;
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("D1 does not support streaming queries");
  }
}
