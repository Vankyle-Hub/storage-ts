import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.json());

export const fileVersionSchema = z.object({
  id: z.string(),
  fileId: z.string(),
  blobId: z.string(),
  version: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().optional(),
  sha256: z.string().optional(),
  createdAt: z.coerce.date(),
  createdBy: z.string().optional(),
  metadata: jsonObjectSchema.optional(),
});

export type FileVersionInput = z.input<typeof fileVersionSchema>;
