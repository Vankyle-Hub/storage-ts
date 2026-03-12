import { z } from "zod";
import { FileStatus } from "../domain/enums/file-status.js";

const jsonObjectSchema = z.record(z.string(), z.json());

export const fileSchema = z.object({
  id: z.string(),
  ownerId: z.string().optional(),
  displayName: z.string().min(1),
  mimeType: z.string().optional(),
  currentVersionId: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  parentId: z.string().optional(),
  status: z.enum([FileStatus.Active, FileStatus.Deleted]),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().optional(),
  metadata: jsonObjectSchema.optional(),
});

export type FileInput = z.input<typeof fileSchema>;
