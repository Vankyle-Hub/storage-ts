# Contributing

Thank you for contributing to `vankyle-storage`.

## Before You Start

- Read the project overview in [README.md](README.md).
- Read the architecture notes in [docs/architecture.md](docs/architecture.md).
- Check for existing issues or pull requests before starting duplicate work.

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

- Has a clear title and description.
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
- `test`
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