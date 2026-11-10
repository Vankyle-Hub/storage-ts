import type { BlobReference } from "@vankyle/storage-core";
import type { Selectable } from "kysely";
import type { BlobReferencesTable } from "@/schema/database";
import { ensureDate } from "@/mappers/timestamp";

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
