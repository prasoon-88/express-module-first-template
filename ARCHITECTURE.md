# Architecture

This is a **module-first modular monolith**: one deployable process, split by business feature
rather than by technical layer. Each feature lives in one folder under `src/modules/`, owns its
data, and shows the rest of the application a small public API.

The rules below are enforced by tooling (`pnpm lint:arch`, part of CI), not by this document.

## Structure

```
src/
  app.ts          buildApp(deps): creates the modules, wires them, mounts routers. No logic.
  server.ts       Process entry: listen, start jobs, graceful shutdown.
  config/         Environment, validated with zod at boot. The only reader of process.env.
  modules/
    users/        Reference module.
    orders/       Reference module. Uses users through its public API and the event bus.
      index.ts                     PUBLIC API. The only file other code may import.
      orders.routes.ts             HTTP wiring: path, validation, controller method.
      orders.controller.ts         req/res only. No business logic.
      orders.service.ts            Business logic. Knows nothing about HTTP.
      orders.repository.ts         Repository PORT: an interface, the only persistence contract.
      orders.repository.memory.ts  Repository ADAPTER (in-memory). The only adapter shipped.
      orders.model.ts              Stored entity type. Storage-neutral, private to the module.
      orders.schema.ts             zod schemas for request params, body and query.
      orders.types.ts              DTOs and the module's public API type.
      orders.errors.ts             Typed errors the module throws.
      orders.events.ts             Events the module emits or consumes.
      __tests__/                   Service test, routes test, repository contract suite.
  shared/         Code used by two or more modules, free of domain knowledge.
    errors/       AppError and the HttpError subclasses.
    lib/          logger, request context, event bus, health router.
    middleware/   request-id, validate, rate-limit, not-found, error-handler.
    types/ utils/ Page<T> and the pagination helpers used by every list endpoint.
  jobs/           Scheduler and background jobs. Call module public APIs only.
tests/
  e2e/            Tests through the whole application.
  architecture/   Proves the architecture rules still fail on violations.
```

## The rules, and why

Dependency direction: **`app` → `jobs` → `modules` → `shared` → `config`**. Nothing imports
"upwards".

| #   | Rule                                                                                                             | Why                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | `shared` never imports from `modules`. `app.ts` is composition only.                                             | Shared code that knows a feature cannot be reused, and creates cycles.                            |
| 2   | A module imports another module only through its `index.ts`.                                                     | The public API is the contract. Everything else can change freely.                                |
| 3   | A module never touches another module's model or storage. It calls the owning module's public API.               | One owner per piece of data: invariants live in one place, and the module can be extracted later. |
| 4   | Controllers hold no business logic. Services never import Express. Only repositories touch the database.         | Logic stays testable without HTTP, and reusable from jobs and events.                             |
| 5   | Services return DTOs, never stored entities.                                                                     | Storage shape can change without breaking callers; nothing private leaks.                         |
| 6   | Cross-module side effects go through the event bus.                                                              | The emitting module does not need to know who reacts.                                             |
| 7   | No circular dependencies. Fix the boundary, never suppress the rule.                                             | A cycle means two modules are really one, or a third concept is missing.                          |
| 8   | Promote code to `shared/` only when two or more modules use it and it has no domain knowledge.                   | Premature sharing couples modules through a "common" dumping ground.                              |
| 9   | Path aliases only (`@modules/*`, `@shared/*`, `@config/*`). No `../`.                                            | Imports state which boundary they cross, and survive file moves.                                  |
| 10  | Services throw typed `AppError`s; one middleware maps them to HTTP. Input is validated at the edge, env at boot. | One place decides what a client sees. Bad input and bad config fail early and loudly.             |

Further rules that follow from these, also enforced:

- Only repository adapters (`*.repository.<driver>.ts`) may import a database driver.
- Services depend on the repository **port**. Only `index.ts` (and tests) import an adapter.
- Controllers do not import repositories or models.
- `index.ts` never uses `export *` and never exports a model or repository.
- Modules do not import `@config`. They receive what they need through
  `create<Name>Module(deps)`, which keeps them testable in isolation.
- `process.env` is read in `src/config/env.ts` only.

### How the rules are enforced

| Tool                                                  | What it checks                                                                                                                                                 |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.arch.config.mjs` (eslint-plugin-boundaries 7) | Every import statement against the rules above. Also part of the main ESLint config for editors.                                                               |
| `.dependency-cruiser.cjs`                             | The whole dependency graph: cycles, plus the same boundaries as an independent second check.                                                                   |
| `tests/architecture/`                                 | Runs both tools against a fixture project full of deliberate violations and asserts each is reported. A rule that silently stops working fails the test suite. |

`pnpm lint:arch` runs ESLint with `--no-inline-config`: an `eslint-disable` comment cannot
silence an architecture rule.

## Request flow

```
request
  → request-id        accept or generate X-Request-Id, open the request context
  → pino-http         one log line per request
  → helmet            security headers
  → /health, /ready   answered here, before rate limiting
  → rate-limit        per client IP
  → express.json      body parsing, size limit
  → router            <module>.routes.ts
      → validate      zod: params, body, query. Replaces them with the parsed values
      → controller    reads the request, calls the service, writes the response
          → service       business rules, returns a DTO or throws an AppError
              → repository port → adapter
  → not-found         no route matched
  → error-handler     every error becomes an RFC 9457 problem document
```

Errors are answered as `application/problem+json`:

```json
{
  "type": "about:blank",
  "title": "Conflict",
  "status": 409,
  "detail": "Order 3f2b... is confirmed; only a pending order can be confirmed",
  "instance": "/orders/3f2b.../confirm",
  "code": "ORDER_NOT_PENDING",
  "requestId": "8d1e..."
}
```

`code` is the stable, machine-readable identifier. Validation failures add an `errors` array of
`{ path, message }`. Anything that is not a known client error is logged in full and answered
with a generic 500.

The request id is stored in an `AsyncLocalStorage` context, and a pino mixin adds it to every
log line written while the request is handled, including lines from services and repositories.

## Composition

Each module exports one factory from its `index.ts`:

```ts
export function createOrdersModule(deps: { eventBus: EventBus; users: UsersApi }): {
  router: Router;
  api: OrdersApi;
};
```

`app.ts` is the composition root. It creates the modules in dependency order and hands each one
what it needs: `orders` receives `users.api`, whose type comes from `@modules/users`. Nothing is
a global singleton except the logger, so tests build a fresh, isolated application per test
(`tests/helpers/test-app.ts`).

Services, controllers and repositories are factory functions, not classes. A method of a factory
result can be passed to Express without losing `this`.

## Adding a module

```bash
pnpm gen:module invoices
```

This creates `src/modules/invoices/` (routes, controller, service, repository port, in-memory
adapter, model, schema, types, errors, events, `index.ts`, a service test, a repository contract
suite and its in-memory run) and registers the module in `src/app.ts`. The result passes
`typecheck`, `lint`, `lint:arch` and `test` as generated. Then:

1. Shape the entity in `invoices.model.ts`, the DTO in `invoices.types.ts`, the request schemas
   in `invoices.schema.ts`.
2. Write the business rules in `invoices.service.ts`, test-first in `__tests__/`.
3. If it needs another module, add that module's API to `InvoicesModuleDeps`, import the type
   from `@modules/<other>`, and pass it in `app.ts`.

## When to promote code to `shared/`

Promote only when **both** hold:

1. Two or more modules use it today (not "might one day").
2. It has no domain knowledge: it would make sense in a different product.

Pagination helpers and the error classes qualify. A `formatOrderNumber` helper does not, however
many modules call it: it belongs to `orders`, exposed through its public API. When in doubt,
duplicate. Two similar functions are cheaper than a wrong shared abstraction.

## Events

`shared/lib/event-bus.ts` declares an empty `DomainEvents` registry. A module adds its events by
declaration merging in `<module>.events.ts`, which makes `publish` and `subscribe` fully typed:

```ts
declare module '@shared/lib/event-bus' {
  interface DomainEvents {
    'order.placed': OrderPlacedEvent;
  }
}
```

`orders` publishes `order.placed` after the order is stored. `users` subscribes by name and
increments `orderCount`. `users` imports nothing from `orders`, so there is no cycle; the event
name and payload are the contract.

### Limits of the in-process bus

- **In-process:** handlers run in the same process as the publisher. Other instances see nothing.
- **At-most-once:** events live in memory. If the process dies after the order is stored and
  before the handler runs, the event is lost.
- **Not transactional:** the handler runs after the publisher's operation succeeded. A handler
  failure is logged and does not undo or fail the original request.

That is fine for effects that may occasionally be missed or can be repaired (counters, cache
invalidation, notifications). It is not fine for effects that must happen.

### Upgrade path: transactional outbox

When an event must not be lost:

1. In the same database transaction as the state change, insert the event into an `outbox`
   table (`id`, `name`, `payload`, `created_at`, `processed_at`).
2. A relay (a job in `jobs/`, or a change-data-capture stream) reads unprocessed rows and
   delivers them, in-process or to a broker, then marks them processed.
3. Delivery becomes at-least-once, so handlers must be idempotent: deduplicate on the event id.

Modules keep calling `eventBus.publish`; only the bus implementation and the repository
transaction change.

## Adding a database

The template ships without a database on purpose: every module persists through a repository
port, and the in-memory adapter is the only implementation. To add a real one:

1. **Install the driver** (for example `pnpm add pg`).
2. **Add a connection file**, e.g. `src/shared/lib/db.ts`, exporting `connect()`, `close()` and
   `ping()`. Add its settings to `src/config/env.ts`. In `server.ts`: connect before
   `listen`, pass `{ name: 'database', check: ping }` in `readinessChecks` so `/ready` reflects
   it, and close the connection during shutdown, after the HTTP server.
3. **Write the adapter** `src/modules/<name>/<name>.repository.<driver>.ts` implementing the
   port. This is the only kind of file allowed to import the driver. Map rows or documents to the
   entity type here; map the driver's unique-constraint error to the module's typed error.
4. **Run the contract suite against it.** Add `__tests__/<name>.repository.<driver>.test.ts`:

   ```ts
   describeUsersRepositoryContract('postgres', () => createPostgresUsersRepository(testPool));
   ```

   The factory must return an empty repository each time (truncate the table).

5. **Switch the adapter** in the module's `index.ts`, the one place that chooses it. Pass the
   connection in through the module's deps from `app.ts`.

The service, controller, routes and their tests do not change.

Two contract points matter for real databases: `transitionStatus` and
`expirePendingCreatedBefore` must be single atomic statements (`UPDATE ... WHERE status = ...`),
and email uniqueness must be a unique index, not a read followed by a write.

## Background jobs

`jobs/scheduler.ts` runs jobs on an interval, never overlaps a job with itself, and stops them
during graceful shutdown. Jobs call module public APIs only.

The scheduler runs inside every application instance. With three instances, each job runs three
times per interval, so **jobs must be idempotent**. `expire-pending-orders` is: it performs one
atomic "pending and older than the cutoff → expired" update, which changes each order exactly
once however many instances run it. If a job must run on one instance only, add a distributed
lock or move it to an external scheduler.

## Operational notes

- **Graceful shutdown** (SIGTERM, SIGINT): `/ready` starts answering 503, jobs stop, the HTTP
  server stops accepting connections and finishes in-flight requests, pending event handlers
  finish, logs flush, the process exits. After `SHUTDOWN_TIMEOUT_MS` it exits forcibly.
- **`/health`** is liveness: the process responds. **`/ready`** is readiness: every
  `readinessChecks` entry passes and the process is not shutting down.
- **Rate limiting** counts in process memory. With N instances the effective limit is N times
  `RATE_LIMIT_MAX`. Use a shared store (for example `rate-limit-redis`) when that matters.
  Set `TRUST_PROXY` to the number of proxies in front of the app, or every client shares the
  proxy's IP.
- **In-memory persistence** means data is lost on restart and not shared between instances. Each
  module logs this at boot.

## When to extract a module into a service

Stay a monolith until a specific pressure appears. Extract a module when at least one is true
and measured:

- It needs to scale very differently from the rest (CPU, memory, traffic).
- It needs a different release cadence, or a separate team owns it end to end.
- It needs isolation: a different runtime, a compliance boundary, a noisy workload.

Because of rules 2, 3 and 6, extraction is mechanical: the module already has a public API
(turn it into an HTTP or RPC client with the same interface), owns its data (move its tables),
and talks to others through events (move them to a broker with the outbox pattern). If
extraction looks hard, a rule has been bent somewhere; fix that first.

## Why TypeScript 6 and not 7

TypeScript is pinned to 6.0.x because the tooling does not support 7 yet:
`typescript-eslint` 8.72 requires `typescript <6.1.0`, and `dependency-cruiser` 18 requires
`typescript <7`. Upgrade when both do.

Related choices:

- `module: "preserve"` with bundler resolution and `noEmit`: TypeScript only type-checks. `tsx`
  runs the code in development, `esbuild` bundles it for production, Vite resolves it in tests.
  All three resolve the `paths` aliases themselves, so no `tsc-alias` or `tsconfig-paths`.
- `erasableSyntaxOnly`: no enums or parameter properties, so the code stays compatible with
  type stripping.
- `allowJs` is on only so the architecture test can import `eslint.arch.config.mjs`.
