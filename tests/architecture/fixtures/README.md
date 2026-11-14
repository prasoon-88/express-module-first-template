# Architecture fixtures

A miniature project that breaks the architecture rules on purpose.
`tests/architecture/architecture.test.ts` runs ESLint (eslint.arch.config.mjs) and
dependency-cruiser (.dependency-cruiser.cjs) against it and asserts that every violation is
reported, so a rule that silently stops working fails the test suite.

These files are excluded from the normal typecheck, lint and dependency-cruiser runs.
`billing` is the well-behaved module; `invoices`, `shared/lib/leaky.ts` and `config/index.ts`
hold the violations. Each violating import is marked with a `VIOLATION` comment.
