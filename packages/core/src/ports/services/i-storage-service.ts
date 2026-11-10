import type { JsonObject } from "@vankyle/storage-shared";
import type { UploadSession } from "@/domain/models/upload-session";
import type { UploadedPart } from "@/domain/models/uploaded-part";
import type { Blob } from "@/domain/models/blob";
import type { File } from "@/domain/models/file";
import type { FileVersion } from "@/domain/models/file-version";
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

/**
 * Server-side write for a `single`-mode upload session.
 *
 * Use this when the server already holds the bytes (a proxied upload, a
 * generated file, a provider without presigned PUT URLs such as an R2
 * binding). The single-mode flow is
 * `createUploadSession` → `uploadObject` → `completeUploadSession`.
 */
export interface UploadObjectRequest {
  readonly sessionId: string;
  readonly body: Uint8Array | ReadableStream<Uint8Array>;
  /**
   * Size of `body` in bytes. Optional for `Uint8Array` bodies (the byte
   * length is used). For streams, falls back to the session's
   * `expectedSize`; some providers reject a stream of unknown length.
   */
  readonly contentLength?: number | undefined;
}

export interface UploadObjectResponse {
  /** The session after the write; its status is `in-progress`. */
  readonly session: UploadSession;
  /** Provider ETag of the stored object, when the provider reports one. */
  readonly etag?: string | undefined;
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

export interface IStorageService {
  createUploadSession(request: CreateUploadSessionRequest): Promise<CreateUploadSessionResponse>;

  getUploadSession(sessionId: string): Promise<UploadSession | undefined>;

  getUploadPartUrl(request: GetUploadPartUrlRequest): Promise<SignedAccess>;

  /**
   * Uploads one part of a `multipart` session through the server.
   *
   * @throws ValidationError (`field: "mode"`) when the session is in
   *   `single` mode — use {@link IStorageService.uploadObject} instead.
   */
  uploadPart(request: UploadPartRequest): Promise<UploadedPart>;

  /**
   * Writes the whole object of a `single`-mode session through the server
   * (`IStorage.putObject`) and moves the session to `in-progress`. It does
   * not create a blob: call `completeUploadSession` afterwards, which
   * verifies the stored object. Calling it again before completion
   * overwrites the object, so a failed write can simply be retried.
   *
   * @throws MetadataNotFoundError when the session does not exist.
   * @throws ValidationError (`field: "mode"`) when the session is in
   *   `multipart` mode — use `uploadPart` instead.
   * @throws ValidationError (`field: "status"`) when the session is already
   *   completed or aborted.
   */
  uploadObject(request: UploadObjectRequest): Promise<UploadObjectResponse>;

  registerPart(request: RegisterPartRequest): Promise<UploadedPart>;

  /**
   * Finalises the upload, verifies the stored object, and creates the blob
   * (and optionally file) records.
   *
   * @throws UploadSizeMismatchError when the session declared `expectedSize`
   *   and the stored object has a different size.
   * @throws UploadEtagMismatchError when `request.etag` is given and differs
   *   from the stored object's ETag (compared verbatim).
   *
   * Both are raised before any metadata is written; the session stays open.
   */
  completeUploadSession(request: CompleteUploadSessionRequest): Promise<CompleteUploadSessionResponse>;

  abortUploadSession(sessionId: string): Promise<void>;

  getReadUrl(request: GetReadUrlRequest): Promise<SignedAccess>;

  getFile(fileId: string): Promise<File | undefined>;

  getBlob(blobId: string): Promise<Blob | undefined>;

  deleteFile(request: DeleteFileRequest): Promise<void>;
}
