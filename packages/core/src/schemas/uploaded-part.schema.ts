import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.json());

export const uploadedPartSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  partNumber: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  etag: z.string().optional(),
  checksumSha256: z.string().optional(),
  providerPartId: z.string().optional(),
  providerPartData: jsonObjectSchema.optional(),
  uploadedAt: z.coerce.date(),
});

export type UploadedPartInput = z.input<typeof uploadedPartSchema>;
