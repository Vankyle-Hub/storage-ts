import type { Kysely } from "kysely";
import type {
  IBlobStore,
  CreateBlobInput,
  UpdateBlobInput,
  CreateBlobReferenceInput,
} from "@vankyle-hub/storage-core";
import type { Blob, BlobReference, StorageProvider } from "@vankyle-hub/storage-core";
import { BlobStatus } from "@vankyle-hub/storage-core";
import type { StorageDatabase } from "../../schema/database.js";
import { blobRowToModel } from "../../mappers/blob-row.mapper.js";
import { blobReferenceRowToModel } from "../../mappers/blob-reference-row.mapper.js";

export class KyselyBlobStore implements IBlobStore {
  constructor(private readonly db: Kysely<StorageDatabase>) {}

  async createBlob(input: CreateBlobInput): Promise<Blob> {
    const now = new Date();
    const row = await this.db
      .insertInto("blobs")
      .values({
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
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return blobRowToModel(row);
  }

  async getBlob(id: string): Promise<Blob | undefined> {
    const row = await this.db
      .selectFrom("blobs")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? blobRowToModel(row) : undefined;
  }

  async updateBlob(id: string, input: UpdateBlobInput): Promise<Blob> {
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.status !== undefined) updates.status = input.status;
    if (input.deletedAt !== undefined) updates.deleted_at = input.deletedAt;

    const row = await this.db
      .updateTable("blobs")
      .set(updates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return blobRowToModel(row);
  }

  async findBlobBySha256(sha256: string): Promise<Blob | undefined> {
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
    const row = await this.db
      .insertInto("blob_references")
      .values({
        id: input.id,
        blob_id: input.blobId,
        ref_type: input.refType,
        ref_id: input.refId,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return blobReferenceRowToModel(row);
  }

  async listReferences(blobId: string): Promise<BlobReference[]> {
    const rows = await this.db
      .selectFrom("blob_references")
      .selectAll()
      .where("blob_id", "=", blobId)
      .execute();

    return rows.map(blobReferenceRowToModel);
  }

  async deleteReference(id: string): Promise<void> {
    await this.db
      .deleteFrom("blob_references")
      .where("id", "=", id)
      .execute();
  }
}
