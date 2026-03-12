import type { JsonObject } from "@vankyle-hub/storage-shared";

export interface SignedAccess {
  readonly url: string;
  readonly method: string;
  readonly headers?: Record<string, string> | undefined;
  readonly expiresAt: Date;
  readonly providerData?: JsonObject | undefined;
}
