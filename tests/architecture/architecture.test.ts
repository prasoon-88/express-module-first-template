/**
 * Proves that the architecture rules still catch what they are meant to catch.
 *
 * `fixtures/` is a miniature project that breaks every rule on purpose. This test runs the real
 * ESLint architecture config and the real dependency-cruiser config against it and compares the
 * reported violations with the expected list, exactly: a rule that stops firing fails the test,
 * and so does a rule that starts flagging allowed code.
 */
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { cruise } from 'dependency-cruiser';
import extractDepcruiseOptions from 'dependency-cruiser/config-utl/extract-depcruise-options';
import extractTSConfig from 'dependency-cruiser/config-utl/extract-ts-config';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { createArchitectureConfig } from '../../eslint.arch.config.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

const toPosix = (path: string) => path.replaceAll('\\', '/');

/** The module specifier on a source line: `import x from './y'` -> `./y`. */
function importSourceAt(file: string, line: number): string {
  const text = readFileSync(file, 'utf8').split('\n')[line - 1] ?? '';
  return /'([^']+)'/.exec(text)?.[1] ?? text.trim();
}

describe('architecture rules', () => {
  it('ESLint reports every deliberate violation in the fixtures, and nothing else', async () => {
    const eslint = new ESLint({
      cwd: FIXTURES,
      overrideConfigFile: true,
      overrideConfig: createArchitectureConfig(FIXTURES),
      // Same as `pnpm lint:arch`: an inline disable comment cannot silence an architecture rule.
      allowInlineConfig: false,
    });

    const results = await eslint.lintFiles(['src']);
    const reported = results.flatMap((result) =>
      result.messages.map((message) =>
        [
          toPosix(relative(FIXTURES, result.filePath)),
          message.ruleId,
          importSourceAt(result.filePath, message.line),
        ].join(' | '),
      ),
    );

    expect(reported.sort()).toEqual(
      [
        // Rule 1: dependency direction.
        'src/shared/lib/leaky.ts | boundaries/dependencies | @modules/billing',
        'src/config/index.ts | boundaries/dependencies | @shared/lib/leaky',
        'src/modules/invoices/invoices.routes.ts | boundaries/dependencies | @config/index',
        // Rule 2: no deep imports into another module.
        'src/modules/invoices/invoices.service.ts | boundaries/dependencies | @modules/billing/billing.service',
        // Rule 3: never another module's model.
        'src/modules/invoices/invoices.service.ts | boundaries/dependencies | ../billing/billing.model',
        // Rule 9: no parent-relative imports.
        'src/modules/invoices/invoices.service.ts | no-restricted-imports | ../billing/billing.model',
        // Rule 4: services do not import express; controllers do not import repositories or models.
        'src/modules/invoices/invoices.service.ts | no-restricted-imports | express',
        'src/modules/invoices/invoices.controller.ts | boundaries/dependencies | ./invoices.model',
        'src/modules/invoices/invoices.controller.ts | boundaries/dependencies | ./invoices.repository',
        // Database drivers only in repository adapters; services use the port, not an adapter.
        'src/modules/invoices/invoices.service.ts | no-restricted-imports | pg',
        'src/modules/invoices/invoices.service.ts | boundaries/dependencies | ./invoices.repository.memory',
        // index.ts: no `export *`, no model, no repository.
        'src/modules/invoices/index.ts | no-restricted-syntax | ./invoices.service',
        'src/modules/invoices/index.ts | no-restricted-syntax | ./invoices.model',
        'src/modules/invoices/index.ts | no-restricted-syntax | ./invoices.repository.memory',
      ].sort(),
    );
  });

  it('dependency-cruiser reports every deliberate violation in the fixtures, and nothing else', async () => {
    const options = await extractDepcruiseOptions(resolve(ROOT, '.dependency-cruiser.cjs'));
    const tsConfigFile = resolve(FIXTURES, 'tsconfig.json');

    const { output } = await cruise(
      ['src'],
      { ...options, baseDir: FIXTURES, tsConfig: { fileName: tsConfigFile } },
      {},
      { tsConfig: extractTSConfig(tsConfigFile) },
    );
    if (typeof output === 'string') {
      throw new TypeError('Expected the structured dependency-cruiser result');
    }
    const reported = output.summary.violations.map(
      ({ rule, from, to }) => `${rule.name} | ${from} -> ${to}`,
    );

    expect(reported.sort()).toEqual(
      [
        'no-circular | src/modules/billing/billing.service.ts -> src/modules/invoices/index.ts',
        'no-circular | src/modules/billing/index.ts -> src/modules/billing/billing.service.ts',
        'shared-is-below-modules | src/shared/lib/leaky.ts -> src/modules/billing/index.ts',
        'config-is-a-leaf | src/config/index.ts -> src/shared/lib/leaky.ts',
        'modules-do-not-reach-up | src/modules/invoices/invoices.routes.ts -> src/config/index.ts',
        'module-public-api-only | src/modules/invoices/invoices.service.ts -> src/modules/billing/billing.model.ts',
        'module-public-api-only | src/modules/invoices/invoices.service.ts -> src/modules/billing/billing.service.ts',
        'services-use-the-repository-port | src/modules/invoices/invoices.service.ts -> src/modules/invoices/invoices.repository.memory.ts',
        'db-drivers-only-in-repository-adapters | src/modules/invoices/invoices.service.ts -> pg',
      ].sort(),
    );
  });

  it('the real source tree has no architecture violation', async () => {
    const eslint = new ESLint({
      cwd: ROOT,
      overrideConfigFile: true,
      overrideConfig: createArchitectureConfig(ROOT),
      allowInlineConfig: false,
    });

    const results = await eslint.lintFiles(['src']);

    expect(results.flatMap((result) => result.messages)).toEqual([]);
  });
});
