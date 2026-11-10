# Notes

Outcome: completed. `0002_timestamptz` makes every time column an unambiguous instant; `DatabaseType` gains `"mysql"`.

## What was checked on real databases

- **PostgreSQL 16** (Docker): applied generated `0001`, inserted wall-clock rows as written by a process in `Asia/Shanghai` (`2026-01-31 16:00:00`), applied `0002` with that zone. Result: `2026-01-31 08:00:00+00`; all 14 columns `timestamp with time zone`; default is plain `CURRENT_TIMESTAMP`; `NOT NULL` kept; a row inserted via the default gets the current instant. Applied `down`: columns back to `timestamp`, original wall-clock values restored.
- **SQLite** (`node:sqlite`): applied `0001` + `0002`. `CURRENT_TIMESTAMP`-format rows became ISO-8601 with `.000Z`; ISO values with `Z` or an offset were untouched; a second run changed nothing.
- **MySQL 8.4** (Docker): see below.
- `0001_init` SQL for `postgres` and `sqlite` compared byte-for-byte with the output of a build of `origin/master`: identical.

## Decisions

- **MySQL runs no statement.** MySQL `TIMESTAMP` already stores a UTC instant (converted through the session time zone), and there is no `timestamptz` to move to. The migration is still registered so the history is the same on every database.
- **SQLite needs no source time zone.** Confirmed that SQLite cannot bind a JavaScript `Date` (`node:sqlite` rejects it; `better-sqlite3` and D1 document the same, not executed here). So `KyselyMetadataStore` cannot have written local-time values there: anything stored is either text the application serialized itself, or the column default `CURRENT_TIMESTAMP`, which is UTC by definition. The migration therefore only normalizes the default's format, and the mappers now read zone-less text as UTC (they used to read it in the process zone — wrong for `CURRENT_TIMESTAMP`).
- **Zone as an option, validated, default `UTC`.** Old values are in the zone of the writing *process*, which the database cannot know.
- **Fixtures instead of snapshots** for frozen SQL: readable `.sql` files that downstream projects can diff against their own copies.
- **SQL Server removed from the supported list.** `timestamp` is rowversion there and only one such column is allowed per table, so `0001` could never apply. Stated from SQL Server's documented behavior; not executed.

## Findings outside this task (not fixed)

- **MySQL:** on 8.4 with `utf8mb4`, `0001_init` fails at `idx_blobs_locator` (`Specified key was too long; max key length is 3072 bytes`), and `INSERT … RETURNING` — used by every store method — is a syntax error. MySQL support was already non-functional before this change. Documented as a known limitation.
- **SQLite / D1 writes:** the stores pass `Date` parameters, which SQLite drivers cannot bind. Works only if the application adds a serializing plugin. Documented.
