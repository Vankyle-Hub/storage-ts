import type { BlobReference } from "@vankyle-hub/storage-core";
import type { Selectable } from "kysely";
import type { BlobReferencesTable } from "../schema/database.js";

type BlobReferenceRow = Selectable<BlobReferencesTable>;

export function blobReferenceRowToModel(row: BlobReferenceRow): BlobReference {
  return {
    id: row.id,
    blobId: row.blob_id,
    refType: row.ref_type,
    refId: row.ref_id,
    createdAt: ensureDate(row.created_at),
  };
}

function ensureDate(value: Date | string): Date {
  return typeof value === "string" ? new Date(value) : value;
}
