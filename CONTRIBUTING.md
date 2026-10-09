# Contributing

Thank you for contributing to `vankyle-storage`.

## Before You Start

- Read the project overview in [README.md](README.md).
- Read the architecture notes in [docs/architecture.md](docs/architecture.md).
- Agents and frequent contributors: read [AGENTS.md](AGENTS.md) and the SDD rules in [docs/coding.md](docs/coding.md).
- Check for existing issues or pull requests before starting duplicate work.

## Collaboration Workflow

Write GitHub titles, bodies, comments, and reviews in English. Maintainers apply suitable existing labels and set assignees, reviewers, milestones, and projects as needed.

### Issues

Issues collect problems and needs. Use the issue forms (`bug:`, `feat:`, or `task:` titles) and describe the problem or use case, reproduction steps where relevant, and the expected result. Reporters are not required to provide implementation plans or acceptance criteria — solutions, plans, progress, and validation evidence are tracked in the pull request, not the issue.

For security issues, follow [SECURITY.md](SECURITY.md) instead of creating a public issue.

### Documentation-only changes

Maintainers may edit or commit explanatory documentation and non-executable issue/PR templates directly, without a dedicated issue or PR. An optional documentation branch uses `docs/<short-description>`. Check content and links and preserve unrelated work.

Code, dependencies, executable automation, migrations, and deployment configuration always follow the full workflow below, including when documentation accompanies them.

### Code and configuration changes

1. Create or reference an issue describing the problem or need — including for small fixes and dependency upgrades.
2. Branch from the latest `origin/master` as `<type>/<issue-number>-<slug>` (lowercase hyphenated slug), preserving unrelated work. Do not use a shared `dev/` or `feature/` branch.
3. Push a meaningful initial change and open a Draft PR targeting `master` before implementing the complete solution. Use the [PR template](.github/pull_request_template.md).
4. Implement and test locally. Keep progress, blockers, and validation evidence in the PR. For substantial work, follow the SDD episode conventions in [docs/coding.md](docs/coding.md) and link the spec/plan/notes from the PR; a quick fix may omit a new spec but still needs an issue and a PR.
5. Push the completed changes, record checks for the full head SHA, then mark Ready for review. Keep unfinished work in Draft.
6. A human maintainer must review and explicitly approve the exact current head SHA before merging. New commits or conflict resolution require renewed approval. Agent review, CI, or Ready status cannot substitute for human approval; these rules apply even without branch protection. Normally squash merge.

| Change | Branch prefix | Commit/PR type |
| --- | --- | --- |
| Feature | `feat/` | `feat` |
| Bug fix | `fix/` | `fix` |
| Urgent production fix | `hotfix/` | `fix` |
| Documentation | `docs/` | `docs` |
| Refactoring | `refactor/` | `refactor` |
| Performance | `perf/` | `perf` |
| Tests | `test/` | `test` |
| CI / automation | `ci/` | `ci` |
| Build / dependencies | `build/` | `build` |
| Maintenance | `chore/` | `chore` |

Use the main purpose of the change. One issue can have multiple PRs of different types.

### Completing issues

After a merged PR fully resolves an issue, add an English resolution comment linking the PR, then close it as completed. For auto-closed issues, add only a missing comment. Keep partially resolved issues open; if an issue explicitly requires release or acceptance, keep it open until that scope is fulfilled. Track merge, release, and validation separately.

## Development Setup

Prerequisites:

- Node.js 20 or newer.
- `pnpm` 10 or newer.

Install dependencies:

```bash
pnpm install
```

Useful commands:

```bash
pnpm build
pnpm typecheck
pnpm dev
pnpm exec vitest run
```

## Project Conventions

- Keep `core` provider-agnostic.
- Do not introduce dependencies from `shared` to `core` or provider packages.
- Keep provider-specific SDK types inside their own packages.
- Prefer small, focused changes over broad refactors.
- Update docs when behavior, public APIs, or package responsibilities change.

## Pull Request Guidelines

Please make sure your pull request:

- Follows the [collaboration workflow](#collaboration-workflow) above.
- Has a clear title in the conventional format `type(scope): short summary` (the squash-merge commit message).
- Explains the problem being solved.
- Describes any API, schema, or behavior changes.
- Includes tests when the change affects behavior.
- Keeps unrelated formatting and cleanup out of the same PR.

## Commit Guidance

Consistent commit messages help review and release workflows. A lightweight conventional format is preferred:

```text
type(scope): short summary
```

Examples:

```text
feat(core): add upload session lifecycle validation
fix(s3): preserve etag when completing multipart upload
docs(repo): document provider package boundaries
```

Recommended types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `perf`
- `test`
- `ci`
- `build`
- `chore`

## Tests

Add or update tests when you change:

- Domain validation rules.
- Metadata persistence behavior.
- Provider mapping behavior.
- Upload completion and file-version creation flows.

If tests are not added, explain why in the pull request.

## Documentation

Update these files when relevant:

- [README.md](README.md) for user-facing setup or positioning changes.
- [docs/architecture.md](docs/architecture.md) for design or boundary changes.
- [docs/getting-started.md](docs/getting-started.md) for workflow or API usage changes.
- [docs/migrations.md](docs/migrations.md) for metadata schema changes.
- Package READMEs for provider-specific or package-specific changes.

## Reporting Bugs

Use the bug report template and include:

- Environment and runtime.
- Storage provider and metadata provider used.
- Expected behavior.
- Actual behavior.
- Reproduction steps.

For security issues, follow [SECURITY.md](SECURITY.md) instead of creating a public issue.

## Code of Conduct

By participating in this project, you agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Contributions are licensed under [Mozilla Public License 2.0](LICENSE).
