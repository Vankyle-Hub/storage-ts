import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { UploadSession } from "../../domain/models/upload-session.js";
import type { UploadedPart } from "../../domain/models/uploaded-part.js";
import type { UploadMode, UploadSessionStatus } from "../../domain/enums/upload-status.js";
import type { StorageProvider } from "../../domain/enums/storage-provider.js";

export interface CreateUploadSessionInput {
  readonly id: string;
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
  readonly mode: UploadMode;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly expectedSize?: number | undefined;
  readonly expectedSha256?: string | undefined;
  readonly providerUploadId?: string | undefined;
  readonly providerSessionData?: JsonObject | undefined;
  readonly createdBy?: string | undefined;
  readonly ownerId?: string | undefined;
  readonly metadata?: JsonObject | undefined;
  readonly expiresAt?: Date | undefined;
}

export interface UpdateUploadSessionInput {
  readonly status?: UploadSessionStatus | undefined;
  readonly providerUploadId?: string | undefined;
  readonly providerSessionData?: JsonObject | undefined;
  readonly completedAt?: Date | undefined;
  readonly abortedAt?: Date | undefined;
}

export interface CreateUploadedPartInput {
  readonly id: string;
  readonly sessionId: string;
  readonly partNumber: number;
  readonly size: number;
  readonly etag?: string | undefined;
  readonly checksumSha256?: string | undefined;
  readonly providerPartId?: string | undefined;
  readonly providerPartData?: JsonObject | undefined;
}

export interface IUploadSessionStore {
  createSession(input: CreateUploadSessionInput): Promise<UploadSession>;
  getSession(id: string): Promise<UploadSession | undefined>;
  updateSession(id: string, input: UpdateUploadSessionInput): Promise<UploadSession>;

  addPart(input: CreateUploadedPartInput): Promise<UploadedPart>;
  getPart(sessionId: string, partNumber: number): Promise<UploadedPart | undefined>;
  listParts(sessionId: string): Promise<UploadedPart[]>;
}
