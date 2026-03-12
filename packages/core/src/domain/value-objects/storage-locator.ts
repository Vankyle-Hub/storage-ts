import type { StorageProvider } from "../enums/storage-provider.js";

export interface StorageLocator {
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
}
