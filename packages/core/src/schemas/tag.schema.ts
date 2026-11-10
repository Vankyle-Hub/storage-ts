import { z } from "zod";

const jsonObjectSchema = z.record(z.string(), z.json());

export const tagSchema = z.object({
  id: z.string(),
  ownerId: z.string().min(1),
  name: z.string().min(1),
  normalizedName: z.string().min(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  metadata: jsonObjectSchema.optional(),
});

export type TagInput = z.input<typeof tagSchema>;
