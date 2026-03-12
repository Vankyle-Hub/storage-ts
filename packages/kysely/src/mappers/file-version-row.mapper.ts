import type { FileVersion } from "@vankyle-hub/storage-core";
import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Selectable } from "kysely";
import type { FileVersionsTable } from "../schema/database.js";

type FileVersionRow = Selectable<FileVersionsTable>;

export function fileVersionRowToModel(row: FileVersionRow): FileVersion {
  return {
    id: row.id,
    fileId: row.file_id,
    blobId: row.blob_id,
    version: row.version,
    size: row.size,
    mimeType: row.mime_type ?? undefined,
    sha256: row.sha256 ?? undefined,
    createdAt: ensureDate(row.created_at),
    createdBy: row.created_by ?? undefined,
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
