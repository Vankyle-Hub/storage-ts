/**
 * Base error class for the storage system.
 * All domain-specific errors should extend this.
 */
export class BaseError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = options?.cause;
  }
}
