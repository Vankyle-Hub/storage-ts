import { sql } from "kysely";
import type { Kysely, Selectable } from "kysely";
import type {
  IBlobStore,
  CreateBlobInput,
  UpdateBlobInput,
  CreateBlobReferenceInput,
} from "@vankyle/storage-core";
import type { Blob, BlobReference, StorageProvider } from "@vankyle/storage-core";
import { BlobStatus } from "@vankyle/storage-core";
import type { BlobsTable, StorageDatabase } from "@/schema/database";
import { blobRowToModel } from "@/mappers/blob-row.mapper";
import { blobReferenceRowToModel } from "@/mappers/blob-reference-row.mapper";
import { MetadataConflictError } from "@vankyle/storage-shared";
import {
  StoreDialect,
  isUniqueViolation,
  type KyselyStoreOptions,
} from "@/metadata/store-dialect";
import { computeLocatorHash } from "@/metadata/locator-hash";

export class KyselyBlobStore implements IBlobStore {
  private readonly dialect: StoreDialect;

  constructor(
    private readonly db: Kysely<StorageDatabase>,
    options?: KyselyStoreOptions,
  ) {
    this.dialect = new StoreDialect(db, options);
  }

  async createBlob(input: CreateBlobInput): Promise<Blob> {
    await this.dialect.ensureReady(this.db);
    const now = this.dialect.timestamp(new Date());
    // MySQL enforces locator uniqueness through a hash column (see
    // computeLocatorHash); the other databases index the columns directly.
    const extra =
      this.dialect.databaseType === "mysql"
        ? {
            locator_hash: await computeLocatorHash(
              input.provider,
              input.bucket,
              input.objectKey,
            ),
          }
        : undefined;
    let row: Selectable<BlobsTable>;
    try {
      row = await this.dialect.insertRow(this.db, "blobs", {
        id: input.id,
        provider: input.provider,
        bucket: input.bucket,
        object_key: input.objectKey,
        size: input.size,
        mime_type: input.mimeType ?? null,
        sha256: input.sha256 ?? null,
        etag: input.etag ?? null,
        storage_class: input.storageClass ?? null,
        status: BlobStatus.Active,
        created_at: now,
        updated_at: now,
        deleted_at: null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      }, extra);
    } catch (error: unknown) {
      // One object, one blob: the locator (provider, bucket, object_key) is
      // unique. Report a second blob for the same object as a conflict the
      // caller can recognise, not as a raw driver error.
      if (isUniqueViolation(error)) {
        throw new MetadataConflictError(
          "Blob",
          `${input.provider}/${input.bucket}/${input.objectKey}`,
          { cause: error },
        );
      }
      throw error;
    }

    return blobRowToModel(row);
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("blobs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? blobRowToModel(row) : undefined;
  }

  async updateBlob(id: string, input: UpdateBlobInput): Promise<Blob> {
    await this.dialect.ensureReady(this.db);
    const updates: Record<string, unknown> = {
      updated_at: this.dialect.timestamp(new Date()),
    };

    if (input.status !== undefined) updates.status = input.status;
    if (input.deletedAt !== undefined)
      updates.deleted_at = this.dialect.timestamp(input.deletedAt);

    const row = await this.dialect.updateRowById(this.db, "blobs", id, updates);

    return blobRowToModel(row);
  }

  async findBlobBySha256(sha256: string): Promise<Blob | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("blobs")
      .selectAll()
      .where("sha256", "=", sha256)
      .where("status", "=", BlobStatus.Active)
      .executeTakeFirst();

    return row ? blobRowToModel(row) : undefined;
  }

  async findBlobByLocator(
    provider: StorageProvider,
    bucket: string,
    objectKey: string,
  ): Promise<Blob | undefined> {
    await this.dialect.ensureReady(this.db);
    if (this.dialect.databaseType === "mysql") {
      // Look up by the indexed hash. Comparing the columns would scan the
      // table and, under MySQL's PAD SPACE rules, treat 'key' and 'key ' as
      // equal.
      const hash = await computeLocatorHash(provider, bucket, objectKey);
      const found = await sql<Selectable<BlobsTable>>`select * from blobs where locator_hash = ${hash}`.execute(this.db);
      const match = found.rows[0];
      return match ? blobRowToModel(match) : undefined;
    }

    const row = await this.db
      .selectFrom("blobs")
      .selectAll()
      .where("provider", "=", provider)
      .where("bucket", "=", bucket)
      .where("object_key", "=", objectKey)
      .executeTakeFirst();

    return row ? blobRowToModel(row) : undefined;
  }

  async createReference(input: CreateBlobReferenceInput): Promise<BlobReference> {
    await this.dialect.ensureReady(this.db);
    const row = await this.dialect.insertRow(this.db, "blob_references", {
      id: input.id,
      blob_id: input.blobId,
      ref_type: input.refType,
      ref_id: input.refId,
      created_at: this.dialect.timestamp(new Date()),
    });

    return blobReferenceRowToModel(row);
  }

  async listReferences(blobId: string): Promise<BlobReference[]> {
    await this.dialect.ensureReady(this.db);
    const rows = await this.db
      .selectFrom("blob_references")
      .selectAll()
      .where("blob_id", "=", blobId)
      .execute();

    return rows.map(blobReferenceRowToModel);
  }

  async deleteReference(id: string): Promise<void> {
    await this.dialect.ensureReady(this.db);
    await this.db
      .deleteFrom("blob_references")
      .where("id", "=", id)
      .execute();
  }
}
