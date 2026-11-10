import { BaseError } from "@/errors/base-error";

/**
 * The upload session is finished — completed or aborted — and no longer
 * accepts the operation.
 *
 * Thrown before any provider call or metadata write, so nothing changed.
 */
export class UploadSessionStateError extends BaseError {
  readonly sessionId: string;
  /** The session's current status, e.g. `"completed"` or `"aborted"`. */
  readonly status: string;
  /** The service operation that was refused, e.g. `"registerPart"`. */
  readonly operation: string;

  constructor(
    sessionId: string,
    status: string,
    operation: string,
    options?: { cause?: unknown },
  ) {
    super(
      "UPLOAD_SESSION_INVALID_STATE",
      `Upload session ${sessionId} is ${status}; ${operation} is no longer allowed`,
      options,
    );
    this.sessionId = sessionId;
    this.status = status;
    this.operation = operation;
  }
}

/**
 * The upload session's `expiresAt` has passed. It accepts no more data and
 * cannot be completed; it can still be aborted.
 *
 * Thrown before any provider call or metadata write, so nothing changed.
 */
export class UploadSessionExpiredError extends BaseError {
  readonly sessionId: string;
  /** The instant the session expired. */
  readonly expiresAt: Date;

  constructor(sessionId: string, expiresAt: Date, options?: { cause?: unknown }) {
    super(
      "UPLOAD_SESSION_EXPIRED",
      `Upload session ${sessionId} expired at ${expiresAt.toISOString()}`,
      options,
    );
    this.sessionId = sessionId;
    this.expiresAt = expiresAt;
  }
}

/**
 * The stored object's size differs from the size declared when the upload
 * session was created (`expectedSize`).
 *
 * Thrown by `completeUploadSession` before any blob or file record is
 * written, so the session stays open: the caller can re-upload and complete
 * again, or abort.
 */
export class UploadSizeMismatchError extends BaseError {
  readonly sessionId: string;
  /** Size in bytes declared for the session. */
  readonly expected: number;
  /** Size in bytes reported by the storage provider; `undefined` if it reported none. */
  readonly actual: number | undefined;

  constructor(
    sessionId: string,
    expected: number,
    actual: number | undefined,
    options?: { cause?: unknown },
  ) {
    super(
      "UPLOAD_SIZE_MISMATCH",
      `Uploaded size mismatch: expected ${expected}, got ${actual}`,
      options,
    );
    this.sessionId = sessionId;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * The stored object's ETag differs from the ETag the caller passed to
 * `completeUploadSession`.
 *
 * ETags are compared verbatim, including any surrounding quotes. Thrown
 * before any blob or file record is written, so the session stays open.
 */
export class UploadEtagMismatchError extends BaseError {
  readonly sessionId: string;
  /** ETag supplied by the caller. */
  readonly expected: string;
  /** ETag reported by the storage provider; `undefined` if it reported none. */
  readonly actual: string | undefined;

  constructor(
    sessionId: string,
    expected: string,
    actual: string | undefined,
    options?: { cause?: unknown },
  ) {
    super(
      "UPLOAD_ETAG_MISMATCH",
      `Uploaded ETag mismatch: expected ${expected}, got ${actual}`,
      options,
    );
    this.sessionId = sessionId;
    this.expected = expected;
    this.actual = actual;
  }
}
