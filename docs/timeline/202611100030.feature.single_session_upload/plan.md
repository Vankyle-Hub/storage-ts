# Plan

1. Add `UploadObjectRequest` / `UploadObjectResponse` and `uploadObject` to `ports/services/i-storage-service.ts`; export the types.
2. Implement in `DefaultStorageService`; share a private `assertMultipart` guard between `uploadPart` and `getUploadPartUrl`.
3. Tests in a separate file (`default-storage-service.upload-object.test.ts`) with a small stateful session mock, so status transitions and the end-to-end flow are observable.
4. Docs: `getting-started.md` (R2 note, new "Single file — server-side upload" section), `architecture.md` (service listing, lifecycle, capability note), `core` and `cloudflare` READMEs.

Pitfall: custom `IStorageService` implementations must add `uploadObject` — list it under breaking changes in the 0.5.0 changelog.
