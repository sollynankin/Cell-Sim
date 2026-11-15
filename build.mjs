// Assembles the static site into dist/ (what GitHub Pages serves). No bundler: the app is plain ES modules.
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';

const FILES = ['index.html', 'gallery.html', 'gallery.js', 'main.js', 'sim.js', 'genome.js', 'cellart.js', 'charts.js', 'dna.js', 'info.js', 'designer.js', 'favicon.svg'];
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
for (const f of FILES) {
  if (!existsSync(f)) throw new Error('missing ' + f);
  cpSync(f, 'dist/' + f);
}
writeFileSync('dist/.nojekyll', '');        // serve files as they are
console.log(`built dist/ with ${FILES.length} files`);
