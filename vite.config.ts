import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import { buildReferenceExport, buildTemplatesExport } from './src/lib/export';

/**
 * The repo name is written down once, in package.json's `repository` field,
 * and everything that needs it derives from there: the Pages base path below
 * and the Source link in the footer.
 *
 * Publishing this app under a different repo name is therefore a one-line
 * change; see SPLIT.md. Getting the base path wrong serves a blank page with
 * nothing in the console explaining why, so it is worth not hand-editing.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const repoUrl: string = pkg.repository.url.replace(/\.git$/, '');
const repoName = repoUrl.split('/').pop();

/**
 * Build details for the About page, read from git. Both come back empty when
 * there is no checkout to ask (a source tarball), and the page leaves the rows
 * out. The commit date is used rather than the wall clock so the same commit
 * always builds the same page.
 */
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Markdown files directly inside a content directory, keyed by filename. */
function readMarkdown(dir: string): Record<string, string> {
  const root = new URL(`./content/${dir}/`, import.meta.url);
  // Not recursive on purpose: content/quickstart/private/ must never be read.
  return Object.fromEntries(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => [entry.name, readFileSync(new URL(entry.name, root), 'utf-8')]),
  );
}

/** The JSON files published next to the site; see src/lib/export.ts. */
function contentFiles(): Record<string, string> {
  const catalogue = readFileSync(new URL('./content/reference-variables.md', import.meta.url), 'utf-8');
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  return {
    'reference.json': json(buildReferenceExport(readMarkdown('reference'), catalogue)),
    'templates.json': json(buildTemplatesExport(readMarkdown('quickstart'))),
  };
}

/**
 * Writes reference.json and templates.json into the build, and serves them
 * from the dev server at the same paths, so other projects can reuse the
 * content without this app's markdown parsers.
 */
function contentExport(): Plugin {
  return {
    name: 'fortihelper-content-export',
    generateBundle() {
      for (const [fileName, source] of Object.entries(contentFiles())) {
        this.emitFile({ type: 'asset', fileName, source });
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(server.config.base, '');
        if (name !== 'reference.json' && name !== 'templates.json') return next();
        // Rebuilt per request, so an edited sheet shows up on reload.
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(contentFiles()[name]);
      });
    },
  };
}

export default defineConfig({
  plugins: [contentExport()],
  // Served from https://<user>.github.io/<repo>/
  base: `/${repoName}/`,
  define: {
    __REPO_URL__: JSON.stringify(repoUrl),
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_COMMIT__: JSON.stringify(git('rev-parse', 'HEAD')),
    __BUILD_DATE__: JSON.stringify(git('log', '-1', '--format=%cs')),
  },
});
