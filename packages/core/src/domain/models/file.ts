import type { JsonObject } from "@vankyle/storage-shared";
import type { FileStatus } from "@/domain/enums/file-status";

export interface File {
  readonly id: string;
  readonly ownerId?: string | undefined;
  readonly displayName: string;
  readonly mimeType?: string | undefined;
  readonly currentVersionId?: string | undefined;
  readonly size?: number | undefined;
  readonly parentId?: string | undefined;
  readonly status: FileStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt?: Date | undefined;
  readonly metadata?: JsonObject | undefined;
}
