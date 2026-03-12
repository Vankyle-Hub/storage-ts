export const FileStatus = {
  Active: "active",
  Deleted: "deleted",
} as const;

export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];
