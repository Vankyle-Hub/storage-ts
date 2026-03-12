import type { UploadedPart } from "@vankyle-hub/storage-core";
import type { JsonObject } from "@vankyle-hub/storage-shared";
import type { Selectable } from "kysely";
import type { UploadedPartsTable } from "../schema/database.js";

type UploadedPartRow = Selectable<UploadedPartsTable>;

export function uploadedPartRowToModel(row: UploadedPartRow): UploadedPart {
  return {
    id: row.id,
    sessionId: row.session_id,
    partNumber: row.part_number,
    size: row.size,
    etag: row.etag ?? undefined,
    checksumSha256: row.checksum_sha256 ?? undefined,
    providerPartId: row.provider_part_id ?? undefined,
    providerPartData: parseJson(row.provider_part_data),
    uploadedAt: ensureDate(row.uploaded_at),
  };
}

function parseJson(value: string | null): JsonObject | undefined {
  if (value === null) return undefined;
  return JSON.parse(value) as JsonObject;
}

function ensureDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}
