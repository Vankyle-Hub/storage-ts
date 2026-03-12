import type { JsonObject } from "@vankyle-hub/storage-shared";

export interface FileVersion {
  readonly id: string;
  readonly fileId: string;
  readonly blobId: string;
  readonly version: number;
  readonly size: number;
  readonly mimeType?: string | undefined;
  readonly sha256?: string | undefined;
  readonly createdAt: Date;
  readonly createdBy?: string | undefined;
  readonly metadata?: JsonObject | undefined;
}
