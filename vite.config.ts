import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * The repo name is written down once, in package.json's `repository` field,
 * and everything that needs it derives from there: the Pages base path below
 * and the Source link in the footer.
 *
 * Publishing this app under a different repo name is therefore a one-line
 * change — see SPLIT.md. Getting the base path wrong serves a blank page with
 * nothing in the console explaining why, so it is worth not hand-editing.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const repoUrl: string = pkg.repository.url.replace(/\.git$/, '');
const repoName = repoUrl.split('/').pop();

export default defineConfig({
  // Served from https://<user>.github.io/<repo>/
  base: `/${repoName}/`,
  define: {
    __REPO_URL__: JSON.stringify(repoUrl),
  },
});
