import type { Kysely } from "kysely";
import type {
  IUploadSessionStore,
  CreateUploadSessionInput,
  UpdateUploadSessionInput,
  CreateUploadedPartInput,
} from "@vankyle-hub/storage-core";
import type { UploadSession, UploadedPart } from "@vankyle-hub/storage-core";
import { UploadSessionStatus } from "@vankyle-hub/storage-core";
import type { StorageDatabase } from "../../schema/database.js";
import { uploadSessionRowToModel } from "../../mappers/upload-session-row.mapper.js";
import { uploadedPartRowToModel } from "../../mappers/uploaded-part-row.mapper.js";

export class KyselyUploadSessionStore implements IUploadSessionStore {
  constructor(private readonly db: Kysely<StorageDatabase>) {}

  async createSession(input: CreateUploadSessionInput): Promise<UploadSession> {
    const now = new Date();
    const row = await this.db
      .insertInto("upload_sessions")
      .values({
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
        expires_at: input.expiresAt ?? null,
        completed_at: null,
        aborted_at: null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return uploadSessionRowToModel(row);
  }

  async getSession(id: string): Promise<UploadSession | undefined> {
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
    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (input.status !== undefined) updates.status = input.status;
    if (input.providerUploadId !== undefined)
      updates.provider_upload_id = input.providerUploadId;
    if (input.providerSessionData !== undefined)
      updates.provider_session_data = JSON.stringify(input.providerSessionData);
    if (input.completedAt !== undefined) updates.completed_at = input.completedAt;
    if (input.abortedAt !== undefined) updates.aborted_at = input.abortedAt;

    const row = await this.db
      .updateTable("upload_sessions")
      .set(updates)
      .where("id", "=", id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return uploadSessionRowToModel(row);
  }

  async addPart(input: CreateUploadedPartInput): Promise<UploadedPart> {
    const row = await this.db
      .insertInto("uploaded_parts")
      .values({
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
        uploaded_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return uploadedPartRowToModel(row);
  }

  async getPart(
    sessionId: string,
    partNumber: number,
  ): Promise<UploadedPart | undefined> {
    const row = await this.db
      .selectFrom("uploaded_parts")
      .selectAll()
      .where("session_id", "=", sessionId)
      .where("part_number", "=", partNumber)
      .executeTakeFirst();

    return row ? uploadedPartRowToModel(row) : undefined;
  }

  async listParts(sessionId: string): Promise<UploadedPart[]> {
    const rows = await this.db
      .selectFrom("uploaded_parts")
      .selectAll()
      .where("session_id", "=", sessionId)
      .orderBy("part_number", "asc")
      .execute();

    return rows.map(uploadedPartRowToModel);
  }
}
