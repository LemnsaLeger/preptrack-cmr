import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Emits /sw.js with the exact list of built files so the app shell is cached on first visit.
function serviceWorkerPlugin() {
  const walk = (dir, base = '') =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p, `${base}${f}/`) : [`${base}${f}`];
    });
  return {
    name: 'preptrack-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'sw.js');
      const publicFiles = walk('public').filter((f) => f !== 'sw.js');
      const urls = ['/', ...new Set([...built, ...publicFiles])].map((f) => (f === '/' ? f : `/${f}`));
      const id = createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 10);
      const source = readFileSync('sw.template.js', 'utf8')
        .replace('self.__PRECACHE__', JSON.stringify(urls))
        .replace('self.__BUILD_ID__', JSON.stringify(id));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  test: { environment: 'node', setupFiles: ['./src/test-setup.js'] },
});
