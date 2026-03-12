import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { StorageProvider } from "../enums/storage-provider.js";
import type { UploadMode, UploadSessionStatus } from "../enums/upload-status.js";

export interface UploadSession {
  readonly id: string;
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
  readonly mode: UploadMode;
  readonly status: UploadSessionStatus;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly expectedSize?: number | undefined;
  readonly expectedSha256?: string | undefined;
  readonly providerUploadId?: string | undefined;
  readonly providerSessionData?: JsonObject | undefined;
  readonly createdBy?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt?: Date | undefined;
  readonly completedAt?: Date | undefined;
  readonly abortedAt?: Date | undefined;
}
