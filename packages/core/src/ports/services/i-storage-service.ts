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
  /**
   * Size of the object in bytes, as declared by the client. Verified by
   * `completeUploadSession`. For a single-mode session it is also bound
   * into the presigned `uploadUrl` when the provider supports it
   * (`capabilities.signedContentLength`), so the upload itself is refused
   * if the body has another size. Must be a non-negative integer, otherwise
   * `ValidationError` (`field: "expectedSize"`).
   */
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
  /**
   * Size in bytes of the part the client is about to upload. When given and
   * the provider supports it (`capabilities.signedContentLength`), the URL
   * only accepts a body of exactly this size. Must be a non-negative
   * integer, otherwise `ValidationError` (`field: "contentLength"`).
   */
  readonly contentLength?: number | undefined;
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

/**
 * Session lifecycle rules shared by every operation that writes to an upload
 * session (`getUploadPartUrl`, `uploadPart`, `uploadObject`, `registerPart`,
 * `completeUploadSession`):
 *
 * - a `completed` or `aborted` session is refused with
 *   `UploadSessionStateError`;
 * - an open session whose `expiresAt` has passed is refused with
 *   `UploadSessionExpiredError` (a session without `expiresAt` never
 *   expires).
 *
 * Checks run in the order: session exists → capability → mode → status →
 * expiry, and always before any provider call or metadata write.
 */
export interface IStorageService {
  /**
   * Starts an upload session.
   *
   * @throws ValidationError (`field: "objectKey"`) when the generated object
   *   key is empty or longer than 1024 UTF-8 bytes.
   * @throws ValidationError (`field: "expectedSize"`) when `expectedSize` is
   *   given and is not a non-negative integer.
   */
  createUploadSession(request: CreateUploadSessionRequest): Promise<CreateUploadSessionResponse>;

  getUploadSession(sessionId: string): Promise<UploadSession | undefined>;

  /**
   * Returns a presigned URL for uploading one part of a `multipart` session.
   * The URL is valid for the configured default lifetime, but never longer
   * than the session itself has left.
   *
   * @throws CapabilityNotSupportedError when the provider cannot sign part URLs.
   * @throws ValidationError (`field: "mode"`) when the session is in `single` mode.
   * @throws UploadSessionStateError when the session is completed or aborted.
   * @throws UploadSessionExpiredError when the session has expired.
   */
  getUploadPartUrl(request: GetUploadPartUrlRequest): Promise<SignedAccess>;

  /**
   * Uploads one part of a `multipart` session through the server. Uploading
   * a part number again replaces the earlier part.
   *
   * @throws ValidationError (`field: "mode"`) when the session is in
   *   `single` mode — use {@link IStorageService.uploadObject} instead.
   * @throws UploadSessionStateError when the session is completed or aborted.
   * @throws UploadSessionExpiredError when the session has expired.
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
   * @throws UploadSessionStateError when the session is already completed
   *   or aborted.
   * @throws UploadSessionExpiredError when the session has expired.
   */
  uploadObject(request: UploadObjectRequest): Promise<UploadObjectResponse>;

  /**
   * Records a part that the client uploaded directly to the provider.
   * Registering a part number again replaces the earlier registration, so a
   * client that re-uploads a failed part simply registers it once more.
   *
   * @throws MetadataNotFoundError when the session does not exist.
   * @throws UploadSessionStateError when the session is completed or aborted.
   * @throws UploadSessionExpiredError when the session has expired.
   */
  registerPart(request: RegisterPartRequest): Promise<UploadedPart>;

  /**
   * Finalises the upload, verifies the stored object, and creates the blob
   * (and optionally file) records.
   *
   * @throws UploadSessionStateError when the session is already completed
   *   or aborted. A session can be completed once.
   * @throws UploadSessionExpiredError when the session has expired.
   * @throws UploadSizeMismatchError when the session declared `expectedSize`
   *   and the stored object has a different size.
   * @throws UploadEtagMismatchError when `request.etag` is given and differs
   *   from the stored object's ETag (compared verbatim).
   *
   * The two mismatch errors are raised before any metadata is written; the
   * session stays open.
   */
  completeUploadSession(request: CompleteUploadSessionRequest): Promise<CompleteUploadSessionResponse>;

  /**
   * Aborts an open session (expired ones included) and the provider upload
   * behind it. Aborting an already aborted session does nothing.
   *
   * @throws MetadataNotFoundError when the session does not exist.
   * @throws UploadSessionStateError when the session is completed — its blob
   *   exists and the session is not relabelled.
   */
  abortUploadSession(sessionId: string): Promise<void>;

  getReadUrl(request: GetReadUrlRequest): Promise<SignedAccess>;

  getFile(fileId: string): Promise<File | undefined>;

  getBlob(blobId: string): Promise<Blob | undefined>;

  deleteFile(request: DeleteFileRequest): Promise<void>;
}
