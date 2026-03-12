import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { StorageProvider } from "../enums/storage-provider.js";
import type { BlobStatus } from "../enums/blob-status.js";

export interface Blob {
  readonly id: string;
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
  readonly size: number;
  readonly mimeType?: string | undefined;
  readonly sha256?: string | undefined;
  readonly etag?: string | undefined;
  readonly storageClass?: string | undefined;
  readonly status: BlobStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | undefined;
  readonly metadata?: JsonObject | undefined;
}
