import type { HeadObjectCommandOutput } from "@aws-sdk/client-s3";
import type { HeadObjectResult } from "@vankyle-hub/storage-core";

export function mapS3HeadToCore(output: HeadObjectCommandOutput): HeadObjectResult {
  return {
    contentType: output.ContentType,
    contentLength: output.ContentLength,
    etag: output.ETag,
    lastModified: output.LastModified,
    metadata: output.Metadata,
  };
}
