/**
 * Architecture rules (see ARCHITECTURE.md). `pnpm lint:arch` runs this file on its own;
 * eslint.config.mjs also includes it, so editors report violations as you type.
 * tests/architecture proves on every test run that each rule still catches its violation.
 */
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/** Database drivers and clients. Only repository adapters may import them. */
const DB_DRIVERS = [
  'mongoose',
  'mongodb',
  'pg',
  'postgres',
  'mysql2',
  'better-sqlite3',
  'drizzle-orm',
  '@prisma/client',
  'typeorm',
  'sequelize',
  'knex',
  'kysely',
  'ioredis',
  'redis',
];

const dbDriverPatterns = {
  group: DB_DRIVERS.flatMap((name) => [name, `${name}/*`]),
  message:
    'Only repository adapters (<module>.repository.<driver>.ts) may import a database driver.',
};

const expressPatterns = {
  group: ['express', 'express/*', 'express-serve-static-core'],
  message:
    'Services hold business logic and must not know about HTTP. Keep Express in controllers.',
};

const parentImportMessage =
  'Use a path alias (@modules/*, @shared/*, @config/*) instead of a parent-relative import.';

/** Builds the options of `no-restricted-imports`; flat config replaces them, it never merges. */
function restrictedImports({ dbDrivers = true, express = false, parent = ['../*'] } = {}) {
  return [
    'error',
    {
      patterns: [
        { group: parent, message: parentImportMessage },
        ...(dbDrivers ? [dbDriverPatterns] : []),
        ...(express ? [expressPatterns] : []),
      ],
    },
  ];
}

const DIRECTION_MESSAGE =
  'Dependency direction is app -> modules -> shared -> config. This import goes against it.';

const element = (type) => ({ element: { type } });
const category = (categories) => ({ file: { categories } });

/**
 * @param {string} rootDir Directory that contains `src/` and the tsconfig.json with the aliases.
 * @returns {import('eslint').Linter.Config[]}
 */
export function createArchitectureConfig(rootDir) {
  return [
    {
      files: ['src/**/*.ts'],
      languageOptions: { parser: tseslint.parser },
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': rootDir,
        'boundaries/include': ['src/**/*.ts'],
        'boundaries/legacy-templates': false,
        'import/resolver': { typescript: { alwaysTryTypes: true, project: rootDir } },
        // Most specific first: the first matching descriptor wins.
        'boundaries/elements': [
          { type: 'module', pattern: 'src/modules/*', capture: ['module'], partialMatch: false },
          { type: 'shared', pattern: 'src/shared', partialMatch: false },
          { type: 'config', pattern: 'src/config', partialMatch: false },
          { type: 'jobs', pattern: 'src/jobs', partialMatch: false },
          { type: 'app', pattern: 'src', partialMatch: false },
        ],
        'boundaries/files': [
          { category: 'test', pattern: 'src/**/__tests__/**' },
          { category: 'entry', pattern: 'src/modules/*/index.ts' },
          { category: 'service', pattern: 'src/modules/*/*.service.ts' },
          { category: 'controller', pattern: 'src/modules/*/*.controller.ts' },
          { category: 'model', pattern: 'src/modules/*/*.model.ts' },
          { category: 'repository-port', pattern: 'src/modules/*/*.repository.ts' },
          { category: 'repository-adapter', pattern: 'src/modules/*/*.repository.*.ts' },
        ],
      },
      rules: {
        'boundaries/no-unknown-files': 'error',
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            checkInternals: true,
            message: DIRECTION_MESSAGE,
            // Evaluated in order; the last policy that matches wins.
            policies: [
              // Rules 2 and 3: a module is closed. Nothing outside it may import its files
              // (model, repository, service), unless a later policy says otherwise.
              {
                disallow: { to: element('module') },
                message:
                  'Import the "{{ to.element.captured.module }}" module through its public API (@modules/{{ to.element.captured.module }}), never a file inside it.',
              },
              {
                from: [element('shared'), element('config')],
                disallow: { to: element('module') },
                message: DIRECTION_MESSAGE,
              },

              // Rule 1: dependency direction.
              {
                from: element('app'),
                allow: { to: [element('jobs'), element('shared'), element('config')] },
              },
              { from: [element('jobs'), element('module')], allow: { to: element('shared') } },
              { from: element('shared'), allow: { to: element('config') } },

              // ...the public API of a module is its index.ts.
              {
                from: [element('app'), element('jobs'), element('module')],
                allow: { to: { element: { type: 'module', fileInternalPath: 'index.ts' } } },
              },

              // Inside one element, files import each other freely, except for the two rules below.
              { allow: { dependency: { relationship: { to: 'internal' } } } },

              // Rule 4: controllers talk to services only.
              {
                from: category('controller'),
                disallow: { to: category(['model', 'repository-port', 'repository-adapter']) },
                message: 'Controllers call services. They must not import a repository or a model.',
              },

              // The adapter is chosen in one place: the module's index.ts (and its tests).
              {
                from: category({ noneOf: ['entry', 'test'] }),
                disallow: { to: category('repository-adapter') },
                message:
                  'Depend on the repository port (<module>.repository.ts). Only index.ts picks an adapter.',
              },
            ],
          },
        ],

        // Rule 9: aliases only. Plus: database drivers stay inside repository adapters.
        'no-restricted-imports': restrictedImports(),
      },
    },

    {
      // Tests may reach one level up, to the code they test, and no further.
      files: ['src/**/__tests__/**/*.ts'],
      rules: { 'no-restricted-imports': restrictedImports({ parent: ['../../*'] }) },
    },
    {
      files: ['src/modules/*/*.service.ts'],
      rules: { 'no-restricted-imports': restrictedImports({ express: true }) },
    },
    {
      files: ['src/modules/*/*.repository.*.ts'],
      rules: { 'no-restricted-imports': restrictedImports({ dbDrivers: false }) },
    },

    {
      // A module's public API is explicit, and never leaks its persistence.
      files: ['src/modules/*/index.ts'],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'ExportAllDeclaration',
            message: 'List the public API explicitly; `export *` leaks everything.',
          },
          {
            selector: 'ExportNamedDeclaration[source.value=/\\.(model|repository)(\\.|$)/]',
            message: 'A module never exports its model or repository. Expose a service method.',
          },
        ],
      },
    },
  ];
}

export default createArchitectureConfig(import.meta.dirname);
