// Construit deux fichiers HTML uniques et autonomes :
//   dist/plane-is-out.html  (le jeu)   et   dist/sound-studio.html  (le studio son, servi sur /studio)
// Usage : node build.mjs
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

async function bundle(entry, htmlFile, cssFile) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'iife',
    target: 'es2020',
    write: false,
    legalComments: 'none',
  });
  const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  return readFileSync(htmlFile, 'utf8')
    .replace('/*__STYLE__*/', () => readFileSync(cssFile, 'utf8'))
    .replace('/*__SCRIPT__*/', () => js);
}

mkdirSync('dist', { recursive: true });
const out = await bundle('src/main.js', 'src/index.html', 'src/style.css');
writeFileSync('dist/plane-is-out.html', out);
console.log(`dist/plane-is-out.html — ${(out.length / 1024).toFixed(0)} Ko`);

// Variante « page publiée » : sans doctype/html/head/body (ajoutés à la publication)
const head = out.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta[^>]*>\s*/g, '');
const body = out.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync('dist/plane-is-out-page.html', head.trim() + '\n' + body.trim() + '\n');
console.log('dist/plane-is-out-page.html');

const studio = await bundle('src/studio-main.js', 'src/studio.html', 'src/studio.css');
writeFileSync('dist/sound-studio.html', studio);
console.log(`dist/sound-studio.html — ${(studio.length / 1024).toFixed(0)} Ko`);
