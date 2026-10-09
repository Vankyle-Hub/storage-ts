# Tiered Storage — Intent, Design, Spec, and Plan

Status: agreed design, not yet implemented.
Tracking: see the linked GitHub issues for the feature request and implementation tasks.

This document is the single source of truth for the hot/cold storage tiering feature. It consolidates the decisions made in design discussion. Section 1 (Intent) and Section 2 (Design) state intent and structure; Section 3 (Spec) is the binding contract; Section 4 (Plan) is the implementation path.

---

## 1. Intent

### 1.1 Problem

Major object storage providers offer cold storage classes — AWS S3 Standard-IA / Glacier Instant Retrieval, Azure Cool / Cold, Cloudflare R2 Infrequent Access — that trade lower storage and write cost for higher per-request retrieval cost. Applications building user-space file systems on this library accumulate large volumes of blobs that are written once and rarely read again. Keeping all blobs in the standard ("hot") tier pays hot-tier prices for data that is effectively cold.

### 1.2 Goal

Let library users configure at least two storage targets — one hot, one cold — and have the library **automatically move blobs between tiers based on access-derived metadata**, without changing user-facing read/write behavior:

- New uploads land in the hot tier by default.
- Blobs not accessed for a configurable period are demoted to the cold tier by a host-scheduled sweep.
- Reads always succeed regardless of tier (cold tiers in scope are synchronously readable; they only cost more per retrieval).
- Cold blobs that become hot again are promoted back, under hysteresis control.

### 1.3 Why metadata-driven

The demotion/promotion authority must live in this library's metadata database, not in provider lifecycle rules (S3 Lifecycle, Azure lifecycle management). Provider rules only observe object creation time; the library's database observes access recency, access frequency, file-version roles, and explicit user pins. Provider lifecycle rules remain a deployment-side cost backstop but are not part of this design.

### 1.4 Scope boundaries

**In scope (v1):**

- Hot and *online-cold* tiers only — every tier is synchronously readable. Examples: S3 Standard-IA / Glacier Instant, Azure Cool / Cold, R2 Infrequent Access.
- Two deployment shapes: two buckets, or one bucket with per-object storage classes.
- Same-provider tiering (all tier targets use one `IStorage` provider).

**Explicitly out of scope (v1):**

- **Archive / offline tiers** (S3 Glacier Flexible / Deep Archive, Azure Archive) that require an asynchronous restore before reads. Archive storage is designed for backup and retention scenarios — an operations concern, not a business cost-optimization mechanism. Introducing restore state machines, restore-request APIs, and hours-latency read errors is over-engineering for this library's purpose.
- **Cross-provider tiering** (e.g. hot on R2, cold on B2). It forfeits server-side copy, adds egress cost, and complicates consistency. Configuration must reject mixed providers.
- **Provider access-log ingestion** (S3 access logs, Azure Storage Analytics) as an access signal. A future implementation source for the same tracking fields; the policy engine must not depend on it.

### 1.5 Cost model (uniform and predictable)

A blob resides in exactly one tier at any time (except the transient move window). No long-term dual residence.

| Operation | Cost shape |
| --- | --- |
| Demote (hot → cold) | One write/transition request charge. No retrieval fee. |
| Read a cold blob in place | One retrieval fee (per GB), per read. |
| Promote (cold → hot) | One retrieval fee + one write request charge, then hot-tier pricing. |

This shape is identical for the two-bucket shape (cross-bucket copy) and the single-bucket shape (storage-class change), on both S3 (self-copy with `x-amz-storage-class`) and Azure (`Set Blob Tier`). Provider minimum retention periods (e.g. 30 days for S3 Standard-IA and Azure Cool) incur early-deletion fees if a blob is promoted or deleted too soon after demotion; the policy engine guards against this (§2.5).

---

## 2. Design

### 2.1 Tier targets

A *tier target* names a physical destination. "Tier" is deliberately not a two-value enum tied to buckets:

```typescript
interface StorageTierConfig {
  readonly name: StorageTier;          // 'hot' | 'cold' | custom open string
  readonly kind: StorageTierKind;      // 'hot' | 'cold' — semantic category, drives policy
  readonly storage: IStorage;          // may be a different instance per tier (same provider)
  readonly bucket: string;
  readonly storageClass?: string;      // provider storage class within the bucket, if any
}
```

This covers both deployment shapes: two buckets (different `bucket`, no `storageClass`) and one bucket with classes (same `storage`/`bucket`, different `storageClass`).

Tier names are **open strings in the database** (a blob's `tier` column is plain text; `NULL` means the hot tier, so existing rows need no backfill) with **convenience constants in code**:

```typescript
export const StorageTiers = { HOT: "hot", COLD: "cold" } as const;
export type StorageTier = (typeof StorageTiers)[keyof typeof StorageTiers] | (string & {});
```

The `(string & {})` intersection keeps IDE completion for the known names while accepting custom ones (e.g. a future `"warm"`). Validation happens at service construction and at sweep time (§3.5), not in the database.

### 2.2 Service topology: facade with delegation

`DefaultStorageService` remains the single public entry point implementing `IStorageService`. Its options gain an optional `tiers` field:

- **No `tiers` configured** — behavior is byte-for-byte today's behavior: single `storage` + `bucket`, and *no* access-tracking writes on the read path. Existing users are untouched.
- **`tiers` configured** — the service validates the tier configuration at construction and delegates the actual logic to an internal `TieredStorageService`, which is also exported for direct construction and testing.

Delegation is by composition; the `IStorageService` interface itself does not change.

### 2.3 Write path

- Uploads land in the hot tier by default. Rationale: cold tiers have minimum retention periods and retrieval fees, and access patterns are unknown at upload time; newly written content is also typically the most-read content in typical workloads.
- `CreateUploadSessionRequest` gains `initialTier?: StorageTier` for callers that *know* the content is cold at birth (backups, compliance archives). The tier must exist in the configuration.
- `PutObjectInput` and `InitUploadSessionInput` gain a pass-through `storageClass?: string` so providers can write objects directly with a storage class where the target tier calls for one.

### 2.4 Access tracking

Tiering decisions need two signals that do not exist today: **recency** (`lastAccessedAt`) and **frequency** (`accessCount`). The only point where the library observes read intent is `getReadUrl` — after a presigned URL is issued, the actual download is invisible to the library. Tracking is therefore a proxy signal ("a read URL was issued"), which is sufficient for tiering decisions.

**Where it is recorded: on the `Blob`, not the `File`.** Since a blob may be referenced by many file versions (deduplication), recording on the blob automatically aggregates access across *all* referencing files — the physical object is what tiering moves. The cost is losing per-file access breakdown, which v1 does not need.

**The write-amplification problem and the coalesced-write solution.** A naive "update the row on every `getReadUrl`" puts a database write on the hottest path in the system: read QPS becomes write QPS, popular files create same-row update contention (row locks in PostgreSQL, hot documents in Cosmos), write costs dominate in per-request-billed stores (Cosmos RU, D1 quotas), and read latency grows. But tiering decisions need very little precision — "not accessed for 30 days" is indifferent to an hour of skew.

So tracking writes are **coalesced**:

```
on getReadUrl, after resolving the blob (already fetched — zero extra reads):
  if mode == 'off': return
  if mode == 'coalesced' and now - blob.lastAccessedAt < granularity: return
  await blobs.updateBlob(id, { lastAccessedAt: now, accessCount: count + 1 }, { touch: false })
```

- Each blob is written at most once per granularity window (default 1 hour). Write volume scales with *active blob count*, not read QPS: a file read a million times an hour produces one write per hour.
- **Semantic change, made explicit:** `accessCount` is a count of *active windows*, not raw accesses. Policy thresholds are expressed in active windows (e.g. "≥3 active windows within 7 days"), not "≥3 reads".
- The write is **awaited, not fire-and-forget**: stray promises are killed after the response in serverless runtimes (e.g. a Worker without `waitUntil`), silently losing writes. Because the coalesced write is rare, paying one synchronous write is acceptable.
- Tracking failure must never fail the read: errors are caught and swallowed (an optional `onAccessTrackingError` hook may observe them).
- Tracking updates must not bump `updatedAt` (§3.2), so business-level "modified" semantics are not polluted.

Configuration: `accessTracking: { mode: 'off' | 'coalesced' | 'every', granularitySeconds?: number }`. Default in tiered mode: `coalesced`, 3600 seconds. `'every'` exists for callers needing exact counts, at documented cost.

**Future source compatibility.** The field semantics (recency + approximate active-window counts) are chosen so a future provider-access-log backfill can write the same fields without the policy engine noticing.

### 2.5 Tiering policy engine

Evaluation is decoupled from execution behind the `ITieringPolicy` port (§3.4). The move executor does not know *why* a move was requested; the policy does not know *how* moves happen. This adapter seam is what allows future policies — including an immediate-promotion-on-read policy — without touching the executor.

The built-in `AgeBasedTieringPolicy` implements the agreed hysteresis band:

| Rule | Default | Meaning |
| --- | --- | --- |
| Demote | `lastAccessedAt` (fallback `createdAt`) older than **30 days** | Cold candidates sink. |
| Promote | **≥3 active windows** within the trailing **7 days** | Heating blobs rise. |
| Move guardrail | **≥30 days** since `tierChangedAt` | Aligns with provider minimum retention; prevents churn and early-deletion fees. |
| Pin | `tierPinned == true` | Never moved by policy. |

The two thresholds deliberately do not mirror each other; the gap is the hysteresis band that stops borderline blobs from oscillating (every move costs money).

### 2.6 Demotion/promotion sweep

The library cannot own a scheduler (it runs in Workers, long-lived servers, and functions alike). It exposes `runTieringSweep(options?)` on `TieredStorageService`; the host invokes it from cron (Cloudflare Cron Triggers, EventBridge, node-cron, …).

One sweep:

1. **Crash recovery** — list blobs with `tierStatus = 'moving'` and reconcile each: if the metadata commit never happened, the source object is still authoritative; verify state via `headObject` and either resume or reset to `settled`.
2. **Scan** — `findDemotionCandidates({ tier, excludePinned: true, limit })` for each configured tier (both hot→cold and cold→hot directions; promotion candidates are cold blobs whose access stats may qualify).
3. **Evaluate** — run each candidate through the policy engine.
4. **Execute** — run the move executor for each `demote`/`promote` decision.
5. **Report** — return `TieringSweepStats` (scanned, demoted, promoted, skipped, recovered, per-blob errors) for host logging/alerting. A failing blob does not abort the sweep.

Promotion is evaluated **in the sweep, not on the read path** (v1). Rationale: the read path must never block on or trigger unreliable async work in serverless runtimes; and the promotion threshold (≥3 active windows in 7 days) is inherently multi-day, so sweep-latency (typically hours) is irrelevant. The policy port leaves the door open for a future inline/eager evaluator.

### 2.7 Move executor

Both demotion and promotion use one state machine on the blob row:

```
settled → moving → settled
```

1. Mark `tierStatus = 'moving'` (the locator is **not** changed; reads keep using it).
2. Copy the object to the target location:
   - same bucket, class change only → `changeStorageClass` if the provider supports it;
   - otherwise → `copyObject` (server-side copy) if supported;
   - otherwise → same-provider streaming `getObject` → `putObject` with a logged bandwidth warning (e.g. R2 binding).
3. Verify: `contentLength` must match; `sha256`/etag compared when available (S3 multipart etags are not content hashes — length + etag only).
4. **Commit point**: `updateBlob({ bucket, objectKey, storageClass, tier, tierChangedAt: now, tierStatus: 'settled' })`.
5. `deleteObject` at the source. Failure here leaves garbage, not corruption; existing orphan reconciliation can collect it.

**Invariants:**

- The recorded locator always points at an existing, readable object; the source is never deleted before the metadata commit.
- `getReadUrl` never blocks on a move and never fails because of tier state — a `moving` blob is served from its recorded (old) location, which is guaranteed to still exist by the previous invariant.
- On copy/verify failure, the executor best-effort resets `tierStatus` to `'settled'`; a crash anywhere before the commit leaves the old location authoritative, which step 1 of the next sweep reconciles.

**Only `active` blobs are tiered.** `orphaned` / `pending-deletion` blobs are excluded from sweeps — they belong to the deletion lifecycle.

### 2.8 Read path

`getReadUrl(fileId)` resolves `file → version → blob` exactly as today and signs a URL at the blob's recorded location — the path is **location-transparent**: it does not branch on tier at all. The only additions in tiered mode, after signing:

1. `trackAccess(blob)` — coalesced write (§2.4), awaited, failure-swallowed.
2. Nothing else. Promotion evaluation is deferred to the sweep (§2.6).

There is deliberately **no "serve in place vs. promote first" branch**: cold tiers in scope are synchronously readable, so serving from cold is always correct; whether the blob should move is a policy question answered later.

### 2.9 Port and provider extensions

`IStorage` gains two optional capability-gated methods, consistent with the existing capability-detection strategy:

| Addition | Purpose | Capability flag |
| --- | --- | --- |
| `copyObject` | Server-side copy, cross-bucket or same-bucket | `serverSideCopy` (flag already exists; method added) |
| `changeStorageClass` | In-place class/tier change (S3 self-copy with `x-amz-storage-class`; Azure `Set Blob Tier`) | `storageClassChange` (new) |
| `storageClass` on put/init inputs | Direct write with a storage class | — |
| `storageClass` on `HeadObjectResult` | Reconciliation and verification | — |

Providers that lack a capability report `false`; the move executor falls back per §2.7, and configuration rejects an archive-impossible provider only if a tier requires an unavailable capability.

### 2.10 Metadata schema changes

New columns on the blob entity/table (details in §3.2): `tier`, `tier_status`, `tier_changed_at`, `last_accessed_at`, `access_count`, `tier_pinned`. Kysely ships migration `0002_tiering` for both database flavors (`postgres`, `sqlite`); Cosmos updates its blob mapper (schemaless, no migration op). Indexes: `(tier, last_accessed_at)` for candidate scans; `tier_status` for crash recovery.

`IBlobStore` gains two queries (§3.3); `updateBlob` gains the ability to write tracking fields without bumping `updatedAt`.

---

## 3. Spec

Binding contracts. Types are TypeScript; error conditions are normative. Unless stated otherwise, everything below lives in `@vankyle/storage-core`.

### 3.1 Tier types

```typescript
export const StorageTiers = { HOT: "hot", COLD: "cold" } as const;
export type StorageTier = (typeof StorageTiers)[keyof typeof StorageTiers] | (string & {});
export type StorageTierKind = "hot" | "cold";
export type BlobTierStatus = "settled" | "moving";

export interface StorageTierConfig {
  readonly name: StorageTier;
  readonly kind: StorageTierKind;
  readonly storage: IStorage;
  readonly bucket: string;
  readonly storageClass?: string | undefined;
}
```

### 3.2 Blob entity additions

| Field | Type | Default | Semantics |
| --- | --- | --- | --- |
| `tier` | `string \| undefined` | `undefined` | Tier name; `undefined` ≡ the configured hot tier. No backfill required. |
| `tierStatus` | `BlobTierStatus` | `"settled"` | Move state machine state. |
| `tierChangedAt` | `Date \| undefined` | `undefined` | Last successful move commit time. |
| `lastAccessedAt` | `Date \| undefined` | `undefined` | Last tracked read (read-URL issuance), granularity-quantized. |
| `accessCount` | `number \| undefined` | `undefined` | Count of **active windows**, not raw accesses. |
| `tierPinned` | `boolean` | `false` | Policy-driven moves forbidden when `true`. Manual `moveBlob` still allowed. |

The zod blob schema is extended accordingly. `IBlobStore.updateBlob` accepts these fields, and its input gains `touch?: boolean` (default `true`); `touch: false` performs the update **without** modifying `updatedAt`. Access tracking always uses `touch: false`.

### 3.3 IBlobStore additions

```typescript
interface IBlobStore {
  // ...existing members unchanged...

  /**
   * Coarse candidate selection for tiering sweeps. Only blobs with
   * status 'active' and tierStatus 'settled' are eligible.
   * Policy evaluation (not this query) is the authority on whether to move.
   */
  findDemotionCandidates(input: {
    tier: StorageTier;              // current tier to scan
    excludePinned: boolean;
    lastAccessedBefore?: Date;      // optional push-down filter for efficiency
    limit: number;
  }): Promise<Blob[]>;

  /** Crash-recovery scan. Returns blobs stuck in a non-settled tier status. */
  listBlobsByTierStatus(status: BlobTierStatus, limit?: number): Promise<Blob[]>;
}
```

### 3.4 Policy engine

```typescript
export interface TieringEvaluationContext {
  readonly blob: Blob;
  readonly currentTier: StorageTier;   // resolved (never undefined — hot applied)
  readonly now: Date;
}

export interface TieringDecision {
  readonly action: "demote" | "promote" | "none";
  readonly targetTier?: StorageTier;   // required iff action != 'none'
  readonly reason: string;             // human-readable, lands in sweep stats/logs
}

export interface ITieringPolicy {
  evaluate(context: TieringEvaluationContext): TieringDecision | Promise<TieringDecision>;
}

export interface AgeBasedTieringPolicyOptions {
  readonly demoteAfterDays?: number;        // default 30
  readonly promoteActiveWindows?: number;   // default 3
  readonly promoteWindowDays?: number;      // default 7
  readonly minDaysBetweenMoves?: number;    // default 30
}
```

Contract for any policy: a decision to move **must** name a `targetTier` configured in the service; the executor validates this and rejects otherwise.

### 3.5 Service configuration and behavior

```typescript
export interface AccessTrackingOptions {
  readonly mode: "off" | "coalesced" | "every";   // default 'coalesced'
  readonly granularitySeconds?: number;           // default 3600; coalesced mode only
}

export interface TieringOptions {
  readonly tiers: readonly StorageTierConfig[];
  readonly policy?: ITieringPolicy;               // default AgeBasedTieringPolicy()
  readonly accessTracking?: AccessTrackingOptions;
  readonly onAccessTrackingError?: (error: unknown, blobId: string) => void;
}

// DefaultStorageServiceOptions gains:
//   readonly tiers?: TieringOptions | undefined;
```

**Construction-time validation** (`ValidationError` on violation):

- `tiers` present ⇒ at least 2 tiers, exactly one with `kind: "hot"`, at least one with `kind: "cold"`.
- Tier names unique.
- All tiers' `storage.provider` identical (cross-provider rejected for v1).
- The hot tier's `bucket`/`storageClass` combination is used for all default uploads.

**Behavior contracts:**

- `createUploadSession` accepts `initialTier?: StorageTier`; unknown tier ⇒ `ValidationError`. Absent ⇒ hot tier. Session rows record the resolved `bucket` (existing field), so the rest of the upload flow is unchanged.
- `getReadUrl` is location-transparent (§2.8); in tiered mode it additionally performs §2.4 tracking. It never throws for tier-state reasons, including `moving`.
- Sweep validates that every distinct `tier` value seen on scanned blobs resolves to a configured tier; an unresolvable tier aborts the sweep **before any move** with `ValidationError` (config drift is an operator error and must not pass silently).

### 3.6 TieredStorageService public API

Implements `IStorageService` (delegated to by `DefaultStorageService` when tiers are configured), plus:

```typescript
runTieringSweep(options?: {
  batchSize?: number;    // per-tier candidate scan limit; default 100
  now?: Date;            // clock injection for tests
}): Promise<TieringSweepStats>;

moveBlob(blobId: string, targetTier: StorageTier): Promise<Blob>;

interface TieringSweepStats {
  readonly scanned: number;
  readonly demoted: number;
  readonly promoted: number;
  readonly skipped: number;
  readonly recovered: number;   // crash-recovered 'moving' blobs
  readonly errors: readonly { blobId: string; message: string }[];
}
```

`moveBlob` is the operator escape hatch: it validates that the target tier exists and the blob is `active` + `settled` (else `ValidationError` / `MetadataConflictError`), then runs the §2.7 executor. It bypasses policy (explicit intent) including the pin, but not the state machine.

### 3.7 IStorage additions

```typescript
export interface StorageCapabilities {
  // ...existing flags...
  readonly storageClassChange?: boolean | undefined;   // new
}

export interface CopyObjectInput {
  readonly sourceBucket: string;
  readonly sourceKey: string;
  readonly targetBucket: string;
  readonly targetKey: string;
  readonly storageClass?: string | undefined;
  readonly contentType?: string | undefined;
  readonly metadata?: Record<string, string> | undefined;
}
export interface CopyObjectResult { readonly etag?: string | undefined; }

export interface ChangeStorageClassInput {
  readonly bucket: string;
  readonly objectKey: string;
  readonly storageClass: string;
}

interface IStorage {
  // ...existing members...
  copyObject?(input: CopyObjectInput): Promise<CopyObjectResult>;
  changeStorageClass?(input: ChangeStorageClassInput): Promise<void>;
}

// PutObjectInput, InitUploadSessionInput gain: storageClass?: string | undefined
// HeadObjectResult gains:                     storageClass?: string | undefined
```

Provider matrix for the new capabilities:

| Provider | `serverSideCopy` | `storageClassChange` | Notes |
| --- | --- | --- | --- |
| `S3Storage` | ✓ (`CopyObject`) | ✓ (self-copy with `x-amz-storage-class`) | Works two-bucket and single-bucket shapes. |
| `AzureBlobStorage` | ✓ (Copy Blob) | ✓ (`Set Blob Tier`) | `Set Blob Tier` preferred for same-bucket class changes. |
| `R2BindingStorage` | ✗ | ✗ | Tiering usable only via streaming fallback moves. |

### 3.8 Error contract summary

| Condition | Error |
| --- | --- |
| Invalid tier configuration at construction | `ValidationError` |
| `initialTier` / `moveBlob` names an unconfigured tier | `ValidationError` |
| `moveBlob` on non-active or non-settled blob | `MetadataConflictError` |
| Sweep encounters unresolvable tier values | `ValidationError` (sweep aborted before any move) |
| Copy/verify failure during a move | `StorageError`; recorded in sweep stats; blob best-effort reset to `settled` |
| Access-tracking write failure | none — swallowed, reported via `onAccessTrackingError` |

### 3.9 Definition of Done

- All contracts in §3.1–§3.8 implemented; `pnpm build`, `pnpm typecheck`, `pnpm exec vitest run` green.
- Unit tests with fake `IStorage`/`IMetadataStore` cover: coalesced tracking (window math, `touch: false`, failure swallowing), hysteresis policy boundaries, the move state machine including mid-move crash recovery, facade delegation on/off, and all construction validations.
- Kysely migration `0002_tiering` emits correct SQL for both `postgres` and `sqlite`; Cosmos mapper round-trips new fields.
- Non-tiered behavior regression-tested: no tracking writes, single-bucket flow byte-identical.
- `docs/architecture.md` gains a tiering section; `docs/getting-started.md` gains a tiered-configuration example; `CHANGELOG.md` updated.

---

## 4. Plan

### Phase 1 — Domain model and metadata schema

Packages: `core`, `kysely`, `azure`.

1. Extend the `Blob` domain model and zod schema (§3.2); add tier enums/constants (§3.1).
2. Kysely: migration `0002_tiering` (columns with defaults, `(tier, last_accessed_at)` and `tier_status` indexes; both flavors), blob row mapper, `updateBlob` `touch` support, `findDemotionCandidates`, `listBlobsByTierStatus`.
3. Azure: Cosmos blob mapper and store methods.
4. Tests: schema round-trips, generated SQL snapshots, query behavior against SQLite.

### Phase 2 — IStorage port extensions

Packages: `core`, `s3`, `azure`, `cloudflare`.

1. Port types and capability flags (§3.7).
2. `S3Storage`: `copyObject`, `changeStorageClass` (self-copy), `storageClass` on put/init, head mapping.
3. `AzureBlobStorage`: `copyObject`, `changeStorageClass` (`Set Blob Tier`), pass-through and head mapping.
4. `R2BindingStorage`: capabilities `false` only.
5. Tests against mocked SDKs; capability matrix assertions.

### Phase 3 — Tiered service, policy, tracking, facade

Package: `core`.

1. Tier configuration validation and resolution.
2. Move executor with the §2.7 state machine and crash recovery.
3. `AgeBasedTieringPolicy` (§3.4).
4. `TieredStorageService`: write path with `initialTier`, read path with coalesced tracking, `runTieringSweep`, `moveBlob`.
5. `DefaultStorageService` facade: `tiers` option + delegation; untouched single-tier path.
6. Unit tests per §3.9 with fakes; regression tests for the non-tiered path.

### Phase 4 — Documentation and release

1. `docs/architecture.md` tiering section; `docs/getting-started.md` example; package READMEs where user-facing.
2. `CHANGELOG.md`.
3. Optional manual runbook against real S3 Standard-IA (MinIO has no storage classes and cannot validate that path).

### Pitfalls

- **Serverless stray promises.** Do not fire-and-forget *anything* on the request path; promotion is sweep-driven for the same reason.
- **S3 multipart etags are not content hashes.** Move verification uses `contentLength` (+ etag when meaningful); compare `sha256` only when present on the blob row.
- **Capability gates are load-bearing.** Tests must not assume `copyObject`/`changeStorageClass` exist; the streaming fallback path needs coverage too (it is the only R2 route).
- **`updatedAt` pollution.** Tracking writes must use `touch: false`; add a regression test.
- **Deduplicated blobs.** Moving a shared blob moves it for every referencing file — intended (single physical object), but sweep logs should note reference counts for operator visibility.
- **Only `active` blobs.** Sweeps must exclude `orphaned`/`pending-deletion` blobs.
- **Sweep clock.** Inject `now` for tests; policy math must be pure with respect to the injected clock.
