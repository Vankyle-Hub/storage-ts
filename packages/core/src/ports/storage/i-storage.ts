import type { StorageProvider } from "../../domain/enums/storage-provider.js";
import type { SignedAccess } from "../../domain/value-objects/signed-access.js";
import type {
  StorageCapabilities,
  PutObjectInput,
  PutObjectResult,
  GetObjectInput,
  GetObjectResult,
  HeadObjectInput,
  HeadObjectResult,
  DeleteObjectInput,
  InitUploadSessionInput,
  InitUploadSessionResult,
  UploadPartInput,
  UploadPartResult,
  CompleteUploadSessionInput,
  CompleteUploadSessionResult,
  AbortUploadSessionInput,
  CreateReadUrlInput,
  CreatePutUrlInput,
  CreateUploadPartUrlInput,
} from "./storage.types.js";

export interface IStorage {
  readonly provider: StorageProvider;
  readonly capabilities: StorageCapabilities;

  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(input: GetObjectInput): Promise<GetObjectResult>;
  headObject(input: HeadObjectInput): Promise<HeadObjectResult>;
  deleteObject(input: DeleteObjectInput): Promise<void>;

  initUploadSession(input: InitUploadSessionInput): Promise<InitUploadSessionResult>;
  uploadPart(input: UploadPartInput): Promise<UploadPartResult>;
  completeUploadSession(input: CompleteUploadSessionInput): Promise<CompleteUploadSessionResult>;
  abortUploadSession(input: AbortUploadSessionInput): Promise<void>;

  createReadUrl?(input: CreateReadUrlInput): Promise<SignedAccess>;
  createPutUrl?(input: CreatePutUrlInput): Promise<SignedAccess>;
  createUploadPartUrl?(input: CreateUploadPartUrlInput): Promise<SignedAccess>;
}
