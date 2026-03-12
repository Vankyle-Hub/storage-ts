import type { UploadSession } from "@vankyle-hub/storage-core";
import type { StorageProvider } from "@vankyle-hub/storage-core";
import type { UploadMode, UploadSessionStatus } from "@vankyle-hub/storage-core";
import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Selectable } from "kysely";
import type { UploadSessionsTable } from "../schema/database.js";

type UploadSessionRow = Selectable<UploadSessionsTable>;

export function uploadSessionRowToModel(row: UploadSessionRow): UploadSession {
  return {
    id: row.id,
    provider: row.provider as StorageProvider,
    bucket: row.bucket,
    objectKey: row.object_key,
    mode: row.mode as UploadMode,
    status: row.status as UploadSessionStatus,
    fileName: row.file_name ?? undefined,
    mimeType: row.mime_type ?? undefined,
    expectedSize: row.expected_size ?? undefined,
    expectedSha256: row.expected_sha256 ?? undefined,
    providerUploadId: row.provider_upload_id ?? undefined,
    providerSessionData: parseJson(row.provider_session_data),
    createdBy: row.created_by ?? undefined,
    ownerId: row.owner_id ?? undefined,
    metadata: parseJson(row.metadata),
    createdAt: ensureDate(row.created_at),
    updatedAt: ensureDate(row.updated_at),
    expiresAt: row.expires_at ? ensureDate(row.expires_at) : undefined,
    completedAt: row.completed_at ? ensureDate(row.completed_at) : undefined,
    abortedAt: row.aborted_at ? ensureDate(row.aborted_at) : undefined,
  };
}

function parseJson(value: string | null): JsonObject | undefined {
  if (value === null) return undefined;
  return JSON.parse(value) as JsonObject;
}

function ensureDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}
