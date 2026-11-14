/**
 * `pnpm gen:module <name>` scaffolds a complete module in src/modules/<name> and registers it
 * in src/app.ts. The result passes typecheck, lint, lint:arch and test as generated.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pluralize from 'pluralize';
import * as prettier from 'prettier';

const APP_FILE = 'src/app.ts';
const MODULE_FILES = [
  'index.ts',
  'routes.ts',
  'controller.ts',
  'service.ts',
  'repository.ts',
  'repository.memory.ts',
  'model.ts',
  'schema.ts',
  'types.ts',
  'errors.ts',
  'events.ts',
  '__tests__/service.test.ts',
  '__tests__/repository.contract.ts',
  '__tests__/repository.memory.test.ts',
];
/** Identifiers already used inside buildApp; a module with one of these names would clash. */
const RESERVED_NAMES = new Set(['app', 'deps', 'env', 'express', 'helmet', 'logger']);

/** Where a template ends up: `index.ts` keeps its name, the rest get the module prefix. */
function targetPath(file) {
  const directory = 'src/modules/{{kebabCase name}}';
  if (file === 'index.ts') {
    return `${directory}/index.ts`;
  }
  const [folder, base] = file.includes('/') ? file.split('/') : ['', file];
  return `${directory}/${folder ? `${folder}/` : ''}{{kebabCase name}}.${base}`;
}

function validateName(name) {
  if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) {
    return 'Use a plural, kebab-case name such as "invoices" or "purchase-orders".';
  }
  if (RESERVED_NAMES.has(name)) {
    return `"${name}" is reserved. Pick another name.`;
  }
  if (existsSync(resolve('src/modules', name))) {
    return `src/modules/${name} already exists.`;
  }
  return true;
}

export default function configure(plop) {
  plop.setHelper('singular', (text) => pluralize.singular(text));

  // Line lengths depend on the module name, so the generated code is formatted afterwards.
  plop.setActionType('format', async (answers, config) => {
    const files = config.files.map((file) => plop.renderString(file, answers));
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const options = await prettier.resolveConfig(resolve(file));
      await writeFile(file, await prettier.format(source, { ...options, filepath: file }));
    }
    return `formatted ${files.length} files`;
  });

  // `modify` silently leaves a file alone when its pattern does not match.
  plop.setActionType('verifyRegistration', async (answers) => {
    const app = await readFile(APP_FILE, 'utf8');
    const expected = [
      "import { create{{pascalCase name}}Module } from '@modules/{{kebabCase name}}';",
      'const {{camelCase name}} = create{{pascalCase name}}Module({ eventBus });',
      "app.use('/{{kebabCase name}}', {{camelCase name}}.router);",
    ].map((line) => plop.renderString(line, answers));
    const missing = expected.filter((line) => !app.includes(line));
    if (missing.length > 0) {
      throw new Error(
        `${APP_FILE} no longer has the shape the generator expects. Add by hand:\n${missing.join('\n')}`,
      );
    }
    return `${APP_FILE} registers the module`;
  });

  plop.setGenerator('module', {
    description:
      'A feature module: routes, controller, service, repository port and adapter, tests',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Module name (plural, kebab-case, e.g. invoices):',
        validate: validateName,
      },
    ],
    actions: (answers) => {
      // Prompt validation is skipped when the name comes from the command line.
      const valid = validateName(answers.name);
      if (valid !== true) {
        throw new Error(valid);
      }

      return [
        ...MODULE_FILES.map((file) => ({
          type: 'add',
          path: targetPath(file),
          templateFile: `plop-templates/module/${file}.hbs`,
        })),

        // Register the module in the composition root, next to the existing modules.
        {
          type: 'modify',
          path: APP_FILE,
          pattern: /(import \{ create\w+Module[^\n]*\n)(?![\s\S]*import \{ create\w+Module)/,
          template:
            "$1import { create{{pascalCase name}}Module } from '@modules/{{kebabCase name}}';\n",
        },
        {
          type: 'modify',
          path: APP_FILE,
          pattern: /(\n\n {2}const app = express\(\);)/,
          template:
            '\n  const {{camelCase name}} = create{{pascalCase name}}Module({ eventBus });$1',
        },
        {
          type: 'modify',
          path: APP_FILE,
          pattern: /(\n\n {2}app\.use\(notFound\(\)\);)/,
          template: "\n  app.use('/{{kebabCase name}}', {{camelCase name}}.router);$1",
        },
        { type: 'verifyRegistration' },
        { type: 'format', files: [...MODULE_FILES.map(targetPath), APP_FILE] },
      ];
    },
  });
}
