import type { StorageSharedKeyCredential, BlobServiceClient } from "@azure/storage-blob";

export interface AzureBlobStorageOptions {
  readonly connectionString?: string | undefined;
  readonly accountName?: string | undefined;
  readonly accountKey?: string | undefined;
  readonly blobServiceClient?: BlobServiceClient | undefined;
  readonly defaultSasExpiresInSeconds?: number | undefined;
}
