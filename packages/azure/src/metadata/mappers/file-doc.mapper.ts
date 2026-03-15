import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { File, FileVersion, FileStatus } from "@vankyle-hub/storage-core";

export interface FileDoc {
  id: string;
  pk: string;
  type: "file";
  ownerId?: string | undefined;
  displayName: string;
  mimeType?: string | undefined;
  currentVersionId?: string | undefined;
  size?: number | undefined;
  parentId?: string | undefined;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | undefined;
  metadata?: JsonObject | undefined;
}

export interface FileVersionDoc {
  id: string;
  pk: string;
  type: "file-version";
  fileId: string;
  blobId: string;
  version: number;
  size: number;
  mimeType?: string | undefined;
  sha256?: string | undefined;
  createdAt: string;
  createdBy?: string | undefined;
  metadata?: JsonObject | undefined;
}

export function fileDocToModel(doc: FileDoc): File {
  return {
    id: doc.id,
    ownerId: doc.ownerId,
    displayName: doc.displayName,
    mimeType: doc.mimeType,
    currentVersionId: doc.currentVersionId,
    size: doc.size,
    parentId: doc.parentId,
    status: doc.status as FileStatus,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : undefined,
    metadata: doc.metadata,
  };
}

export function fileVersionDocToModel(doc: FileVersionDoc): FileVersion {
  return {
    id: doc.id,
    fileId: doc.fileId,
    blobId: doc.blobId,
    version: doc.version,
    size: doc.size,
    mimeType: doc.mimeType,
    sha256: doc.sha256,
    createdAt: new Date(doc.createdAt),
    createdBy: doc.createdBy,
    metadata: doc.metadata,
  };
}
