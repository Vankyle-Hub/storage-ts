import type { JsonObject } from "@vankyle/storage-shared";

export interface Tag {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly metadata?: JsonObject | undefined;
}
