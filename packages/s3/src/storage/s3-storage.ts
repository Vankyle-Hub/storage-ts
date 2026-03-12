import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  StorageProvider,
  type IStorage,
  type StorageCapabilities,
  type PutObjectInput,
  type PutObjectResult,
  type GetObjectInput,
  type GetObjectResult,
  type HeadObjectInput,
  type HeadObjectResult,
  type DeleteObjectInput,
  type InitUploadSessionInput,
  type InitUploadSessionResult,
  type UploadPartInput,
  type UploadPartResult,
  type CompleteUploadSessionInput,
  type CompleteUploadSessionResult,
  type AbortUploadSessionInput,
  type CreateReadUrlInput,
  type CreatePutUrlInput,
  type CreateUploadPartUrlInput,
  type SignedAccess,
} from "@vankyle-hub/storage-core";
import {
  StorageError,
  StorageObjectNotFoundError,
} from "@vankyle-hub/storage-shared";
import type { S3StorageOptions } from "../types/s3-options.js";
import { mapS3HeadToCore } from "../mappers/s3-head-to-core.js";

const DEFAULT_EXPIRES_IN = 3600; // 1 hour

export class S3Storage implements IStorage {
  readonly provider = StorageProvider.S3;
  readonly capabilities: StorageCapabilities = {
    multipartUpload: true,
    signedReadUrl: true,
    signedPutUrl: true,
    signedPartUrl: true,
  };

  private readonly client: S3Client;

  constructor(options: S3StorageOptions) {
    const config: ConstructorParameters<typeof S3Client>[0] = {
      ...options.clientConfig,
    };
    if (options.forcePathStyle !== undefined) {
      config.forcePathStyle = options.forcePathStyle;
    }
    this.client = new S3Client(config);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body = input.body instanceof Uint8Array
      ? input.body
      : await streamToBuffer(input.body);

    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Body: body,
        ContentType: input.contentType,
        ContentLength: input.contentLength,
        ChecksumSHA256: input.sha256,
        Metadata: input.metadata,
      }),
    );

    return {
      etag: result.ETag,
      versionId: result.VersionId,
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const range = input.range
      ? `bytes=${input.range.start}-${input.range.end ?? ""}`
      : undefined;

    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Range: range,
      }),
    );

    if (!result.Body) {
      throw new StorageObjectNotFoundError(input.bucket, input.objectKey);
    }

    return {
      body: result.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      etag: result.ETag,
      metadata: result.Metadata,
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: input.bucket,
          Key: input.objectKey,
        }),
      );
      return mapS3HeadToCore(result);
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        throw new StorageObjectNotFoundError(input.bucket, input.objectKey, { cause: error });
      }
      throw new StorageError("Failed to head object", { cause: error });
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
      }),
    );
  }

  async initUploadSession(
    input: InitUploadSessionInput,
  ): Promise<InitUploadSessionResult> {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );

    if (!result.UploadId) {
      throw new StorageError("Failed to create multipart upload: no UploadId returned");
    }

    return {
      providerUploadId: result.UploadId,
    };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadPartResult> {
    const body = input.body instanceof Uint8Array
      ? input.body
      : await streamToBuffer(input.body);

    const result = await this.client.send(
      new UploadPartCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.providerUploadId,
        PartNumber: input.partNumber,
        Body: body,
        ContentLength: input.contentLength,
      }),
    );

    if (!result.ETag) {
      throw new StorageError("Failed to upload part: no ETag returned");
    }

    return {
      etag: result.ETag,
      partNumber: input.partNumber,
      size: body.byteLength,
      checksumSha256: result.ChecksumSHA256,
    };
  }

  async completeUploadSession(
    input: CompleteUploadSessionInput,
  ): Promise<CompleteUploadSessionResult> {
    const result = await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.providerUploadId,
        MultipartUpload: {
          Parts: input.parts.map((p) => ({
            PartNumber: p.partNumber,
            ETag: p.etag,
          })),
        },
      }),
    );

    return {
      etag: result.ETag,
      versionId: result.VersionId,
    };
  }

  async abortUploadSession(input: AbortUploadSessionInput): Promise<void> {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        UploadId: input.providerUploadId,
      }),
    );
  }

  async createReadUrl(input: CreateReadUrlInput): Promise<SignedAccess> {
    const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN;
    const command = new GetObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ResponseContentType: input.responseContentType,
      ResponseContentDisposition: input.responseContentDisposition,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      method: "GET",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async createPutUrl(input: CreatePutUrlInput): Promise<SignedAccess> {
    const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN;
    const command = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      ContentType: input.contentType,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      method: "PUT",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }

  async createUploadPartUrl(
    input: CreateUploadPartUrlInput,
  ): Promise<SignedAccess> {
    const expiresIn = input.expiresInSeconds ?? DEFAULT_EXPIRES_IN;
    const command = new UploadPartCommand({
      Bucket: input.bucket,
      Key: input.objectKey,
      UploadId: input.providerUploadId,
      PartNumber: input.partNumber,
    });

    const url = await getSignedUrl(this.client, command, { expiresIn });

    return {
      url,
      method: "PUT",
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    };
  }
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.byteLength;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "NotFound"
  );
}
