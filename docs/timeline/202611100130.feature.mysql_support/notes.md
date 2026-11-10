# Notes

Outcome: completed. The Kysely stores are dialect-aware; SQLite/D1 writes work; MySQL is supported with its own schema; bigint values are numbers on PostgreSQL.

## How it got here

MySQL was first going to be split out of `"postgres"` as a type whose `0002` did nothing. Verifying that showed MySQL could not run the schema or the stores at all, so it was declared unsupported. The maintainer then asked for the real fix, along the lines discussed: enforce UTC in the application layer as on SQLite, no separate time-zone column, validate object keys in the application rather than shrinking columns.

## Verified against real databases

Harness: `Migrator` → `KyselyMetadataStore` → `DefaultStorageService` with a fake object store. Written with the process in `Asia/Shanghai`, read back in `America/New_York`.

| Database | Result |
|---|---|
| PostgreSQL 17.11, 18.6 (`pg`) | Pass. Includes the upgrade path: `0001`, a legacy wall-clock row, then `0002` with `timestampSourceTimeZone: "Asia/Shanghai"`. |
| MySQL 5.6.51, 5.7.44, 8.4.13 (`mysql2`) | Pass with `timezone: "Z"` and with `dateStrings: true`. With driver defaults in a non-UTC process the store refuses with `MetadataError`, as intended. |
| SQLite (`node:sqlite`) | Pass; part of the repository test suite. |

Each run covers: single and multipart sessions, complete with file creation, abort, soft delete and orphaning; exact millisecond round-trip; sizes as numbers (incl. 5 GiB); a 1024-byte multi-byte object key; locator uniqueness; keys differing only in case, in a trailing space, or after the first 1000 bytes; duplicate part and duplicate version rejection; update of a missing row.

Not verified: a real Cloudflare D1 database (covered by SQLite semantics and the shared `SqliteAdapter`), MySQL 8.0 specifically (the `mysql:8` image is 8.4), and MySQL 5.6 with a `utf8mb4` database default (Kysely's own `kysely_migration` table has a `varchar(255)` primary key, which may exceed 5.6's index limit there).

## Decisions

- **Locator uniqueness through a store-computed hash.** A direct index is impossible (5244 bytes vs 3072; 767 per column on 5.6). A generated column would do the hashing in the database but does not exist on 5.6. Shrinking `object_key` would reject valid S3 keys on every database for MySQL's sake. The hash input is `JSON.stringify([provider, bucket, objectKey])` so the parts cannot run into each other.
- **`DATETIME(3)` over `TIMESTAMP`.** `TIMESTAMP` is converted through the session time zone, so correctness would again depend on configuration; it also ends in 2038.
- **A driver probe rather than documentation alone.** Reading is the one place the store cannot enforce UTC by itself: `mysql2` decides how a zone-less value becomes a `Date`. A wrong setting shifts every value silently, so the store checks once and refuses.
- **`utf8mb4_bin`.** Makes string comparison exact, matching PostgreSQL and SQLite. Readable columns were preferred over `VARBINARY`; the PAD SPACE caveat is handled by never comparing keys in SQL.
- **Same migration keys on every database**, with a no-op `0002` on MySQL, so the history and future numbering are uniform.
- **Type detection from the dialect adapter**, so existing `new KyselyMetadataStore(db)` calls keep working and D1 needs no configuration.
- **No drivers added as dependencies.** The MySQL and PostgreSQL verification stays outside the repository; only the SQLite suite, which needs nothing beyond Node, is checked in.

## Found along the way

- **PostgreSQL bigint as string (#58).** `pg` returns `bigint` as text; `completeUploadSession` failed with "expected 3, got 3" for any session with `expectedSize`. Present in 0.4.x.
- **Doc examples imported `Migrator` from `kysely`.** Wrong since Kysely 0.29; fixed.
