import type { JsonObject } from "@vankyle-hub/storage-shared";

export interface UploadedPart {
  readonly id: string;
  readonly sessionId: string;
  readonly partNumber: number;
  readonly size: number;
  readonly etag?: string | undefined;
  readonly checksumSha256?: string | undefined;
  readonly providerPartId?: string | undefined;
  readonly providerPartData?: JsonObject | undefined;
  readonly uploadedAt: Date;
}
