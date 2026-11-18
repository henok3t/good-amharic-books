import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('public', { recursive: true, force: true });
mkdirSync('public/assets', { recursive: true });
cpSync('web/index.html', 'public/index.html');
cpSync('web/styles.css', 'public/assets/styles.css');
cpSync('web/manifest.webmanifest', 'public/manifest.webmanifest');
cpSync('web/icons', 'public/icons', { recursive: true });
writeFileSync('public/sw.js', readFileSync('web/sw.js', 'utf8').replace('__BUILD_VERSION__', Date.now().toString(36)));
writeFileSync('public/robots.txt', 'User-agent: *\nDisallow: /\n');
const dev = process.argv.includes('--serve');
if (dev) {
  mkdirSync('public/dev', { recursive: true }); cpSync('data/catalog.json', 'public/dev/catalog.json');
  cpSync('data/text', 'public/dev/text', { recursive: true }); cpSync('data/scans', 'public/dev/scans', { recursive: true });
}
const opts = { define: { __DEV__: String(dev) }, entryPoints: ['web/src/main.js'], bundle: true, format: 'esm', minify: true, sourcemap: true, outdir: 'public/assets', target: 'es2020' };
if (dev) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'public', port: 5173 });
  console.log(`http://localhost:${port}`);
} else {
  await esbuild.build(opts);
  console.log('built public/');
}
