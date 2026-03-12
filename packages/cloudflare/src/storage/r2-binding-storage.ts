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
} from "@vankyle-hub/storage-core";
import {
  StorageError,
  StorageObjectNotFoundError,
} from "@vankyle-hub/storage-shared";

export class R2BindingStorage implements IStorage {
  readonly provider = StorageProvider.R2Binding;
  readonly capabilities: StorageCapabilities = {
    multipartUpload: true,
    signedReadUrl: false,
    signedPutUrl: false,
    signedPartUrl: false,
  };

  private readonly bucket: R2Bucket;

  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const body: ReadableStream | ArrayBuffer =
      input.body instanceof Uint8Array
        ? (input.body.buffer.slice(input.body.byteOffset, input.body.byteOffset + input.body.byteLength) as ArrayBuffer)
        : input.body;

    const options: R2PutOptions = {};
    if (input.contentType) {
      options.httpMetadata = { contentType: input.contentType };
    }
    if (input.sha256) {
      options.sha256 = hexToArrayBuffer(input.sha256);
    }
    if (input.metadata) {
      options.customMetadata = input.metadata;
    }

    const result = await this.bucket.put(input.objectKey, body, options);

    return {
      etag: result?.etag,
    };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const options: R2GetOptions = {};
    if (input.range) {
      if (input.range.end !== undefined) {
        options.range = {
          offset: input.range.start,
          length: input.range.end - input.range.start + 1,
        };
      } else {
        options.range = {
          offset: input.range.start,
        };
      }
    }

    const result = await this.bucket.get(input.objectKey, options);

    if (!result) {
      throw new StorageObjectNotFoundError(input.bucket, input.objectKey);
    }

    const r2ObjectBody = result as R2ObjectBody;

    return {
      body: r2ObjectBody.body as ReadableStream<Uint8Array>,
      contentType: result.httpMetadata?.contentType,
      contentLength: result.size,
      etag: result.etag,
      metadata: result.customMetadata,
    };
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const result = await this.bucket.head(input.objectKey);

    if (!result) {
      throw new StorageObjectNotFoundError(input.bucket, input.objectKey);
    }

    return {
      contentType: result.httpMetadata?.contentType,
      contentLength: result.size,
      etag: result.etag,
      lastModified: result.uploaded,
      metadata: result.customMetadata,
    };
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    await this.bucket.delete(input.objectKey);
  }

  async initUploadSession(
    input: InitUploadSessionInput,
  ): Promise<InitUploadSessionResult> {
    const multipartOptions: R2MultipartOptions = {};
    if (input.contentType) {
      multipartOptions.httpMetadata = { contentType: input.contentType };
    }
    if (input.metadata) {
      multipartOptions.customMetadata = input.metadata;
    }
    const multipart = await this.bucket.createMultipartUpload(
      input.objectKey,
      multipartOptions,
    );

    return {
      providerUploadId: multipart.uploadId,
    };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadPartResult> {
    const multipart = this.bucket.resumeMultipartUpload(
      input.objectKey,
      input.providerUploadId,
    );

    const body: ReadableStream | ArrayBuffer =
      input.body instanceof Uint8Array
        ? (input.body.buffer.slice(input.body.byteOffset, input.body.byteOffset + input.body.byteLength) as ArrayBuffer)
        : input.body;

    const part = await multipart.uploadPart(input.partNumber, body);

    return {
      etag: part.etag,
      partNumber: part.partNumber,
      size: input.contentLength,
    };
  }

  async completeUploadSession(
    input: CompleteUploadSessionInput,
  ): Promise<CompleteUploadSessionResult> {
    const multipart = this.bucket.resumeMultipartUpload(
      input.objectKey,
      input.providerUploadId,
    );

    const parts: R2UploadedPart[] = input.parts.map((p) => ({
      partNumber: p.partNumber,
      etag: p.etag ?? "",
    }));

    const result = await multipart.complete(parts);

    return {
      etag: result.etag,
    };
  }

  async abortUploadSession(input: AbortUploadSessionInput): Promise<void> {
    const multipart = this.bucket.resumeMultipartUpload(
      input.objectKey,
      input.providerUploadId,
    );

    await multipart.abort();
  }
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}
