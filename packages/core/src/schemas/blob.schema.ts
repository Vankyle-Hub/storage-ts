import { z } from "zod";
import { StorageProvider } from "../domain/enums/storage-provider.js";
import { BlobStatus } from "../domain/enums/blob-status.js";

const jsonObjectSchema = z.record(z.string(), z.json());

export const blobSchema = z.object({
  id: z.string(),
  provider: z.enum([StorageProvider.S3, StorageProvider.AzureBlob, StorageProvider.R2Binding]),
  bucket: z.string(),
  objectKey: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().optional(),
  sha256: z.string().optional(),
  etag: z.string().optional(),
  storageClass: z.string().optional(),
  status: z.enum([
    BlobStatus.Active,
    BlobStatus.Orphaned,
    BlobStatus.PendingDeletion,
    BlobStatus.Deleted,
  ]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().optional(),
  metadata: jsonObjectSchema.optional(),
});

export type BlobInput = z.input<typeof blobSchema>;
