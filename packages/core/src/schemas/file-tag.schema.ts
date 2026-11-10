import { z } from "zod";

export const fileTagSchema = z.object({
  fileId: z.string().min(1),
  tagId: z.string().min(1),
  ownerId: z.string().min(1),
  createdAt: z.coerce.date(),
});

export type FileTagInput = z.input<typeof fileTagSchema>;
