import { BaseError } from "./base-error.js";

export class MetadataError extends BaseError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("METADATA_ERROR", message, options);
  }
}

export class MetadataNotFoundError extends BaseError {
  readonly entityType: string;
  readonly entityId: string;

  constructor(entityType: string, entityId: string, options?: { cause?: unknown }) {
    super("METADATA_NOT_FOUND", `${entityType} not found: ${entityId}`, options);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

export class MetadataConflictError extends BaseError {
  readonly entityType: string;
  readonly entityId: string;

  constructor(entityType: string, entityId: string, options?: { cause?: unknown }) {
    super("METADATA_CONFLICT", `${entityType} conflict: ${entityId}`, options);
    this.entityType = entityType;
    this.entityId = entityId;
  }
}
