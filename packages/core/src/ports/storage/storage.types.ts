import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { UploadedPart } from "../../domain/models/uploaded-part.js";

// ── Capabilities ──

export interface StorageCapabilities {
  readonly multipartUpload: boolean;
  readonly signedReadUrl: boolean;
  readonly signedPutUrl: boolean;
  readonly signedPartUrl: boolean;
  readonly serverSideCopy?: boolean | undefined;
}

// ── PutObject ──

export interface PutObjectInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly body: Uint8Array | ReadableStream<Uint8Array>;
  readonly contentType?: string | undefined;
  readonly contentLength?: number | undefined;
  readonly sha256?: string | undefined;
  readonly metadata?: Record<string, string> | undefined;
}

export interface PutObjectResult {
  readonly etag?: string | undefined;
  readonly versionId?: string | undefined;
}

// ── GetObject ──

export interface GetObjectInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly range?: { start: number; end?: number | undefined } | undefined;
}

export interface GetObjectResult {
  readonly body: ReadableStream<Uint8Array>;
  readonly contentType?: string | undefined;
  readonly contentLength?: number | undefined;
  readonly etag?: string | undefined;
  readonly metadata?: Record<string, string> | undefined;
}

// ── HeadObject ──

export interface HeadObjectInput {
  readonly bucket: string;
  readonly objectKey: string;
}

export interface HeadObjectResult {
  readonly contentType?: string | undefined;
  readonly contentLength?: number | undefined;
  readonly etag?: string | undefined;
  readonly lastModified?: Date | undefined;
  readonly metadata?: Record<string, string> | undefined;
}

// ── DeleteObject ──

export interface DeleteObjectInput {
  readonly bucket: string;
  readonly objectKey: string;
}

// ── InitUploadSession ──

export interface InitUploadSessionInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly contentType?: string | undefined;
  readonly metadata?: Record<string, string> | undefined;
}

export interface InitUploadSessionResult {
  readonly providerUploadId: string;
  readonly providerSessionData?: JsonObject | undefined;
}

// ── UploadPart ──

export interface UploadPartInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly providerUploadId: string;
  readonly partNumber: number;
  readonly body: Uint8Array | ReadableStream<Uint8Array>;
  readonly contentLength?: number | undefined;
}

export interface UploadPartResult {
  readonly etag: string;
  readonly partNumber: number;
  readonly size?: number | undefined;
  readonly checksumSha256?: string | undefined;
}

// ── CompleteUploadSession ──

export interface CompleteUploadSessionInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly providerUploadId: string;
  readonly parts: readonly Pick<UploadedPart, "partNumber" | "etag">[];
}

export interface CompleteUploadSessionResult {
  readonly etag?: string | undefined;
  readonly versionId?: string | undefined;
}

// ── AbortUploadSession ──

export interface AbortUploadSessionInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly providerUploadId: string;
}

// ── Signed URLs ──

export interface CreateReadUrlInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly expiresInSeconds?: number | undefined;
  readonly responseContentType?: string | undefined;
  readonly responseContentDisposition?: string | undefined;
}

export interface CreatePutUrlInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly contentType?: string | undefined;
  readonly expiresInSeconds?: number | undefined;
}

export interface CreateUploadPartUrlInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly providerUploadId: string;
  readonly partNumber: number;
  readonly expiresInSeconds?: number | undefined;
}
