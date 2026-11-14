# Migrating a layered Express codebase

This guide moves a codebase organised by technical layer:

```
src/controllers/  src/services/  src/models/  src/routes/  src/middlewares/  src/utils/
```

into the module-first structure described in [ARCHITECTURE.md](ARCHITECTURE.md), without a
rewrite and without a long-lived branch. The application keeps working after every step, and
every step is a small pull request.

The order matters: **audit → safety net → one module at a time → cleanup**.

## Step 1: Audit

Do not move code yet. Find the modules and the problems first.

1. **List the features.** Group every route by the business noun it serves (`/users`,
   `/orders`, `/invoices`). Each group is a candidate module. Files named after the same noun
   across layers (`user.controller`, `user.service`, `user.model`) belong together.
2. **Assign data ownership.** For every table or collection, name the one module that owns it.
   If two features write the same table, either they are one module or the table needs
   splitting. Write the decision down.
3. **Draw the dependency graph** of what exists today:

   ```bash
   npx dependency-cruiser src --output-type dot | dot -T svg > before.svg
   ```

   Mark every place where feature A reads or writes feature B's model directly, and every
   cycle. These are the real work of the migration.

4. **Classify `utils/` and `helpers/`.** Each function is either generic (goes to `shared/`),
   or domain logic in disguise (goes to the module that owns the concept).
5. **Choose the order.** Start with a leaf: a feature that others depend on but that depends on
   nothing (often `users`). Finish with the most entangled one.

Output of this step: a list of modules, an owner for every table, a list of cross-module
accesses to untangle, and a migration order.

## Step 2: Safety net

You are about to move a lot of code. Make sure behaviour cannot change unnoticed.

1. **Add HTTP-level tests** (Supertest) for the endpoints of the first module to migrate, and
   for the critical flows that cross modules. Test through the HTTP interface, not internals:
   these tests must survive the move unchanged.
2. **Bring in the foundation from this template** next to the existing code. Nothing here
   changes behaviour:
   - `tsconfig.json` path aliases (`@modules/*`, `@shared/*`, `@config/*`) and strict flags
     (turn on the flags that fail one at a time);
   - `src/config/env.ts`, then replace `process.env` reads with it;
   - `src/shared/` (errors, logger, request context, event bus, middleware);
   - `eslint.arch.config.mjs`, `.dependency-cruiser.cjs` and `tests/architecture/`.
3. **Switch to the central error handler.** Replace ad hoc `res.status(...).json(...)` error
   responses with typed errors gradually. If clients depend on the old error format, keep it in
   the error handler until they have moved.
4. **Introduce the composition root.** Make `app.ts` export `buildApp(deps)` and move
   `listen()` and shutdown into `server.ts`, so tests can build the application.
5. **Turn on `lint:arch` in CI now.** Legacy folders such as `src/controllers` are treated like
   app-level code: they may import `shared`, `config` and any module through its public API, so
   they do not fail it. From this point, migrated code cannot regress.

## Step 3: One module at a time

Repeat for each module, in the order from step 1. One module is one pull request, or several.

1. **Scaffold:** `pnpm gen:module users`. Delete the example entity fields you do not need.
2. **Move the model** into `users.model.ts` as a storage-neutral entity type. The ORM schema or
   table definition goes into the repository adapter (next point), not the model file.
3. **Extract the repository.** Define the port in `users.repository.ts` from what the service
   actually needs (`findById`, `insert`, ...), not from what the ORM offers. Implement it in
   `users.repository.<driver>.ts` by moving the existing queries there. Extend the generated
   contract suite and run it against both the in-memory and the real adapter.
4. **Move the service.** Paste the old service into `users.service.ts` as a factory function
   that takes `{ repository, ... }`. Then remove what does not belong:
   - `req`, `res`, status codes → controller;
   - direct ORM calls → repository;
   - `throw new Error('not found')` → typed errors in `users.errors.ts`;
   - returned ORM documents → DTOs mapped in the service.
5. **Move the controller and routes.** The controller reads the validated request, calls one
   service method and writes the response. Move validation into zod schemas in
   `users.schema.ts` and apply them with `validate()` in the routes.
6. **Replace cross-module access.** This is the step that pays for the migration.
   - Other features that used `UserModel` directly now receive `users.api` through their deps
     and call a method on it. Add the method to `UsersApi` if it is missing. Until the caller
     is migrated too, legacy code may import `@modules/users` like any other consumer.
   - If this module reached into others, do the same in reverse, or, when the other module
     only needs to react, publish an event instead.
   - A cycle between two modules means one of: they are one module; one direction should be an
     event; or a third module is missing. Do not suppress the rule.
7. **Register the module** in `app.ts` (the generator did this), mount it on the old path, and
   delete the old route, controller, service and model files in the same pull request. Never
   leave two implementations of one endpoint.
8. **Verify:** the HTTP tests from step 2 pass unchanged, and `pnpm typecheck`, `pnpm lint`,
   `pnpm lint:arch` and `pnpm test` pass.

Keep each pull request shippable. If a module is too big for one, move it behind its public API
first (steps 1 to 5 with a thin service that still delegates to legacy code), then replace the
internals in later pull requests.

### Shared database transactions

Layered codebases often wrap several features in one transaction. After the split, prefer in
this order:

1. Keep the whole operation inside the one module that owns the invariant.
2. Make the second effect an event with the outbox pattern (see ARCHITECTURE.md).
3. Only if neither fits, pass a transaction handle through the public API explicitly, and treat
   that as debt to remove.

## Step 4: Cleanup

1. **Delete the empty layer folders** (`controllers/`, `services/`, `models/`, `routes/`).
2. **Empty `utils/`.** Everything left is either moved to `shared/` (generic, used by two or
   more modules) or into the module that owns it.
3. **Remove temporary allowances:** legacy error formats in the error handler, the old error
   helpers, any transitional re-exports.
4. **Run knip** (`pnpm lint`) and remove unused files, exports and dependencies.
5. **Tighten the remaining TypeScript flags** that were postponed in step 2.
6. **Redraw the dependency graph** and compare it with `before.svg`. It should show
   `app → modules → shared → config`, modules connected only through their `index.ts`, and no
   cycles.
7. **Update the documentation:** the module list and any rule your team added.

## Common pitfalls

- **Moving files without changing dependencies.** Folders named after features with the same
  tangled imports inside are a layered codebase with extra steps. Step 3.6 is the migration.
- **A `shared/` that becomes the new `utils/`.** Apply the promotion rule strictly: two or more
  modules, no domain knowledge.
- **Fat public APIs.** Export what another module needs today, not every service method.
- **Sharing entity types between modules.** Exchange DTOs. An entity that crosses a module
  boundary couples both modules to one storage shape.
- **A big-bang branch.** It will not merge. Migrate one module per pull request on the main
  branch, with the old and new structure living side by side until the last module moves.
