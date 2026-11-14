/**
 * Architecture rules at the dependency-graph level (see ARCHITECTURE.md).
 * eslint.arch.config.mjs enforces the same boundaries per import statement; this file adds
 * what only a whole-graph view can see (cycles) and acts as a second, independent check.
 */
const DB_DRIVERS =
  'mongoose|mongodb|pg|postgres|mysql2|better-sqlite3|drizzle-orm|@prisma/client|typeorm|sequelize|knex|kysely|ioredis|redis';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Circular dependencies hide a wrong boundary. Fix the boundary, never suppress.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'shared-is-below-modules',
      comment:
        'shared never imports from modules, jobs or the app. Direction: app -> modules -> shared.',
      severity: 'error',
      from: { path: '^src/shared/' },
      to: { path: '^src/(modules|jobs)/|^src/(app|server)[.]ts$' },
    },
    {
      name: 'config-is-a-leaf',
      comment: 'config imports nothing from the application.',
      severity: 'error',
      from: { path: '^src/config/' },
      to: { path: '^src/', pathNot: '^src/config/' },
    },
    {
      name: 'modules-do-not-reach-up',
      comment:
        'Modules receive what they need through create<Name>Module(deps), never by importing the app, jobs or config.',
      severity: 'error',
      from: { path: '^src/modules/' },
      to: { path: '^src/(jobs|config)/|^src/(app|server)[.]ts$' },
    },
    {
      name: 'module-public-api-only',
      comment:
        'A module is imported through its index.ts only. Its internals (model, repository, service) are private.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/[^/]+/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/index[.]ts$'],
      },
    },
    {
      name: 'module-public-api-only-from-outside',
      comment: 'app.ts, jobs and tests import a module through its index.ts only.',
      severity: 'error',
      from: { pathNot: '^src/modules/' },
      to: { path: '^src/modules/[^/]+/', pathNot: '^src/modules/[^/]+/index[.]ts$' },
    },
    {
      name: 'services-use-the-repository-port',
      comment: 'Only index.ts (and tests) pick a repository adapter.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/[^/]+[.]ts$', pathNot: '/index[.]ts$' },
      to: { path: '[.]repository[.][^./]+[.]ts$' },
    },
    {
      name: 'db-drivers-only-in-repository-adapters',
      comment: 'Only <module>.repository.<driver>.ts may import a database driver.',
      severity: 'error',
      from: { pathNot: '[.]repository[.][^./]+[.]ts$' },
      to: { path: [`^(${DB_DRIVERS})(/|$)`, `node_modules/(${DB_DRIVERS})/`] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Type-only imports count: a type import still couples two modules.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
