export interface BlobReference {
  readonly id: string;
  readonly blobId: string;
  readonly refType: string;
  readonly refId: string;
  readonly createdAt: Date;
}
