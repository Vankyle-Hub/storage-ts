import type { JsonObject } from "@vankyle-hub/storage-shared";
import type {
  UploadSession,
  UploadedPart,
  StorageProvider,
  UploadMode,
  UploadSessionStatus,
} from "@vankyle-hub/storage-core";

export interface UploadSessionDoc {
  id: string;
  pk: string;
  type: "upload-session";
  provider: string;
  bucket: string;
  objectKey: string;
  mode: string;
  status: string;
  fileName?: string | undefined;
  mimeType?: string | undefined;
  expectedSize?: number | undefined;
  expectedSha256?: string | undefined;
  providerUploadId?: string | undefined;
  providerSessionData?: JsonObject | undefined;
  createdBy?: string | undefined;
  ownerId?: string | undefined;
  metadata?: JsonObject | undefined;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | undefined;
  completedAt?: string | undefined;
  abortedAt?: string | undefined;
}

export interface UploadedPartDoc {
  id: string;
  pk: string;
  type: "uploaded-part";
  sessionId: string;
  partNumber: number;
  size: number;
  etag?: string | undefined;
  checksumSha256?: string | undefined;
  providerPartId?: string | undefined;
  providerPartData?: JsonObject | undefined;
  uploadedAt: string;
}

export function uploadSessionDocToModel(doc: UploadSessionDoc): UploadSession {
  return {
    id: doc.id,
    provider: doc.provider as StorageProvider,
    bucket: doc.bucket,
    objectKey: doc.objectKey,
    mode: doc.mode as UploadMode,
    status: doc.status as UploadSessionStatus,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    expectedSize: doc.expectedSize,
    expectedSha256: doc.expectedSha256,
    providerUploadId: doc.providerUploadId,
    providerSessionData: doc.providerSessionData,
    createdBy: doc.createdBy,
    ownerId: doc.ownerId,
    metadata: doc.metadata,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : undefined,
    completedAt: doc.completedAt ? new Date(doc.completedAt) : undefined,
    abortedAt: doc.abortedAt ? new Date(doc.abortedAt) : undefined,
  };
}

export function uploadedPartDocToModel(doc: UploadedPartDoc): UploadedPart {
  return {
    id: doc.id,
    sessionId: doc.sessionId,
    partNumber: doc.partNumber,
    size: doc.size,
    etag: doc.etag,
    checksumSha256: doc.checksumSha256,
    providerPartId: doc.providerPartId,
    providerPartData: doc.providerPartData,
    uploadedAt: new Date(doc.uploadedAt),
  };
}
