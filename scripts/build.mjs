import * as esbuild from 'esbuild';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

// Production assets get content-hashed names (main-AB12CD.js, styles-EF34.css) so a phone never keeps
// running an old version from its browser cache; index.html and sw.js are always re-checked.
const dev = process.argv.includes('--serve');
rmSync('public', { recursive: true, force: true });
mkdirSync('public/assets', { recursive: true });
cpSync('web/manifest.webmanifest', 'public/manifest.webmanifest');
cpSync('web/icons', 'public/icons', { recursive: true });
writeFileSync('public/robots.txt', 'User-agent: *\nDisallow: /\n');

const opts = { define: { __DEV__: String(dev) }, entryPoints: ['web/src/main.js'], bundle: true, format: 'esm', minify: true,
  sourcemap: true, outdir: 'public/assets', target: 'es2020' };

function writeShell(js, css) {
  writeFileSync('public/index.html', readFileSync('web/index.html', 'utf8')
    .replace('/assets/styles.css', `/assets/${css}`).replace('/assets/main.js', `/assets/${js}`));
  writeFileSync('public/sw.js', readFileSync('web/sw.js', 'utf8')
    .replace('__BUILD_VERSION__', createHash('sha1').update(js + css).digest('hex').slice(0, 10))
    .replace("'/assets/main.js', '/assets/styles.css'", `'/assets/${js}', '/assets/${css}'`));
}

if (dev) {
  mkdirSync('public/dev', { recursive: true }); cpSync('data/catalog.json', 'public/dev/catalog.json');
  cpSync('data/text', 'public/dev/text', { recursive: true }); cpSync('data/scans', 'public/dev/scans', { recursive: true });
  cpSync('data/pdf', 'public/dev/pdf', { recursive: true });
  cpSync('web/styles.css', 'public/assets/styles.css');
  writeShell('main.js', 'styles.css');
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'public', port: 5173 });
  console.log(`http://localhost:${port}`);
} else {
  const css = readFileSync('web/styles.css');
  const cssName = `styles-${createHash('sha1').update(css).digest('hex').slice(0, 8)}.css`;
  writeFileSync(`public/assets/${cssName}`, css);
  const result = await esbuild.build({ ...opts, entryNames: '[name]-[hash]', metafile: true });
  const js = Object.keys(result.metafile.outputs).find((f) => f.endsWith('.js')).split('/').pop();
  writeShell(js, cssName);
  console.log(`built public/ (${js}, ${cssName})`);
}
