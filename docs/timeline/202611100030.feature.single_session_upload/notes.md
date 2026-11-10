# Notes

Outcome: completed. `uploadObject` gives single-mode sessions a server-side write path via `IStorage.putObject`.

- **New method instead of overloading `uploadPart`.** `uploadPart` returns an `UploadedPart` and takes a `partNumber`; neither means anything for a single PUT, and recording a fake part would leak into `listParts`. A separate method keeps both contracts honest.
- **`ValidationError` for mode/status misuse.** The previous `MetadataNotFoundError` claimed the session was missing when it was merely the wrong kind. No new error class was added, to keep this change independent of #47.
- **Finished sessions are rejected.** Writing into a completed session would replace the bytes behind an existing blob record without updating its size/etag.
- **`expectedSha256` not forwarded to `putObject`.** S3 wants base64 (`ChecksumSHA256`), R2 wants hex; the session column is hex. Forwarding would break S3. Left for a dedicated change.
- **No fail-fast size check in `uploadObject`.** `completeUploadSession` already compares the stored size with `expectedSize`; duplicating it here would need the typed error from #47.
