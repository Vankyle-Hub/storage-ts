export const BlobStatus = {
  Active: "active",
  Orphaned: "orphaned",
  PendingDeletion: "pending-deletion",
  Deleted: "deleted",
} as const;

export type BlobStatus = (typeof BlobStatus)[keyof typeof BlobStatus];
