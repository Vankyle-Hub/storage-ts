import type { StorageProvider } from "@/domain/enums/storage-provider";

export interface StorageLocator {
  readonly provider: StorageProvider;
  readonly bucket: string;
  readonly objectKey: string;
}
