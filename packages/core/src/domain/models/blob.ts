import type { JsonObject } from "@vankyle/storage-shared";
import type { StorageProvider } from "@/domain/enums/storage-provider";
import type { BlobStatus } from "@/domain/enums/blob-status";

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
