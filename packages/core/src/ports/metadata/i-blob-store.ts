import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Blob } from "../../domain/models/blob.js";
import type { BlobReference } from "../../domain/models/blob-reference.js";
import type { BlobStatus } from "../../domain/enums/blob-status.js";
import type { StorageProvider } from "../../domain/enums/storage-provider.js";

export interface CreateBlobInput {
  readonly id: string;
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
  readonly size: number;
  readonly mimeType?: string | undefined;
  readonly sha256?: string | undefined;
  readonly etag?: string | undefined;
  readonly storageClass?: string | undefined;
  readonly metadata?: JsonObject | undefined;
}

export interface UpdateBlobInput {
  readonly status?: BlobStatus | undefined;
  readonly deletedAt?: Date | undefined;
}

export interface CreateBlobReferenceInput {
  readonly id: string;
  readonly blobId: string;
  readonly refType: string;
  readonly refId: string;
}

export interface IBlobStore {
  createBlob(input: CreateBlobInput): Promise<Blob>;
  getBlob(id: string): Promise<Blob | undefined>;
  updateBlob(id: string, input: UpdateBlobInput): Promise<Blob>;
  findBlobBySha256(sha256: string): Promise<Blob | undefined>;
  findBlobByLocator(provider: StorageProvider, bucket: string, objectKey: string): Promise<Blob | undefined>;

  createReference(input: CreateBlobReferenceInput): Promise<BlobReference>;
  listReferences(blobId: string): Promise<BlobReference[]>;
  deleteReference(id: string): Promise<void>;
}
