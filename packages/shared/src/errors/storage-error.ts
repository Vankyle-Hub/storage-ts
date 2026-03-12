import { BaseError } from "./base-error.js";

export class StorageError extends BaseError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("STORAGE_ERROR", message, options);
  }
}

export class StorageObjectNotFoundError extends BaseError {
  readonly bucket: string;
  readonly objectKey: string;

  constructor(bucket: string, objectKey: string, options?: { cause?: unknown }) {
    super("STORAGE_OBJECT_NOT_FOUND", `Object not found: ${bucket}/${objectKey}`, options);
    this.bucket = bucket;
    this.objectKey = objectKey;
  }
}

export class CapabilityNotSupportedError extends BaseError {
  readonly capability: string;

  constructor(capability: string, options?: { cause?: unknown }) {
    super("CAPABILITY_NOT_SUPPORTED", `Capability not supported: ${capability}`, options);
    this.capability = capability;
  }
}
