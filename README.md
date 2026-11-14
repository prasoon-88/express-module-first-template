# express-module-first-template

A production-grade starter for Express 5 backends, organised **by feature** (module-first
modular monolith) with boundaries that are enforced by tooling.

- **Express 5, TypeScript 6 (strict), ESM, Node 26, pnpm**
- **Modules with a public API**: `src/modules/<name>/index.ts` is the only importable file
- **Architecture rules that fail the build**: eslint-plugin-boundaries and dependency-cruiser
- **Database-agnostic**: repository ports, in-memory adapters, reusable contract test suites
- zod-validated environment and requests, RFC 9457 error responses, pino logging with request ids
- Typed in-process event bus, background jobs, graceful shutdown, `/health` and `/ready`
- Module generator, multi-stage Dockerfile, CI

Read [ARCHITECTURE.md](ARCHITECTURE.md) for the rules and the reasons behind them, and
[MIGRATING.md](MIGRATING.md) to move an existing layered codebase into this structure.

## Quickstart

Requirements: Node 26.13 or later (`.nvmrc`) and pnpm (the version in `package.json` is selected
automatically).

```bash
pnpm install
```

```bash
pnpm dev
```

The server listens on http://localhost:3000. Configuration is optional; to change it, copy
`.env.example` to `.env`.

```bash
curl -X POST localhost:3000/users -H 'content-type: application/json' -d '{"email":"ada@example.com","name":"Ada"}'
```

## API of the reference modules

| Method | Path                  | Description                                              |
| ------ | --------------------- | -------------------------------------------------------- |
| GET    | `/health`             | Liveness                                                 |
| GET    | `/ready`              | Readiness (503 while shutting down or a check fails)     |
| POST   | `/users`              | Create a user: `{ email, name }`                         |
| GET    | `/users`              | List users: `?page=1&pageSize=20`                        |
| GET    | `/users/:id`          | Get a user                                               |
| POST   | `/orders`             | Place an order: `{ userId, items: [{ sku, quantity }] }` |
| GET    | `/orders`             | List orders: `?userId=&page=&pageSize=`                  |
| GET    | `/orders/:id`         | Get an order                                             |
| POST   | `/orders/:id/confirm` | Confirm a pending order                                  |

`users` and `orders` exist to demonstrate the rules: `orders` checks the user through the
`users` public API, publishes `order.placed`, and `users` reacts by incrementing `orderCount`.
A background job expires orders that stay pending too long.

Data is kept **in memory** and is lost on restart. See "Adding a database" in
[ARCHITECTURE.md](ARCHITECTURE.md#adding-a-database).

## Scripts

| Script                   | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`               | Run with reload (`tsx watch`), loading `.env` when it exists                |
| `pnpm build`             | Bundle `src/server.ts` into `dist/server.js` with esbuild                   |
| `pnpm start`             | Run the built server                                                        |
| `pnpm typecheck`         | `tsc --noEmit`                                                              |
| `pnpm lint`              | ESLint, Prettier check, and knip (unused files, exports and dependencies)   |
| `pnpm lint:arch`         | Architecture rules: dependency-cruiser and the boundaries ESLint config     |
| `pnpm test`              | Vitest: unit, route, repository contract, end-to-end and architecture tests |
| `pnpm gen:module <name>` | Scaffold a module and register it in `src/app.ts`                           |

## Docker

```bash
docker build -t express-module-first-template .
```

```bash
docker run --rm -p 3000:3000 express-module-first-template
```

The image contains production dependencies and the bundle only, runs as the non-root `node`
user, has a `HEALTHCHECK` on `/health`, and shuts down gracefully on `docker stop`.

## Using this as a template

1. On GitHub, choose **Use this template** (or clone and remove `.git`).
2. Rename the project: `name` and `description` in `package.json`, the image name in
   `.github/workflows/ci.yml`, and the title of this README.
3. Add your first module: `pnpm gen:module <name>` (plural, kebab-case, e.g. `invoices`).
4. Remove the reference modules once you no longer need them as examples:
   - delete `src/modules/users` and `src/modules/orders`;
   - remove their lines from `src/app.ts` (imports, `create...Module`, `app.use`, the `orders`
     field of `App`);
   - delete `src/jobs/expire-pending-orders.job.ts` and its test, and its entry in
     `src/server.ts`; remove `ORDER_PENDING_TTL_MS` and `EXPIRE_ORDERS_INTERVAL_MS` from
     `src/config/env.ts` and `.env.example`;
   - delete `tests/e2e/order-flow.test.ts`.

   `pnpm typecheck` and `pnpm lint` (knip) point at anything left behind.

5. Add a database when you need one: [ARCHITECTURE.md](ARCHITECTURE.md#adding-a-database).

## Conventions

- Dependencies are pinned to exact versions (`saveExact` in `pnpm-workspace.yaml`).
- pnpm blocks dependency install scripts unless they are listed under `allowBuilds` in
  `pnpm-workspace.yaml`. Only `esbuild` is allowed.
- Conventional commits (`feat(orders): ...`).
- CI must pass: typecheck, lint, lint:arch, test, build, Docker build and smoke test.
