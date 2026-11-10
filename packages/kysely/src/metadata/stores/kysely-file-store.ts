import type { Kysely } from "kysely";
import type {
  IFileStore,
  CreateFileInput,
  UpdateFileInput,
  CreateFileVersionInput,
} from "@vankyle/storage-core";
import type { File, FileVersion } from "@vankyle/storage-core";
import { FileStatus } from "@vankyle/storage-core";
import type { StorageDatabase } from "@/schema/database";
import { fileRowToModel } from "@/mappers/file-row.mapper";
import { fileVersionRowToModel } from "@/mappers/file-version-row.mapper";
import { StoreDialect, type KyselyStoreOptions } from "@/metadata/store-dialect";

export class KyselyFileStore implements IFileStore {
  private readonly dialect: StoreDialect;

  constructor(
    private readonly db: Kysely<StorageDatabase>,
    options?: KyselyStoreOptions,
  ) {
    this.dialect = new StoreDialect(db, options);
  }

  async createFile(input: CreateFileInput): Promise<File> {
    await this.dialect.ensureReady(this.db);
    const now = this.dialect.timestamp(new Date());
    const row = await this.dialect.insertRow(this.db, "files", {
      id: input.id,
      owner_id: input.ownerId ?? null,
      display_name: input.displayName,
      mime_type: input.mimeType ?? null,
      current_version_id: null,
      size: input.size ?? null,
      parent_id: input.parentId ?? null,
      status: FileStatus.Active,
      created_at: now,
      updated_at: now,
      deleted_at: null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return fileRowToModel(row);
  }

  async getFile(id: string): Promise<File | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("files")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? fileRowToModel(row) : undefined;
  }

  async updateFile(id: string, input: UpdateFileInput): Promise<File> {
    await this.dialect.ensureReady(this.db);
    const updates: Record<string, unknown> = {
      updated_at: this.dialect.timestamp(new Date()),
    };

    if (input.displayName !== undefined) updates.display_name = input.displayName;
    if (input.currentVersionId !== undefined)
      updates.current_version_id = input.currentVersionId;
    if (input.size !== undefined) updates.size = input.size;
    if (input.mimeType !== undefined) updates.mime_type = input.mimeType;
    if (input.status !== undefined) updates.status = input.status;
    if (input.deletedAt !== undefined)
      updates.deleted_at = this.dialect.timestamp(input.deletedAt);
    if (input.metadata !== undefined)
      updates.metadata = JSON.stringify(input.metadata);

    const row = await this.dialect.updateRowById(this.db, "files", id, updates);

    return fileRowToModel(row);
  }

  async createVersion(input: CreateFileVersionInput): Promise<FileVersion> {
    await this.dialect.ensureReady(this.db);
    const row = await this.dialect.insertRow(this.db, "file_versions", {
      id: input.id,
      file_id: input.fileId,
      blob_id: input.blobId,
      version: input.version,
      size: input.size,
      mime_type: input.mimeType ?? null,
      sha256: input.sha256 ?? null,
      created_at: this.dialect.timestamp(new Date()),
      created_by: input.createdBy ?? null,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    });

    return fileVersionRowToModel(row);
  }

  async getVersion(id: string): Promise<FileVersion | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("file_versions")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();

    return row ? fileVersionRowToModel(row) : undefined;
  }

  async listVersions(fileId: string): Promise<FileVersion[]> {
    await this.dialect.ensureReady(this.db);
    const rows = await this.db
      .selectFrom("file_versions")
      .selectAll()
      .where("file_id", "=", fileId)
      .orderBy("version", "asc")
      .execute();

    return rows.map(fileVersionRowToModel);
  }

  async getLatestVersion(fileId: string): Promise<FileVersion | undefined> {
    await this.dialect.ensureReady(this.db);
    const row = await this.db
      .selectFrom("file_versions")
      .selectAll()
      .where("file_id", "=", fileId)
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();

    return row ? fileVersionRowToModel(row) : undefined;
  }
}
