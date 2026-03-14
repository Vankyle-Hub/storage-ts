import {
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  type BlobSASSignatureValues,
  type ContainerClient,
  type BlockBlobClient,
  type BlockBlobParallelUploadOptions
} from "@azure/storage-blob";
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
  type SignedAccess,
  generateId,
} from "@vankyle-hub/storage-core";
import {
  StorageError,
  StorageObjectNotFoundError,
} from "@vankyle-hub/storage-shared";
import type { AzureBlobStorageOptions } from "../types/azure-options.js";

const DEFAULT_EXPIRES_IN = 3600;

export class AzureBlobStorage implements IStorage {
  readonly provider = StorageProvider.AzureBlob;
  readonly capabilities: StorageCapabilities = {
    multipartUpload: true,
    signedReadUrl: true,
    signedPutUrl: true,
    signedPartUrl: false,
  };

  private readonly serviceClient: BlobServiceClient;
  private readonly credential: StorageSharedKeyCredential | undefined;
  private readonly defaultSasExpiresIn: number;

  constructor(options: AzureBlobStorageOptions) {
    this.defaultSasExpiresIn = options.defaultSasExpiresInSeconds ?? DEFAULT_EXPIRES_IN;

    if (options.blobServiceClient) {
      this.serviceClient = options.blobServiceClient;
    } else if (options.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(options.connectionString);
    } else if (options.accountName && options.accountKey) {
      this.credential = new StorageSharedKeyCredential(
        options.accountName,
        options.accountKey,
      );
      this.serviceClient = new BlobServiceClient(
        `https://${options.accountName}.blob.core.windows.net`,
        this.credential,
      );
    } else {
      throw new StorageError(
        "AzureBlobStorage requires connectionString, accountName+accountKey, or blobServiceClient",
      );
    }
  }

  private getContainerClient(bucket: string): ContainerClient {
    return this.serviceClient.getContainerClient(bucket);
  }

  private getBlockBlobClient(bucket: string, key: string): BlockBlobClient {
    return this.getContainerClient(bucket).getBlockBlobClient(key);
  }

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    if (input.body instanceof Uint8Array) {
      const uploadOptions: BlockBlobParallelUploadOptions = {};
      if (input.contentType) {
        uploadOptions.blobHTTPHeaders = { blobContentType: input.contentType };
      }
      if (input.metadata) {
        uploadOptions.metadata = input.metadata;
      }
      const result = await client.uploadData(input.body, uploadOptions);

      return { etag: result.etag };
    }

    const buffer = await streamToBuffer(input.body);
    const uploadOptions: BlockBlobParallelUploadOptions = {};
    if (input.contentType) {
      uploadOptions.blobHTTPHeaders = { blobContentType: input.contentType };
    }
    if (input.metadata) {
      uploadOptions.metadata = input.metadata;
    }
    const result = await client.uploadData(buffer, uploadOptions);

    return { etag: result.etag };
  }

  async getObject(input: GetObjectInput): Promise<GetObjectResult> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    try {
      const result = await client.download(
        input.range?.start,
        input.range?.end !== undefined
          ? input.range.end - (input.range?.start ?? 0) + 1
          : undefined,
      );

      if (!result.readableStreamBody && !result.blobBody) {
        throw new StorageObjectNotFoundError(input.bucket, input.objectKey);
      }

      // In Node.js, readableStreamBody is available
      const nodeStream = result.readableStreamBody;
      let body: ReadableStream<Uint8Array>;

      if (nodeStream) {
        body = nodeReadableToWebStream(nodeStream);
      } else {
        const blob = await result.blobBody!;
        const arrayBuffer = await blob.arrayBuffer();
        body = new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(arrayBuffer));
            controller.close();
          },
        });
      }

      return {
        body,
        contentType: result.contentType,
        contentLength: result.contentLength,
        etag: result.etag,
        metadata: result.metadata as Record<string, string> | undefined,
      };
    } catch (error: unknown) {
      if (isBlobNotFoundError(error)) {
        throw new StorageObjectNotFoundError(input.bucket, input.objectKey, {
          cause: error,
        });
      }
      throw new StorageError("Failed to get object", { cause: error });
    }
  }

  async headObject(input: HeadObjectInput): Promise<HeadObjectResult> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    try {
      const props = await client.getProperties();

      return {
        contentType: props.contentType,
        contentLength: props.contentLength,
        etag: props.etag,
        lastModified: props.lastModified,
        metadata: props.metadata as Record<string, string> | undefined,
      };
    } catch (error: unknown) {
      if (isBlobNotFoundError(error)) {
        throw new StorageObjectNotFoundError(input.bucket, input.objectKey, {
          cause: error,
        });
      }
      throw new StorageError("Failed to head object", { cause: error });
    }
  }

  async deleteObject(input: DeleteObjectInput): Promise<void> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);
    await client.deleteIfExists();
  }

  async initUploadSession(
    _input: InitUploadSessionInput,
  ): Promise<InitUploadSessionResult> {
    // Azure block uploads don't need to be "created" beforehand.
    // We generate a session ID for tracking block IDs.
    return {
      providerUploadId: generateId(),
    };
  }

  async uploadPart(input: UploadPartInput): Promise<UploadPartResult> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);
    const blockId = encodeBlockId(input.partNumber);

    const body = input.body instanceof Uint8Array
      ? input.body
      : await streamToBuffer(input.body);

    await client.stageBlock(blockId, body, body.byteLength);

    return {
      etag: blockId,
      partNumber: input.partNumber,
      size: body.byteLength,
    };
  }

  async completeUploadSession(
    input: CompleteUploadSessionInput,
  ): Promise<CompleteUploadSessionResult> {
    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    const blockIds = input.parts
      .slice()
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => encodeBlockId(p.partNumber));

    const result = await client.commitBlockList(blockIds);

    return {
      etag: result.etag,
    };
  }

  async abortUploadSession(_input: AbortUploadSessionInput): Promise<void> {
    // Azure doesn't have a dedicated abort — uncommitted blocks
    // are automatically cleaned up after a timeout.
  }

  async createReadUrl(input: CreateReadUrlInput): Promise<SignedAccess> {
    if (!this.credential) {
      throw new StorageError(
        "SAS generation requires StorageSharedKeyCredential (accountName + accountKey)",
      );
    }

    const expiresIn = input.expiresInSeconds ?? this.defaultSasExpiresIn;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    const sasValues: BlobSASSignatureValues = {
      containerName: input.bucket,
      blobName: input.objectKey,
      permissions: BlobSASPermissions.parse("r"),
      expiresOn: expiresAt,
    };
    if (input.responseContentType !== undefined) {
      sasValues.contentType = input.responseContentType;
    }
    if (input.responseContentDisposition !== undefined) {
      sasValues.contentDisposition = input.responseContentDisposition;
    }
    const sas = generateBlobSASQueryParameters(sasValues, this.credential);

    return {
      url: `${client.url}?${sas.toString()}`,
      method: "GET",
      expiresAt,
    };
  }

  async createPutUrl(input: CreatePutUrlInput): Promise<SignedAccess> {
    if (!this.credential) {
      throw new StorageError(
        "SAS generation requires StorageSharedKeyCredential (accountName + accountKey)",
      );
    }

    const expiresIn = input.expiresInSeconds ?? this.defaultSasExpiresIn;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    const client = this.getBlockBlobClient(input.bucket, input.objectKey);

    const putSasValues: BlobSASSignatureValues = {
      containerName: input.bucket,
      blobName: input.objectKey,
      permissions: BlobSASPermissions.parse("racw"),
      expiresOn: expiresAt,
    };
    if (input.contentType !== undefined) {
      putSasValues.contentType = input.contentType;
    }
    const sas = generateBlobSASQueryParameters(putSasValues, this.credential);

    return {
      url: `${client.url}?${sas.toString()}`,
      method: "PUT",
      expiresAt,
    };
  }
}

function encodeBlockId(partNumber: number): string {
  // Azure requires base64-encoded block IDs, all same length
  const padded = String(partNumber).padStart(6, "0");
  return Buffer.from(padded).toString("base64");
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

function nodeReadableToWebStream(
  nodeStream: NodeJS.ReadableStream,
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
  });
}

function isBlobNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    (error as { statusCode: number }).statusCode === 404
  );
}
