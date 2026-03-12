import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { File } from "../../domain/models/file.js";
import type { FileVersion } from "../../domain/models/file-version.js";
import type { FileStatus } from "../../domain/enums/file-status.js";

export interface CreateFileInput {
  readonly id: string;
  readonly ownerId?: string | undefined;
  readonly displayName: string;
  readonly mimeType?: string | undefined;
  readonly size?: number | undefined;
  readonly parentId?: string | undefined;
  readonly metadata?: JsonObject | undefined;
}

export interface UpdateFileInput {
  readonly displayName?: string | undefined;
  readonly currentVersionId?: string | undefined;
  readonly size?: number | undefined;
  readonly mimeType?: string | undefined;
  readonly status?: FileStatus | undefined;
  readonly deletedAt?: Date | undefined;
  readonly metadata?: JsonObject | undefined;
}

export interface CreateFileVersionInput {
  readonly id: string;
  readonly fileId: string;
  readonly blobId: string;
  readonly version: number;
  readonly size: number;
  readonly mimeType?: string | undefined;
  readonly sha256?: string | undefined;
  readonly createdBy?: string | undefined;
  readonly metadata?: JsonObject | undefined;
}

export interface IFileStore {
  createFile(input: CreateFileInput): Promise<File>;
  getFile(id: string): Promise<File | undefined>;
  updateFile(id: string, input: UpdateFileInput): Promise<File>;

  createVersion(input: CreateFileVersionInput): Promise<FileVersion>;
  getVersion(id: string): Promise<FileVersion | undefined>;
  listVersions(fileId: string): Promise<FileVersion[]>;
  getLatestVersion(fileId: string): Promise<FileVersion | undefined>;
}
