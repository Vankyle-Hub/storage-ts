import { z } from "zod";
import { StorageProvider } from "../domain/enums/storage-provider.js";
import { UploadMode, UploadSessionStatus } from "../domain/enums/upload-status.js";

const jsonObjectSchema = z.record(z.string(), z.json());

export const uploadSessionSchema = z.object({
  id: z.string(),
  provider: z.enum([StorageProvider.S3, StorageProvider.AzureBlob, StorageProvider.R2Binding]),
  bucket: z.string(),
  objectKey: z.string(),
  mode: z.enum([UploadMode.Single, UploadMode.Multipart]),
  status: z.enum([
    UploadSessionStatus.Pending,
    UploadSessionStatus.InProgress,
    UploadSessionStatus.Completed,
    UploadSessionStatus.Aborted,
  ]),
  fileName: z.string().optional(),
  mimeType: z.string().optional(),
  expectedSize: z.number().int().nonnegative().optional(),
  expectedSha256: z.string().optional(),
  providerUploadId: z.string().optional(),
  providerSessionData: jsonObjectSchema.optional(),
  createdBy: z.string().optional(),
  ownerId: z.string().optional(),
  metadata: jsonObjectSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  abortedAt: z.coerce.date().optional(),
});

export type UploadSessionInput = z.input<typeof uploadSessionSchema>;
