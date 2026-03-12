# Security Policy

## Supported Versions

This project is under active development. Security fixes are applied to the latest code on the default branch.

| Version | Supported |
|---|---|
| `main` / latest | Yes |
| Older snapshots, forks, and unpublished local changes | No |

## Reporting a Vulnerability

Please do not report security vulnerabilities in public GitHub issues.

Use one of these private channels instead:

1. GitHub Private Vulnerability Reporting or Security Advisories, if enabled for the repository.
2. A direct private message to the repository maintainers through GitHub, if advisory reporting is not available.

When reporting, include:

- A clear description of the issue and affected component.
- Reproduction steps or a minimal proof of concept.
- Impact assessment, including confidentiality, integrity, and availability implications.
- Any suggested remediation or mitigation, if known.

## Response Expectations

- Initial triage target: within 5 business days.
- Status update target: within 10 business days after triage.
- Fix timeline: depends on severity, exploitability, and release impact.

## Disclosure Policy

- Please allow maintainers reasonable time to investigate and remediate before public disclosure.
- After a fix is available, maintainers may publish a changelog note, advisory, or patch summary.

## Scope

The following are generally in scope:

- Remote code execution.
- Unauthorized data access or metadata exposure.
- Authentication or authorization bypass in integrations or example flows.
- Unsafe signed URL generation or upload lifecycle flaws.
- Multi-tenant isolation issues in metadata or blob reference handling.

The following are generally out of scope unless they produce a concrete security impact:

- Missing best-practice headers in example applications.
- Denial-of-service findings without a realistic exploit path.
- Vulnerabilities in third-party dependencies without a demonstrated impact path in this project.

## Handling Sensitive Data

Do not include real secrets, access keys, connection strings, or customer data in reports. Use redacted examples whenever possible.