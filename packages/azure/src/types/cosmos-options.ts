export interface CosmosMetadataOptions {
  readonly connectionString?: string | undefined;
  readonly endpoint?: string | undefined;
  readonly key?: string | undefined;
  readonly databaseId: string;
}
