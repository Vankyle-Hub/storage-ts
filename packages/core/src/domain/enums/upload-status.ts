export const UploadMode = {
  Single: "single",
  Multipart: "multipart",
} as const;

export type UploadMode = (typeof UploadMode)[keyof typeof UploadMode];

export const UploadSessionStatus = {
  Pending: "pending",
  InProgress: "in-progress",
  Completed: "completed",
  Aborted: "aborted",
} as const;

export type UploadSessionStatus =
  (typeof UploadSessionStatus)[keyof typeof UploadSessionStatus];
