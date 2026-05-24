# Changelog

## 0.4.0

- `getReadUrl` now accepts optional `responseContentDisposition` and
  `responseContentType`. When supplied, the S3 adapter bakes them into the
  presigned URL via S3's `response-content-disposition` /
  `response-content-type` query parameters, so the eventual GET response
  carries those headers without a backend proxy hop.
- Follow-up context for v2 backend handoff:
  `docs/refactors/v2/backend/route-completion/b2-storage/discussion.md`
  2026-05-24 (b) "Follow-up: vankyle upstream improvement".
