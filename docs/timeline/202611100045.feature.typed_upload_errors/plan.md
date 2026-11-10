# Plan

1. `packages/shared/src/errors/upload-error.ts` with both classes; export from the errors index.
2. Replace the two `throw new Error(...)` in `completeUploadSession`.
3. Tests: class behavior in `shared`; service behavior in a separate `default-storage-service.complete-errors.test.ts` (asserts no metadata writes happen on either error).
4. Docs: error tables, handling section.
