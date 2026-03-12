import { z } from "zod";

export const blobReferenceSchema = z.object({
  id: z.string(),
  blobId: z.string(),
  refType: z.string().min(1),
  refId: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type BlobReferenceInput = z.input<typeof blobReferenceSchema>;
