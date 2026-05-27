import type { FileTag, Tag } from "@vankyle/storage-core";
import type { JsonObject } from "@vankyle/storage-shared";
import type { Selectable } from "kysely";
import type { FileTagsTable, TagsTable } from "@/schema/database";

type TagRow = Selectable<TagsTable>;
type FileTagRow = Selectable<FileTagsTable>;

export function tagRowToModel(row: TagRow): Tag {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    normalizedName: row.normalized_name,
    createdAt: ensureDate(row.created_at),
    updatedAt: ensureDate(row.updated_at),
    metadata: parseJson(row.metadata),
  };
}

export function fileTagRowToModel(row: FileTagRow): FileTag {
  return {
    fileId: row.file_id,
    tagId: row.tag_id,
    ownerId: row.owner_id,
    createdAt: ensureDate(row.created_at),
  };
}

function parseJson(value: string | null): JsonObject | undefined {
  if (value === null) return undefined;
  return JSON.parse(value) as JsonObject;
}

function ensureDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}
