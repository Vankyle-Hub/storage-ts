import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  sql,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type Driver,
  type QueryResult,
} from "kysely";
import { Migrator } from "kysely/migration";
import {
  DefaultStorageService,
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
} from "@vankyle/storage-core";
import type { IStorage } from "@vankyle/storage-core";
import {
  MetadataConflictError,
  UploadSessionStateError,
} from "@vankyle/storage-shared";
import {
  KyselyMetadataStore,
  createMigrationProvider,
} from "@vankyle/storage-kysely";
import type { StorageDatabase } from "@vankyle/storage-kysely";
import { detectDatabaseType } from "@/metadata/store-dialect";

// These tests run the real migrations and stores against a real SQLite
// engine (Node's built-in `node:sqlite`, Node 22.5+). Like better-sqlite3 and
// Cloudflare D1, it refuses to bind a JavaScript Date, so it catches any
// write path that forgets to serialise a time value. On older Node versions
// the suite is skipped.
const sqlite = await import("node:sqlite").catch(() => undefined);

type DatabaseSync = InstanceType<NonNullable<typeof sqlite>["DatabaseSync"]>;

/** Minimal Kysely dialect over `node:sqlite`, built on SqliteAdapter like D1Dialect. */
class NodeSqliteDialect implements Dialect {
  constructor(private readonly database: DatabaseSync) {}

  createDriver(): Driver {
    const database = this.database;
    const connection: DatabaseConnection = {
      async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
        const statement = database.prepare(query.sql);
        // No conversion of parameters: a Date reaching this point throws,
        // exactly as it does on better-sqlite3 and D1.
        const rows = statement.all(...(query.parameters as never[]));
        return { rows: rows.map((row) => ({ ...row })) as R[] };
      },
      // eslint-disable-next-line require-yield
      async *streamQuery() {
        throw new Error("not supported");
      },
    };
    return {
      async init() {},
      async acquireConnection() {
        return connection;
      },
      async beginTransaction() {
        database.exec("begin");
      },
      async commitTransaction() {
        database.exec("commit");
      },
      async rollbackTransaction() {
        database.exec("rollback");
      },
      async releaseConnection() {},
      async destroy() {},
    };
  }
  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }
  createAdapter() {
    return new SqliteAdapter();
  }
  createIntrospector(db: Kysely<unknown>) {
    return new SqliteIntrospector(db);
  }
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function fakeStorage(): IStorage {
  return {
    provider: StorageProvider.S3,
    capabilities: {
      multipartUpload: true,
      signedReadUrl: false,
      signedPutUrl: false,
      signedPartUrl: false,
    },
    putObject: async () => ({ etag: '"etag"' }),
    getObject: async () => {
      throw new Error("unused");
    },
    headObject: async () => ({ contentLength: 3, etag: '"etag"', contentType: "text/plain" }),
    deleteObject: async () => {},
    initUploadSession: async () => ({ providerUploadId: "upload-1" }),
    uploadPart: async (input) => ({ etag: '"part"', partNumber: input.partNumber, size: 3 }),
    completeUploadSession: async () => ({ etag: '"etag"' }),
    abortUploadSession: async () => {},
  };
}

describe.skipIf(!sqlite)("KyselyMetadataStore on SQLite", () => {
  let database: DatabaseSync;
  let db: Kysely<StorageDatabase>;
  let metadata: KyselyMetadataStore;

  beforeEach(async () => {
    database = new sqlite!.DatabaseSync(":memory:");
    db = new Kysely<StorageDatabase>({ dialect: new NodeSqliteDialect(database) });
    const { error } = await new Migrator({
      db,
      provider: createMigrationProvider("sqlite"),
    }).migrateToLatest();
    if (error) throw error;
    metadata = new KyselyMetadataStore(db);
  });

  afterEach(async () => {
    await db.destroy();
    database.close();
  });

  /** Every non-null value of every time column, read as raw text. */
  function rawTimestamps(): string[] {
    const columns: Record<string, string[]> = {
      upload_sessions: ["created_at", "updated_at", "expires_at", "completed_at", "aborted_at"],
      uploaded_parts: ["uploaded_at"],
      blobs: ["created_at", "updated_at", "deleted_at"],
      blob_references: ["created_at"],
      files: ["created_at", "updated_at", "deleted_at"],
      file_versions: ["created_at"],
    };
    const values: string[] = [];
    for (const [table, names] of Object.entries(columns)) {
      for (const name of names) {
        const rows = database
          .prepare(`select "${name}" as v from "${table}" where "${name}" is not null`)
          .all() as { v: string }[];
        values.push(...rows.map((row) => row.v));
      }
    }
    return values;
  }

  it("detects the sqlite database type from the dialect", () => {
    expect(metadata.databaseType).toBe("sqlite");
  });

  it("writes every time value as ISO-8601 UTC text through a full upload", async () => {
    const service = new DefaultStorageService({
      storage: fakeStorage(),
      metadata,
      bucket: "bucket",
    });

    // Single mode, server-side complete, with a file.
    const single = await service.createUploadSession({
      mode: UploadMode.Single,
      fileName: "a.txt",
      mimeType: "text/plain",
      expectedSize: 3,
    });
    const completed = await service.completeUploadSession({
      sessionId: single.session.id,
      createFile: { displayName: "A" },
    });

    // Multipart with a part, then abort.
    const multipart = await service.createUploadSession({ mode: UploadMode.Multipart });
    await service.uploadPart({
      sessionId: multipart.session.id,
      partNumber: 1,
      body: new Uint8Array([1, 2, 3]),
    });
    await service.abortUploadSession(multipart.session.id);

    // Soft delete: sets files.deleted_at and orphans the blob.
    await service.deleteFile({ fileId: completed.file!.id });

    const values = rawTimestamps();
    // 2 sessions x (created, updated, expires) + completed + aborted,
    // 1 part, blob x2, reference removed by deleteFile, file x3, version x1.
    expect(values.length).toBeGreaterThanOrEqual(14);
    for (const value of values) {
      expect(value).toMatch(ISO_UTC);
    }
  });

  it("round-trips instants exactly, independent of the process time zone", async () => {
    const expiresAt = new Date("2026-01-31T08:00:00.123Z");
    const created = await metadata.uploads.createSession({
      id: "s1",
      provider: StorageProvider.S3,
      bucket: "bucket",
      objectKey: "key",
      mode: UploadMode.Single,
      expiresAt,
    });
    expect(created.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(Math.abs(created.createdAt.getTime() - Date.now())).toBeLessThan(5_000);

    const completedAt = new Date("2026-02-01T00:00:00.000Z");
    const updated = await metadata.uploads.updateSession("s1", {
      status: UploadSessionStatus.Completed,
      completedAt,
    });
    expect(updated.completedAt?.toISOString()).toBe(completedAt.toISOString());

    const fetched = await metadata.uploads.getSession("s1");
    expect(fetched?.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
    expect(fetched?.completedAt?.toISOString()).toBe(completedAt.toISOString());
    expect(fetched?.abortedAt).toBeUndefined();
  });

  it("stores text that sorts chronologically", async () => {
    for (const [id, iso] of [
      ["later", "2026-03-01T00:00:00.000Z"],
      ["earlier", "2026-01-01T12:00:00.000Z"],
    ] as const) {
      await metadata.uploads.createSession({
        id,
        provider: StorageProvider.S3,
        bucket: "bucket",
        objectKey: id,
        mode: UploadMode.Single,
        expiresAt: new Date(iso),
      });
    }
    const rows = await db
      .selectFrom("upload_sessions")
      .select("id")
      .orderBy("expires_at", "asc")
      .execute();
    expect(rows.map((row) => row.id)).toEqual(["earlier", "later"]);
  });

  it("still reads rows written by the column default (CURRENT_TIMESTAMP) as UTC", async () => {
    await sql`insert into blobs (id, provider, bucket, object_key, size, status, created_at, updated_at)
      values ('legacy', 's3', 'bucket', 'k', 1, 'active', '2026-01-31 08:00:00', '2026-01-31 08:00:00')`.execute(db);

    const blob = await metadata.blobs.getBlob("legacy");
    expect(blob?.createdAt.toISOString()).toBe("2026-01-31T08:00:00.000Z");
  });

  describe("addPart", () => {
    async function createMultipartSession(id: string) {
      await metadata.uploads.createSession({
        id,
        provider: StorageProvider.S3,
        bucket: "bucket",
        objectKey: id,
        mode: UploadMode.Multipart,
        providerUploadId: "upload-1",
      });
    }

    it("replaces an earlier registration of the same part number", async () => {
      await createMultipartSession("s1");

      const first = await metadata.uploads.addPart({
        id: "part-a",
        sessionId: "s1",
        partNumber: 1,
        size: 5,
        etag: '"first"',
        checksumSha256: "aa",
        providerPartId: "p1",
        providerPartData: { attempt: 1 },
      });
      // The retry: a different size and ETag, and no checksum this time.
      const second = await metadata.uploads.addPart({
        id: "part-b",
        sessionId: "s1",
        partNumber: 1,
        size: 7,
        etag: '"second"',
      });

      expect(second.partNumber).toBe(1);
      expect(second.size).toBe(7);
      expect(second.etag).toBe('"second"');
      // Omitted optional values clear the old ones rather than surviving.
      expect(second.checksumSha256).toBeUndefined();
      expect(second.providerPartId).toBeUndefined();
      expect(second.providerPartData).toBeUndefined();
      expect(second.uploadedAt.getTime()).toBeGreaterThanOrEqual(first.uploadedAt.getTime());

      const parts = await metadata.uploads.listParts("s1");
      expect(parts).toHaveLength(1);
      expect(parts[0]).toEqual(second);
      expect(await metadata.uploads.getPart("s1", 1)).toEqual(second);

      const raw = database.prepare(`select uploaded_at as v from uploaded_parts`).all() as {
        v: string;
      }[];
      expect(raw).toHaveLength(1);
      expect(raw[0]!.v).toMatch(ISO_UTC);
    });

    it("keeps other part numbers and other sessions apart", async () => {
      await createMultipartSession("s1");
      await createMultipartSession("s2");

      await metadata.uploads.addPart({ id: "a", sessionId: "s1", partNumber: 2, size: 1, etag: "s1-2" });
      await metadata.uploads.addPart({ id: "b", sessionId: "s1", partNumber: 1, size: 1, etag: "s1-1" });
      await metadata.uploads.addPart({ id: "c", sessionId: "s2", partNumber: 1, size: 1, etag: "s2-1" });
      await metadata.uploads.addPart({ id: "d", sessionId: "s1", partNumber: 1, size: 1, etag: "s1-1b" });

      expect((await metadata.uploads.listParts("s1")).map((p) => [p.partNumber, p.etag])).toEqual([
        [1, "s1-1b"],
        [2, "s1-2"],
      ]);
      expect((await metadata.uploads.listParts("s2")).map((p) => p.etag)).toEqual(["s2-1"]);
    });

    it("lets the service register and upload the same part twice", async () => {
      const service = new DefaultStorageService({
        storage: fakeStorage(),
        metadata,
        bucket: "bucket",
      });
      const { session } = await service.createUploadSession({ mode: UploadMode.Multipart });

      await service.registerPart({ sessionId: session.id, partNumber: 1, size: 3, etag: '"a"' });
      await service.registerPart({ sessionId: session.id, partNumber: 1, size: 3, etag: '"b"' });
      await service.uploadPart({
        sessionId: session.id,
        partNumber: 2,
        body: new Uint8Array([1, 2, 3]),
      });
      await service.uploadPart({
        sessionId: session.id,
        partNumber: 2,
        body: new Uint8Array([1, 2, 3]),
      });

      const parts = await metadata.uploads.listParts(session.id);
      expect(parts.map((p) => [p.partNumber, p.etag])).toEqual([
        [1, '"b"'],
        [2, '"part"'],
      ]);
    });
  });

  describe("completing a session twice", () => {
    it("is refused by the service with a typed error and leaves one blob", async () => {
      const service = new DefaultStorageService({
        storage: fakeStorage(),
        metadata,
        bucket: "bucket",
      });
      const { session } = await service.createUploadSession({
        mode: UploadMode.Single,
        expectedSize: 3,
      });

      await service.completeUploadSession({ sessionId: session.id });
      await expect(
        service.completeUploadSession({ sessionId: session.id }),
      ).rejects.toBeInstanceOf(UploadSessionStateError);

      const blobs = database.prepare(`select id from blobs`).all();
      expect(blobs).toHaveLength(1);
    });

    it("createBlob reports a taken locator as MetadataConflictError", async () => {
      const blob = {
        provider: StorageProvider.S3,
        bucket: "bucket",
        objectKey: "same/key",
        size: 1,
      };
      await metadata.blobs.createBlob({ id: "b1", ...blob });

      const error = await metadata.blobs
        .createBlob({ id: "b2", ...blob })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(MetadataConflictError);
      const conflict = error as MetadataConflictError;
      expect(conflict.code).toBe("METADATA_CONFLICT");
      expect(conflict.entityType).toBe("Blob");
      expect(conflict.entityId).toBe("s3/bucket/same/key");
      expect(conflict.cause).toBeDefined();
    });
  });

  it("fails loudly when forced to bind Date values, as before the fix", async () => {
    // Proves the engine really rejects Date parameters, i.e. that the tests
    // above would have failed without serialisation.
    const postgresStyle = new KyselyMetadataStore(db, { databaseType: "postgres" });
    await expect(
      postgresStyle.uploads.createSession({
        id: "s2",
        provider: StorageProvider.S3,
        bucket: "bucket",
        objectKey: "key2",
        mode: UploadMode.Single,
      }),
    ).rejects.toThrow();
  });
});

describe("detectDatabaseType", () => {
  function kyselyWith(adapter: SqliteAdapter | PostgresAdapter): Kysely<StorageDatabase> {
    const isSqlite = adapter instanceof SqliteAdapter;
    return new Kysely<StorageDatabase>({
      dialect: {
        createDriver: () => ({
          async init() {},
          async acquireConnection() {
            throw new Error("unused");
          },
          async beginTransaction() {},
          async commitTransaction() {},
          async rollbackTransaction() {},
          async releaseConnection() {},
          async destroy() {},
        }),
        createQueryCompiler: () =>
          isSqlite ? new SqliteQueryCompiler() : new PostgresQueryCompiler(),
        createAdapter: () => adapter,
        createIntrospector: (db) =>
          isSqlite ? new SqliteIntrospector(db) : new PostgresIntrospector(db),
      },
    });
  }

  it("recognises SqliteAdapter-based dialects (SQLite, D1)", () => {
    const db = kyselyWith(new SqliteAdapter());
    expect(detectDatabaseType(db)).toBe("sqlite");
    expect(new KyselyMetadataStore(db).databaseType).toBe("sqlite");
  });

  it("defaults to postgres", () => {
    expect(detectDatabaseType(kyselyWith(new PostgresAdapter()))).toBe("postgres");
  });

  it("lets an explicit option win", () => {
    const db = kyselyWith(new PostgresAdapter());
    expect(new KyselyMetadataStore(db, { databaseType: "sqlite" }).databaseType).toBe("sqlite");
  });
});
