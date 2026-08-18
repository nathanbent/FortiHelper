import { describe, expect, it } from 'vitest';

declare const process: {
  getBuiltinModule(name: 'node:fs'): { readFileSync(path: URL, encoding: 'utf-8'): string };
};
const fs = process.getBuiltinModule('node:fs');

const read = (rel: string) => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf-8');

/**
 * The repo name lives in exactly one place so that publishing under a
 * different name is a one-line change (see SPLIT.md). These guard that it
 * stays that way — a hardcoded name here is a blank-page deploy later.
 */
describe('the repo name has a single source', () => {
  const pkg = JSON.parse(read('package.json')) as { repository?: { url?: string } };

  it('package.json declares the repository', () => {
    expect(pkg.repository?.url).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/);
  });

  it('vite derives the base path rather than hardcoding it', () => {
    const config = read('vite.config.ts');
    expect(config).toContain('base: `/${repoName}/`');
    expect(config, 'vite.config.ts hardcodes a repo name').not.toMatch(/base:\s*['"]\//);
  });

  it('the app takes its Source link from the injected constant', () => {
    const main = read('src/main.ts');
    expect(main).toContain('__REPO_URL__');
    expect(main, 'src/main.ts hardcodes a github URL').not.toMatch(
      /https:\/\/github\.com\/[^`$]/,
    );
  });
});
