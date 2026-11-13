import { ARCHETYPES, archetype, develop, describe } from './genome.js';
import { drawPortrait } from './cellart.js';

const grid = document.getElementById('grid');
const only = new URLSearchParams(location.search).get('only');
if (only !== null) { document.body.classList.add('single'); }
const items = ARCHETYPES.map((name, i) => [name, i]).filter(([, i]) => only === null || +only === i).map(([name, i]) => {
  const P = develop(archetype(name));
  const fig = document.createElement('figure');
  const cv = document.createElement('canvas');
  cv.width = only !== null ? 1400 : 840; cv.height = only !== null ? 1000 : 660;
  const cap = document.createElement('figcaption');
  cap.innerHTML = `${name}<small>${describe(P)}</small>`;
  fig.append(cv, cap); grid.append(fig);
  return { P, cv, ctx: cv.getContext('2d'), seed: 11 + i * 7 };
});
const q = new URLSearchParams(location.search);
const labels = q.get('labels') !== '0';
function frame(ms) {
  const t = (q.has('t') ? +q.get('t') : ms / 1000);
  for (const it of items) drawPortrait(it.ctx, it.cv.width, it.cv.height, it.P, { t, seed: it.seed, fv: 2, beat: 1 }, { labels });
  if (!q.has('t')) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
