// Builds public/admin/report.js: the app's monthly report code for the admin page's browser.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));

// The app's stores import its phone storage; the report never loads or saves, so use a stub.
const stubStorage = {
  name: 'stub-storage',
  setup(b) {
    b.onResolve({ filter: /(^|\/)lib\/storage$/ }, () => ({ path: path.join(here, 'storage-stub.js') }));
  },
};

await build({
  entryPoints: [path.join(here, 'report-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2019',
  outfile: path.join(here, '..', 'public', 'admin', 'report.js'),
  plugins: [stubStorage],
  logLevel: 'info',
});
