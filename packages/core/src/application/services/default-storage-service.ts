import {
  CapabilityNotSupportedError,
  MetadataNotFoundError,
} from "@vankyle-hub/storage-shared";
import type { IStorage } from "../../ports/storage/i-storage.js";
import type { IMetadataStore } from "../../ports/metadata/i-metadata-store.js";
import type {
  IStorageService,
  CreateUploadSessionRequest,
  CreateUploadSessionResponse,
  GetUploadPartUrlRequest,
  UploadPartRequest,
  RegisterPartRequest,
  CompleteUploadSessionRequest,
  CompleteUploadSessionResponse,
  GetReadUrlRequest,
  DeleteFileRequest,
} from "../../ports/services/i-storage-service.js";
import type { UploadedPart } from "../../domain/models/uploaded-part.js";
import type { Blob as StorageBlob } from "../../domain/models/blob.js";
import type { File } from "../../domain/models/file.js";
import type { SignedAccess } from "../../domain/value-objects/signed-access.js";
import { UploadMode, UploadSessionStatus } from "../../domain/enums/upload-status.js";
import { BlobStatus } from "../../domain/enums/blob-status.js";
import { FileStatus } from "../../domain/enums/file-status.js";
import { generateId } from "../../utils/ids.js";
import type { IObjectKeyPolicy } from "../policies/object-key-policy.js";
import { DefaultObjectKeyPolicy } from "../policies/object-key-policy.js";
import { FileVersion } from "../../index.js";

export interface DefaultStorageServiceOptions {
  readonly storage: IStorage;
  readonly metadata: IMetadataStore;
  readonly bucket: string;
  readonly objectKeyPolicy?: IObjectKeyPolicy | undefined;
  readonly objectKeyPrefix?: string | undefined;
  readonly defaultUploadExpiresInSeconds?: number | undefined;
  readonly defaultReadUrlExpiresInSeconds?: number | undefined;
}

export class DefaultStorageService implements IStorageService {
  private readonly storage: IStorage;
  private readonly metadata: IMetadataStore;
  private readonly bucket: string;
  private readonly objectKeyPolicy: IObjectKeyPolicy;
  private readonly objectKeyPrefix: string | undefined;
  private readonly defaultUploadExpiresInSeconds: number;
  private readonly defaultReadUrlExpiresInSeconds: number;

  constructor(options: DefaultStorageServiceOptions) {
    this.storage = options.storage;
    this.metadata = options.metadata;
    this.bucket = options.bucket;
    this.objectKeyPolicy = options.objectKeyPolicy ?? new DefaultObjectKeyPolicy();
    this.objectKeyPrefix = options.objectKeyPrefix;
    this.defaultUploadExpiresInSeconds = options.defaultUploadExpiresInSeconds ?? 3600;
    this.defaultReadUrlExpiresInSeconds = options.defaultReadUrlExpiresInSeconds ?? 3600;
  }

  async createUploadSession(
    request: CreateUploadSessionRequest,
  ): Promise<CreateUploadSessionResponse> {
    const mode = request.mode ?? UploadMode.Multipart;
    const objectKey = this.objectKeyPolicy.generate({
      fileName: request.fileName,
      mimeType: request.mimeType,
      ownerId: request.ownerId,
      prefix: this.objectKeyPrefix,
    });

    let providerUploadId: string | undefined;
    let uploadUrl: SignedAccess | undefined;

    if (mode === UploadMode.Multipart) {
      const result = await this.storage.initUploadSession({
        bucket: this.bucket,
        objectKey,
        contentType: request.mimeType,
      });
      providerUploadId = result.providerUploadId;
    } else {
      // Single mode: generate a presigned PUT URL if supported
      if (this.storage.createPutUrl) {
        uploadUrl = await this.storage.createPutUrl({
          bucket: this.bucket,
          objectKey,
          contentType: request.mimeType,
          expiresInSeconds:
            request.expiresInSeconds ?? this.defaultUploadExpiresInSeconds,
        });
      }
    }

    const expiresAt = new Date(
      Date.now() +
      (request.expiresInSeconds ?? this.defaultUploadExpiresInSeconds) * 1000,
    );

    const session = await this.metadata.uploads.createSession({
      id: generateId(),
      provider: this.storage.provider,
      bucket: this.bucket,
      objectKey,
      mode,
      fileName: request.fileName,
      mimeType: request.mimeType,
      expectedSize: request.expectedSize,
      expectedSha256: request.expectedSha256,
      providerUploadId,
      createdBy: request.createdBy,
      ownerId: request.ownerId,
      metadata: request.metadata,
      expiresAt,
    });

    return { session, uploadUrl };
  }

  async getUploadSession(sessionId: string): Promise<import("../../domain/models/upload-session.js").UploadSession | undefined> {
    return this.metadata.uploads.getSession(sessionId);
  }

  async getUploadPartUrl(request: GetUploadPartUrlRequest): Promise<SignedAccess> {
    const session = await this.requireSession(request.sessionId);

    if (!this.storage.createUploadPartUrl) {
      throw new CapabilityNotSupportedError("signedPartUrl");
    }

    if (!session.providerUploadId) {
      throw new MetadataNotFoundError("UploadSession", session.id);
    }

    return this.storage.createUploadPartUrl({
      bucket: session.bucket,
      objectKey: session.objectKey,
      providerUploadId: session.providerUploadId,
      partNumber: request.partNumber,
      expiresInSeconds: this.defaultUploadExpiresInSeconds,
    });
  }

  async uploadPart(request: UploadPartRequest): Promise<UploadedPart> {
    const session = await this.requireSession(request.sessionId);

    if (!session.providerUploadId) {
      throw new MetadataNotFoundError("UploadSession", session.id);
    }

    const result = await this.storage.uploadPart({
      bucket: session.bucket,
      objectKey: session.objectKey,
      providerUploadId: session.providerUploadId,
      partNumber: request.partNumber,
      body: request.body,
      contentLength: request.contentLength,
    });

    // Update session status to in-progress if still pending
    if (session.status === UploadSessionStatus.Pending) {
      await this.metadata.uploads.updateSession(session.id, {
        status: UploadSessionStatus.InProgress,
      });
    }

    return this.metadata.uploads.addPart({
      id: generateId(),
      sessionId: session.id,
      partNumber: result.partNumber,
      size: result.size ?? 0,
      etag: result.etag,
      checksumSha256: result.checksumSha256,
    });
  }

  async registerPart(request: RegisterPartRequest): Promise<UploadedPart> {
    const session = await this.requireSession(request.sessionId);

    if (session.status === UploadSessionStatus.Pending) {
      await this.metadata.uploads.updateSession(session.id, {
        status: UploadSessionStatus.InProgress,
      });
    }

    return this.metadata.uploads.addPart({
      id: generateId(),
      sessionId: session.id,
      partNumber: request.partNumber,
      size: request.size,
      etag: request.etag,
      checksumSha256: request.checksumSha256,
    });
  }

  async completeUploadSession(
    request: CompleteUploadSessionRequest,
  ): Promise<CompleteUploadSessionResponse> {
    const session = await this.requireSession(request.sessionId);

    let etag: string | undefined;

    if (session.mode === UploadMode.Multipart && session.providerUploadId) {
      const parts = await this.metadata.uploads.listParts(session.id);
      const result = await this.storage.completeUploadSession({
        bucket: session.bucket,
        objectKey: session.objectKey,
        providerUploadId: session.providerUploadId,
        parts: parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
      });
      etag = result.etag;
    }

    // Head the object to get final metadata
    const head = await this.storage.headObject({
      bucket: session.bucket,
      objectKey: session.objectKey,
    });

    // Validate expected size and etag if provided
    if (session.expectedSize !== undefined && head.contentLength !== session.expectedSize) {
      throw new Error(
        `Uploaded size mismatch: expected ${session.expectedSize}, got ${head.contentLength}`,
      );
    }
    if (request.etag !== undefined && head.etag !== request.etag) {
      throw new Error(
        `Uploaded ETag mismatch: expected ${request.etag}, got ${head.etag}`,
      );
    }

    // Mark session completed
    const now = new Date();
    await this.metadata.uploads.updateSession(session.id, {
      status: UploadSessionStatus.Completed,
      completedAt: now,
    });

    // Create blob record
    const blob = await this.metadata.blobs.createBlob({
      id: generateId(),
      provider: session.provider,
      bucket: session.bucket,
      objectKey: session.objectKey,
      size: head.contentLength ?? 0,
      mimeType: session.mimeType ?? head.contentType,
      etag: etag ?? head.etag,
    });

    let file: File | undefined = undefined;
    let fileVersion: FileVersion | undefined = undefined;

    if (request.createFile) {
      const fileId = generateId();
      const versionId = generateId();

      fileVersion = await this.metadata.files.createVersion({
        id: versionId,
        fileId,
        blobId: blob.id,
        version: 1,
        size: blob.size,
        mimeType: blob.mimeType,
        sha256: blob.sha256,
        createdBy: session.createdBy,
        metadata: request.createFile.metadata,
      });

      file = await this.metadata.files.createFile({
        id: fileId,
        ownerId: request.createFile.ownerId ?? session.ownerId,
        displayName: request.createFile.displayName,
        mimeType: blob.mimeType,
        size: blob.size,
        parentId: request.createFile.parentId,
        metadata: request.createFile.metadata,
      });
      
      // Set current version
      file = await this.metadata.files.updateFile(file.id, {
        currentVersionId: versionId,
      });

      // Create blob reference
      await this.metadata.blobs.createReference({
        id: generateId(),
        blobId: blob.id,
        refType: "file-version",
        refId: versionId,
      });
    }

    return { blob, file, fileVersion };
  }

  async abortUploadSession(sessionId: string): Promise<void> {
    const session = await this.requireSession(sessionId);

    if (session.providerUploadId) {
      await this.storage.abortUploadSession({
        bucket: session.bucket,
        objectKey: session.objectKey,
        providerUploadId: session.providerUploadId,
      });
    }

    await this.metadata.uploads.updateSession(session.id, {
      status: UploadSessionStatus.Aborted,
      abortedAt: new Date(),
    });
  }

  async getReadUrl(request: GetReadUrlRequest): Promise<SignedAccess> {
    if (!this.storage.createReadUrl) {
      throw new CapabilityNotSupportedError("signedReadUrl");
    }

    const file = await this.metadata.files.getFile(request.fileId);
    if (!file) {
      throw new MetadataNotFoundError("File", request.fileId);
    }

    const versionId = request.versionId ?? file.currentVersionId;
    if (!versionId) {
      throw new MetadataNotFoundError("FileVersion", request.fileId);
    }

    const version = await this.metadata.files.getVersion(versionId);
    if (!version) {
      throw new MetadataNotFoundError("FileVersion", versionId);
    }

    const blob = await this.metadata.blobs.getBlob(version.blobId);
    if (!blob) {
      throw new MetadataNotFoundError("Blob", version.blobId);
    }

    return this.storage.createReadUrl({
      bucket: blob.bucket,
      objectKey: blob.objectKey,
      expiresInSeconds:
        request.expiresInSeconds ?? this.defaultReadUrlExpiresInSeconds,
      responseContentType: file.mimeType ?? blob.mimeType,
    });
  }

  async getFile(fileId: string): Promise<File | undefined> {
    return this.metadata.files.getFile(fileId);
  }

  async getBlob(blobId: string): Promise<StorageBlob | undefined> {
    return this.metadata.blobs.getBlob(blobId);
  }

  async deleteFile(request: DeleteFileRequest): Promise<void> {
    const file = await this.metadata.files.getFile(request.fileId);
    if (!file) {
      throw new MetadataNotFoundError("File", request.fileId);
    }

    const now = new Date();

    // Soft-delete the file
    await this.metadata.files.updateFile(file.id, {
      status: FileStatus.Deleted,
      deletedAt: now,
    });

    // Remove blob references for all versions and check for orphans
    const versions = await this.metadata.files.listVersions(file.id);
    for (const version of versions) {
      const refs = await this.metadata.blobs.listReferences(version.blobId);
      for (const ref of refs) {
        if (ref.refType === "file-version" && ref.refId === version.id) {
          await this.metadata.blobs.deleteReference(ref.id);
        }
      }

      // If no more references, mark blob as orphaned
      const remainingRefs = await this.metadata.blobs.listReferences(version.blobId);
      if (remainingRefs.length === 0) {
        await this.metadata.blobs.updateBlob(version.blobId, {
          status: BlobStatus.Orphaned,
        });
      }
    }
  }

  private async requireSession(sessionId: string) {
    const session = await this.metadata.uploads.getSession(sessionId);
    if (!session) {
      throw new MetadataNotFoundError("UploadSession", sessionId);
    }
    return session;
  }
}
