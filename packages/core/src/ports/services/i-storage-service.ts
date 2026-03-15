import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { UploadSession } from "../../domain/models/upload-session.js";
import type { UploadedPart } from "../../domain/models/uploaded-part.js";
import type { Blob } from "../../domain/models/blob.js";
import type { File } from "../../domain/models/file.js";
import type { FileVersion } from "../../domain/models/file-version.js";
import type { SignedAccess } from "../../domain/value-objects/signed-access.js";
import type { UploadMode } from "../../domain/enums/upload-status.js";

// ── Service request/response DTOs ──

export interface CreateUploadSessionRequest {
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly mode?: UploadMode | undefined;
  readonly expectedSize?: number | undefined;
  readonly expectedSha256?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly createdBy?: string | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly expiresInSeconds?: number | undefined;
}

export interface CreateUploadSessionResponse {
  readonly session: UploadSession;
  readonly uploadUrl?: SignedAccess | undefined;
}

export interface GetUploadPartUrlRequest {
  readonly sessionId: string;
  readonly partNumber: number;
}

export interface UploadPartRequest {
  readonly sessionId: string;
  readonly partNumber: number;
  readonly body: Uint8Array | ReadableStream<Uint8Array>;
  readonly contentLength?: number | undefined;
}

export interface RegisterPartRequest {
  readonly sessionId: string;
  readonly partNumber: number;
  readonly size: number;
  readonly etag?: string | undefined;
  readonly checksumSha256?: string | undefined;
}

export interface CompleteUploadSessionRequest {
  readonly sessionId: string;
  readonly etag?: string | undefined;
  readonly createFile?: {
    readonly displayName: string;
    readonly ownerId?: string | undefined;
    readonly parentId?: string | undefined;
    readonly mimeType?: string | undefined;
    readonly metadata?: JsonObject | undefined;
  } | undefined;
}

export interface CompleteUploadSessionResponse {
  readonly blob: Blob;
  readonly file?: File | undefined;
  readonly fileVersion?: FileVersion | undefined;
}

export interface GetReadUrlRequest {
  readonly fileId: string;
  readonly versionId?: string | undefined;
  readonly expiresInSeconds?: number | undefined;
}

export interface DeleteFileRequest {
  readonly fileId: string;
}

export interface IStorageService {
  createUploadSession(request: CreateUploadSessionRequest): Promise<CreateUploadSessionResponse>;

  getUploadSession(sessionId: string): Promise<UploadSession | undefined>;

  getUploadPartUrl(request: GetUploadPartUrlRequest): Promise<SignedAccess>;

  uploadPart(request: UploadPartRequest): Promise<UploadedPart>;

  registerPart(request: RegisterPartRequest): Promise<UploadedPart>;

  completeUploadSession(request: CompleteUploadSessionRequest): Promise<CompleteUploadSessionResponse>;

  abortUploadSession(sessionId: string): Promise<void>;

  getReadUrl(request: GetReadUrlRequest): Promise<SignedAccess>;

  getFile(fileId: string): Promise<File | undefined>;

  getBlob(blobId: string): Promise<Blob | undefined>;

  deleteFile(request: DeleteFileRequest): Promise<void>;
}
