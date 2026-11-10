# Notes

Outcome: completed. Size and ETag mismatches on complete are `UploadSizeMismatchError` / `UploadEtagMismatchError` with `sessionId`, `expected`, `actual`.

- **`actual` may be `undefined`.** `HeadObjectResult.contentLength` and `etag` are optional; the comparison already treated a missing value as a mismatch, and the error reports that honestly rather than inventing `0` or `""`.
- **Messages kept identical** to the old plain errors, so consumers matching on text are not broken by the type change.
- **Review of other plain `Error` throws.** `DefaultStorageService` has no others. Outside the service: `core/utils/ids.ts` (missing Web Crypto — environment fault), `shared/utils` (`assert`, `getRequiredEnv` — programmer/config faults), `kysely/migrations/sql-generator.ts` (unknown migration key; handled with the migration work in #48), `cloudflare/d1` dialect (driver-level), and the Cosmos stores' `"<Entity> not found"` on update (should be `MetadataNotFoundError`; left for a separate change because it alters adapter behavior).
- **Retryable complete — discussed, not implemented.** After the blob row is written, a retry hits the unique locator index and fails with `METADATA_CONFLICT`; a failure between "session completed" and "blob created" leaves a completed session without a blob. Interactive transactions are unavailable on D1. Recommendation recorded in the PR: persist the ids of the records to be created on the session first, make each create idempotent by id, and mark the session completed last.
