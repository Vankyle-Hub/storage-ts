import type { JsonObject } from "@vankyle/storage-shared";
import type { UploadSession } from "@/domain/models/upload-session";
import type { UploadedPart } from "@/domain/models/uploaded-part";
import type { Blob } from "@/domain/models/blob";
import type { File } from "@/domain/models/file";
import type { FileVersion } from "@/domain/models/file-version";
import type { Tag } from "@/domain/models/tag";
import type { SignedAccess } from "@/domain/value-objects/signed-access";
import type { UploadMode } from "@/domain/enums/upload-status";

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
  /**
   * RFC 6266 Content-Disposition override.
   * Forwarded to supported storage adapters so the eventual GET response sets
   * this header verbatim.
   *
   * Example:
   *   `attachment; filename="demo.txt"; filename*=UTF-8''demo.txt`
   */
  readonly responseContentDisposition?: string | undefined;
  /**
   * Content-Type override.
   * Typically used in tandem with responseContentDisposition for forced
   * downloads.
   */
  readonly responseContentType?: string | undefined;
}

export interface DeleteFileRequest {
  readonly fileId: string;
}

export interface CreateTagRequest {
  readonly ownerId: string;
  readonly name: string;
  readonly metadata?: JsonObject | undefined;
}

export interface AddTagToFileRequest {
  readonly ownerId: string;
  readonly fileId: string;
  readonly tagName: string;
  readonly metadata?: JsonObject | undefined;
}

export interface RemoveTagFromFileRequest {
  readonly ownerId: string;
  readonly fileId: string;
  readonly tagName: string;
}

export interface ListFileTagsRequest {
  readonly ownerId: string;
  readonly fileId: string;
}

export interface ListFilesByTagRequest {
  readonly ownerId: string;
  readonly tagName: string;
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

  createTag(request: CreateTagRequest): Promise<Tag>;

  listTags(ownerId: string): Promise<Tag[]>;

  addTagToFile(request: AddTagToFileRequest): Promise<Tag>;

  removeTagFromFile(request: RemoveTagFromFileRequest): Promise<void>;

  listFileTags(request: ListFileTagsRequest): Promise<Tag[]>;

  listFilesByTag(request: ListFilesByTagRequest): Promise<File[]>;
}
