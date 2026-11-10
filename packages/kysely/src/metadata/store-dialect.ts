import { SqliteAdapter } from "kysely";
import type { Insertable, Kysely, Selectable } from "kysely";
import type { StorageDatabase } from "@/schema/database";
import type { DatabaseType } from "@/migrations/types";

export interface KyselyStoreOptions {
  /**
   * The database the stores talk to. It decides how time values are written
   * (see {@link StoreDialect.timestamp}).
   *
   * Optional: when omitted it is detected from the Kysely dialect — any
   * dialect built on Kysely's `SqliteAdapter` (including `D1Dialect`) is
   * `"sqlite"`, everything else `"postgres"`. Set it explicitly when you use
   * a custom dialect that the detection cannot recognise.
   */
  readonly databaseType?: DatabaseType | undefined;
}

type TableName = keyof StorageDatabase;

/**
 * The database-specific parts of the stores: how a time value is bound, and
 * how a row is written and read back.
 *
 * Every time column holds an instant, and the application layer is what
 * guarantees it: a `Date` is an instant, and this class turns it into the
 * one representation each database stores unambiguously.
 */
export class StoreDialect {
  readonly databaseType: DatabaseType;

  constructor(db: Kysely<StorageDatabase>, options?: KyselyStoreOptions) {
    this.databaseType = options?.databaseType ?? detectDatabaseType(db);
  }

  /**
   * The value to bind for a time column.
   *
   * - `postgres`: the `Date` itself; the column is `timestamptz` and the
   *   driver sends a true instant.
   * - `sqlite`: ISO-8601 UTC text (`2026-01-31T08:00:00.000Z`). SQLite has no
   *   date type and its drivers (and D1) cannot bind a `Date`. The format is
   *   fixed-width and always UTC, so the text also sorts chronologically.
   */
  timestamp(value: Date): Date | string {
    return this.databaseType === "sqlite" ? value.toISOString() : value;
  }

  /** {@link StoreDialect.timestamp} for nullable columns. */
  timestampOrNull(value: Date | null | undefined): Date | string | null {
    return value == null ? null : this.timestamp(value);
  }

  /** Inserts one row and returns it as stored. */
  async insertRow<T extends TableName>(
    db: Kysely<StorageDatabase>,
    table: T,
    values: Insertable<StorageDatabase[T]>,
  ): Promise<Selectable<StorageDatabase[T]>> {
    const row = await untyped(db)
      .insertInto(table as string)
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
    return row as Selectable<StorageDatabase[T]>;
  }

  /**
   * Updates the row with the given id and returns it as stored.
   *
   * @throws NoResultError (Kysely) when no row has that id.
   */
  async updateRowById<T extends TableName>(
    db: Kysely<StorageDatabase>,
    table: T,
    id: string,
    updates: Record<string, unknown>,
  ): Promise<Selectable<StorageDatabase[T]>> {
    const row = await untyped(db)
      .updateTable(table as string)
      .set(updates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return row as Selectable<StorageDatabase[T]>;
  }
}

/**
 * Detects the database type from the Kysely instance's dialect adapter.
 * Unknown adapters are treated as PostgreSQL, the historical default.
 */
export function detectDatabaseType(db: Kysely<StorageDatabase>): DatabaseType {
  const adapter = db.getExecutor().adapter;
  if (adapter instanceof SqliteAdapter) {
    return "sqlite";
  }
  return "postgres";
}

// The helpers above are generic over the table name. Kysely's builder types
// cannot follow a generic table through insert/update, so the query is built
// untyped here; the public signatures keep callers fully typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untyped(db: Kysely<StorageDatabase>): Kysely<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as unknown as Kysely<any>;
}
