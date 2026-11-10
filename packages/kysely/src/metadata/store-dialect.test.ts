import { describe, it, expect } from "vitest";
import {
  Kysely,
  MysqlAdapter,
  MysqlIntrospector,
  MysqlQueryCompiler,
  type CompiledQuery,
  type QueryResult,
} from "kysely";
import { MetadataError } from "@vankyle/storage-shared";
import { KyselyMetadataStore } from "@vankyle/storage-kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";
import { StoreDialect, detectDatabaseType } from "@/metadata/store-dialect";
import { computeLocatorHash } from "@/metadata/locator-hash";

/** A Kysely instance on the MySQL adapter whose driver answers from `respond`. */
function mysqlKysely(
  respond: (query: CompiledQuery) => unknown[],
): { db: Kysely<StorageDatabase>; queries: CompiledQuery[] } {
  const queries: CompiledQuery[] = [];
  const db = new Kysely<StorageDatabase>({
    dialect: {
      createDriver: () => ({
        async init() {},
        async acquireConnection() {
          return {
            async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
              queries.push(query);
              return { rows: respond(query) as R[] };
            },
            // eslint-disable-next-line require-yield
            async *streamQuery() {
              throw new Error("unused");
            },
          };
        },
        async beginTransaction() {},
        async commitTransaction() {},
        async rollbackTransaction() {},
        async releaseConnection() {},
        async destroy() {},
      }),
      createQueryCompiler: () => new MysqlQueryCompiler(),
      createAdapter: () => new MysqlAdapter(),
      createIntrospector: (kysely) => new MysqlIntrospector(kysely),
    },
  });
  return { db, queries };
}

const INSTANT = new Date("2026-01-31T08:00:00.123Z");

describe("StoreDialect.timestamp", () => {
  const { db } = mysqlKysely(() => []);

  it("keeps the Date on postgres", () => {
    const dialect = new StoreDialect(db, { databaseType: "postgres" });
    expect(dialect.timestamp(INSTANT)).toBe(INSTANT);
  });

  it("writes ISO-8601 UTC text on sqlite", () => {
    const dialect = new StoreDialect(db, { databaseType: "sqlite" });
    expect(dialect.timestamp(INSTANT)).toBe("2026-01-31T08:00:00.123Z");
  });

  it("writes a UTC DATETIME(3) literal on mysql", () => {
    const dialect = new StoreDialect(db, { databaseType: "mysql" });
    expect(dialect.timestamp(INSTANT)).toBe("2026-01-31 08:00:00.123");
  });

  it("maps missing values to null", () => {
    const dialect = new StoreDialect(db, { databaseType: "mysql" });
    expect(dialect.timestampOrNull(undefined)).toBeNull();
    expect(dialect.timestampOrNull(null)).toBeNull();
    expect(dialect.timestampOrNull(INSTANT)).toBe("2026-01-31 08:00:00.123");
  });
});

describe("mysql detection and driver check", () => {
  it("detects mysql from the adapter", () => {
    const { db } = mysqlKysely(() => []);
    expect(detectDatabaseType(db)).toBe("mysql");
    expect(new KyselyMetadataStore(db).databaseType).toBe("mysql");
  });

  it("accepts a driver that returns DATETIME as a UTC Date", async () => {
    const { db } = mysqlKysely(() => [{ probe: new Date(Date.UTC(2000, 0, 1)) }]);
    const dialect = new StoreDialect(db);
    await expect(dialect.ensureReady(db)).resolves.toBeUndefined();
  });

  it("accepts a driver that returns DATETIME as text", async () => {
    const { db } = mysqlKysely(() => [{ probe: "2000-01-01 00:00:00.000" }]);
    await expect(new StoreDialect(db).ensureReady(db)).resolves.toBeUndefined();
  });

  it("refuses a driver that builds the Date in another zone", async () => {
    // What mysql2 returns with its default `timezone: "local"` at UTC+8.
    const shifted = new Date(Date.UTC(2000, 0, 1) - 8 * 3600_000);
    const { db } = mysqlKysely(() => [{ probe: shifted }]);
    const store = new KyselyMetadataStore(db);

    await expect(store.uploads.getSession("s1")).rejects.toThrow(MetadataError);
    await expect(store.blobs.getBlob("b1")).rejects.toThrow(/timezone: "Z"/);
  });

  it("probes once and caches success, but retries after a failure", async () => {
    let answer: unknown = new Date(0);
    const { db, queries } = mysqlKysely(() => [{ probe: answer }]);
    const dialect = new StoreDialect(db);

    await expect(dialect.ensureReady(db)).rejects.toThrow(MetadataError);
    answer = new Date(Date.UTC(2000, 0, 1));
    await dialect.ensureReady(db);
    await dialect.ensureReady(db);
    await dialect.ensureReady(db);

    expect(queries).toHaveLength(2);
  });

  it("does not probe on other databases", () => {
    const { db, queries } = mysqlKysely(() => []);
    const dialect = new StoreDialect(db, { databaseType: "postgres" });
    expect(dialect.ensureReady(db)).toBeUndefined();
    expect(queries).toHaveLength(0);
  });
});

describe("mysql write path", () => {
  it("inserts without RETURNING and reads the row back by id", async () => {
    const row = {
      id: "ref-1",
      blob_id: "b1",
      ref_type: "file-version",
      ref_id: "v1",
      created_at: new Date(Date.UTC(2026, 0, 31, 8)),
    };
    const { db, queries } = mysqlKysely((query) => {
      if (query.sql.includes("cast(")) return [{ probe: new Date(Date.UTC(2000, 0, 1)) }];
      return query.sql.startsWith("select") ? [row] : [];
    });
    const store = new KyselyMetadataStore(db);

    const reference = await store.blobs.createReference({
      id: "ref-1",
      blobId: "b1",
      refType: "file-version",
      refId: "v1",
    });

    expect(reference.id).toBe("ref-1");
    const statements = queries.map((query) => query.sql);
    expect(statements.some((s) => /returning/i.test(s))).toBe(false);
    const insert = queries.find((query) => query.sql.startsWith("insert"))!;
    // Time is bound as a UTC literal, never as a Date.
    expect(insert.parameters.some((p) => p instanceof Date)).toBe(false);
    expect(insert.parameters.at(-1)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(statements.at(-1)).toMatch(/^select \* from `blob_references` where `id` = \?/);
  });

  it("adds the locator hash when creating a blob", async () => {
    const { db, queries } = mysqlKysely((query) => {
      if (query.sql.includes("cast(")) return [{ probe: "2000-01-01 00:00:00.000" }];
      return query.sql.startsWith("select")
        ? [{ id: "b1", provider: "s3", bucket: "bucket", object_key: "key", size: 1, status: "active", created_at: "2026-01-31 08:00:00.000", updated_at: "2026-01-31 08:00:00.000", deleted_at: null, metadata: null, mime_type: null, sha256: null, etag: null, storage_class: null }]
        : [];
    });
    const store = new KyselyMetadataStore(db);

    const blob = await store.blobs.createBlob({
      id: "b1",
      provider: "s3" as never,
      bucket: "bucket",
      objectKey: "key",
      size: 1,
    });

    const insert = queries.find((query) => query.sql.startsWith("insert"))!;
    expect(insert.sql).toContain("`locator_hash`");
    expect(insert.parameters).toContain(await computeLocatorHash("s3", "bucket", "key"));
    // dateStrings-style text is read as UTC.
    expect(blob.createdAt.toISOString()).toBe("2026-01-31T08:00:00.000Z");
  });
});

describe("computeLocatorHash", () => {
  it("is a stable 64-character lowercase hex SHA-256", async () => {
    const hash = await computeLocatorHash("s3", "bucket", "path/to/key");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await computeLocatorHash("s3", "bucket", "path/to/key")).toBe(hash);
  });

  it("separates the parts unambiguously", async () => {
    const a = await computeLocatorHash("s3", "a", "b/c");
    const b = await computeLocatorHash("s3", "a/b", "c");
    const c = await computeLocatorHash("s3a", "", "b/c");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("distinguishes case and trailing spaces", async () => {
    const hashes = await Promise.all(
      ["Key", "key", "key "].map((key) => computeLocatorHash("s3", "bucket", key)),
    );
    expect(new Set(hashes).size).toBe(3);
  });
});
