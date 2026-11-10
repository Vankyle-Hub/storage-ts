import type { File, FileStatus } from "@vankyle/storage-core";
import type { JsonObject } from "@vankyle/storage-shared";
import type { Selectable } from "kysely";
import type { FilesTable } from "@/schema/database";
import { ensureDate } from "@/mappers/timestamp";
import { ensureOptionalNumber } from "@/mappers/number";

type FileRow = Selectable<FilesTable>;

export function fileRowToModel(row: FileRow): File {
  return {
    id: row.id,
    ownerId: row.owner_id ?? undefined,
    displayName: row.display_name,
    mimeType: row.mime_type ?? undefined,
    currentVersionId: row.current_version_id ?? undefined,
    size: ensureOptionalNumber(row.size),
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
