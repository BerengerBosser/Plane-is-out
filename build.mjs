// Construit un fichier HTML unique et autonome : dist/plane-is-out.html
// Usage : node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/index.html', 'utf8');
const css = readFileSync('src/style.css', 'utf8');

const out = html
  .replace('/*__STYLE__*/', () => css)
  .replace('/*__SCRIPT__*/', () => js);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/plane-is-out.html', out);
console.log(`dist/plane-is-out.html — ${(out.length / 1024).toFixed(0)} Ko`);

// Variante « page publiée » : sans doctype/html/head/body (ajoutés à la publication)
const head = out.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta[^>]*>\s*/g, '');
const body = out.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync('dist/plane-is-out-page.html', head.trim() + '\n' + body.trim() + '\n');
console.log('dist/plane-is-out-page.html');
