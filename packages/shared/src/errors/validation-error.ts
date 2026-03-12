import { BaseError } from "./base-error.js";

export class ValidationError extends BaseError {
  readonly field?: string | undefined;

  constructor(message: string, field?: string | undefined, options?: { cause?: unknown }) {
    super("VALIDATION_ERROR", message, options);
    this.field = field;
  }
}
