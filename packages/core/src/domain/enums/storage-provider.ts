export const StorageProvider = {
  S3: "s3",
  AzureBlob: "azure-blob",
  R2Binding: "r2-binding",
} as const;

export type StorageProvider = (typeof StorageProvider)[keyof typeof StorageProvider];
