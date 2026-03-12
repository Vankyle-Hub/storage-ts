import type { Blob, StorageProvider, BlobStatus } from "@vankyle-hub/storage-core";
import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Selectable } from "kysely";
import type { BlobsTable } from "../schema/database.js";

type BlobRow = Selectable<BlobsTable>;

export function blobRowToModel(row: BlobRow): Blob {
  return {
    id: row.id,
    provider: row.provider as StorageProvider,
    bucket: row.bucket,
    objectKey: row.object_key,
    size: row.size,
    mimeType: row.mime_type ?? undefined,
    sha256: row.sha256 ?? undefined,
    etag: row.etag ?? undefined,
    storageClass: row.storage_class ?? undefined,
    status: row.status as BlobStatus,
    createdAt: ensureDate(row.created_at),
    updatedAt: ensureDate(row.updated_at),
    deletedAt: row.deleted_at ? ensureDate(row.deleted_at) : undefined,
    metadata: parseJson(row.metadata),
  };
}

function parseJson(value: string | null): JsonObject | undefined {
  if (value === null) return undefined;
  return JSON.parse(value) as JsonObject;
}

function ensureDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}
