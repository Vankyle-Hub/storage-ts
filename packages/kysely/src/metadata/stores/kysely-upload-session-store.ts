import type { Kysely } from "kysely";
import type {
  IUploadSessionStore,
  CreateUploadSessionInput,
  UpdateUploadSessionInput,
  CreateUploadedPartInput,
} from "@vankyle/storage-core";
import type { UploadSession, UploadedPart } from "@vankyle/storage-core";
import { UploadSessionStatus } from "@vankyle/storage-core";
import type { StorageDatabase } from "@/schema/database";
import { uploadSessionRowToModel } from "@/mappers/upload-session-row.mapper";
import { uploadedPartRowToModel } from "@/mappers/uploaded-part-row.mapper";
import { StoreDialect, type KyselyStoreOptions } from "@/metadata/store-dialect";

export class KyselyUploadSessionStore implements IUploadSessionStore {
  private readonly dialect: StoreDialect;

  constructor(
    private readonly db: Kysely<StorageDatabase>,
    options?: KyselyStoreOptions,
  ) {
    this.dialect = new StoreDialect(db, options);
  }

  async createSession(input: CreateUploadSessionInput): Promise<UploadSession> {
    await this.dialect.ensureReady(this.db);
    const now = this.dialect.timestamp(new Date());
    const row = await this.dialect.insertRow(this.db, "upload_sessions", {
      id: input.id,
      provider: input.provider,
      bucket: input.bucket,
      object_key: input.objectKey,
      mode: input.mode,
      status: UploadSessionStatus.Pending,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType ?? null,
      expected_size: input.expectedSize ?? null,
      expected_sha256: input.expectedSha256 ?? null,
      provider_upload_id: input.providerUploadId ?? null,
      provider_session_data: input.providerSessionData
        ? JSON.stringify(input.providerSessionData)
        : null,
      created_by: input.createdBy ?? null,
      owner_id: input.ownerId ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: now,
      updated_at: now,
      expires_at: this.dialect.timestampOrNull(input.expiresAt),
      completed_at: null,
      aborted_at: null,
    });

    return uploadSessionRowToModel(row);
  }

  async getSession(id: string): Promise<UploadSession | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("upload_sessions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? uploadSessionRowToModel(row) : undefined;
  }

  async updateSession(
    id: string,
    input: UpdateUploadSessionInput,
  ): Promise<UploadSession> {
    await this.dialect.ensureReady(this.db);
    const updates: Record<string, unknown> = {
      updated_at: this.dialect.timestamp(new Date()),
    };

    if (input.status !== undefined) updates.status = input.status;
    if (input.providerUploadId !== undefined)
      updates.provider_upload_id = input.providerUploadId;
    if (input.providerSessionData !== undefined)
      updates.provider_session_data = JSON.stringify(input.providerSessionData);
    if (input.completedAt !== undefined)
      updates.completed_at = this.dialect.timestamp(input.completedAt);
    if (input.abortedAt !== undefined)
      updates.aborted_at = this.dialect.timestamp(input.abortedAt);

    const row = await this.dialect.updateRowById(
      this.db,
      "upload_sessions",
      id,
      updates,
    );

    return uploadSessionRowToModel(row);
  }

  async addPart(input: CreateUploadedPartInput): Promise<UploadedPart> {
    await this.dialect.ensureReady(this.db);
    const row = await this.dialect.insertRow(this.db, "uploaded_parts", {
      id: input.id,
      session_id: input.sessionId,
      part_number: input.partNumber,
      size: input.size,
      etag: input.etag ?? null,
      checksum_sha256: input.checksumSha256 ?? null,
      provider_part_id: input.providerPartId ?? null,
      provider_part_data: input.providerPartData
        ? JSON.stringify(input.providerPartData)
        : null,
      uploaded_at: this.dialect.timestamp(new Date()),
    });

    return uploadedPartRowToModel(row);
  }

  async getPart(
    sessionId: string,
    partNumber: number,
  ): Promise<UploadedPart | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("uploaded_parts")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("part_number", "=", partNumber)
      .executeTakeFirst();

    return row ? uploadedPartRowToModel(row) : undefined;
  }

  async listParts(sessionId: string): Promise<UploadedPart[]> {
    await this.dialect.ensureReady(this.db);
    const rows = await this.db
      .selectFrom("uploaded_parts")
      .selectAll()
      .where("session_id", "=", sessionId)
      .orderBy("part_number", "asc")
      .execute();

    return rows.map(uploadedPartRowToModel);
  }
}
