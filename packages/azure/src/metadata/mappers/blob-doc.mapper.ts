import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Blob, StorageProvider, BlobStatus, BlobReference } from "@vankyle-hub/storage-core";

export interface BlobDoc {
  id: string;
  type: "blob";
  provider: string;
  bucket: string;
  objectKey: string;
  size: number;
  mimeType?: string | undefined;
  sha256?: string | undefined;
  etag?: string | undefined;
  storageClass?: string | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | undefined;
  metadata?: JsonObject | undefined;
}

export interface BlobReferenceDoc {
  id: string;
  type: "blob-reference";
  blobId: string;
  refType: string;
  refId: string;
  createdAt: string;
} 

export function blobDocToModel(doc: BlobDoc): Blob {
  return {
    id: doc.id,
    provider: doc.provider as StorageProvider,
    bucket: doc.bucket,
    objectKey: doc.objectKey,
    size: doc.size,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    etag: doc.etag,
    storageClass: doc.storageClass,
    status: doc.status as BlobStatus,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : undefined,
    metadata: doc.metadata,
  };
}

export function blobReferenceDocToModel(doc: BlobReferenceDoc): BlobReference {
  return {
    id: doc.id,
    blobId: doc.blobId,
    refType: doc.refType,
    refId: doc.refId,
    createdAt: new Date(doc.createdAt),
  };
}
