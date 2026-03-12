import type { S3ClientConfig } from "@aws-sdk/client-s3";

export interface S3StorageOptions {
  readonly clientConfig: S3ClientConfig;
  readonly forcePathStyle?: boolean | undefined;
}
