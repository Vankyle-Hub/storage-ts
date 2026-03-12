import type { File, FileStatus } from "@vankyle-hub/storage-core";
import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Selectable } from "kysely";
import type { FilesTable } from "../schema/database.js";

type FileRow = Selectable<FilesTable>;

export function fileRowToModel(row: FileRow): File {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    displayName: row.display_name,
    mimeType: row.mime_type ?? undefined,
    currentVersionId: row.current_version_id ?? undefined,
    size: row.size ?? undefined,
    parentId: row.parent_id ?? undefined,
    status: row.status as FileStatus,
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
