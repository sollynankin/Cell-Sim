import { Sim, U } from './sim.js';
import { ARCHETYPES, archetype, describe, clamp, mulberry32 } from './genome.js';
import { drawCell, drawPortrait } from './cellart.js';
import { partsOf, GENE_INFO } from './info.js';
import { makeChart } from './charts.js';

const $ = (id) => document.getElementById(id);
const sim = new Sim({ seed: (Math.random() * 1e9) | 0, mode: 'mixed' });
window.__sim = sim;
window.__ui = { get cam() { return cam; }, select: (c) => select(c), zoomTo: (c) => zoomTo(c) };

// ---------------------------------------------------------------- camera
const cv = $('world'), ctx = cv.getContext('2d');
const cam = { x: sim.W / 2, y: sim.H / 2, z: 0.6, follow: false };
let dpr = Math.min(2, window.devicePixelRatio || 1), selected = null, paused = false;
function resize() {
  const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize); resize();
function fitAll() { const r = cv.getBoundingClientRect(); cam.z = Math.min(r.width / sim.W, r.height / sim.H) * 0.98; cam.x = sim.W / 2; cam.y = sim.H / 2; cam.follow = false; }
fitAll();
const toWorld = (sx, sy) => { const r = cv.getBoundingClientRect(); return [cam.x + (sx - r.left - r.width / 2) / cam.z, cam.y + (sy - r.top - r.height / 2) / cam.z]; };

let drag = null;
cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }; cv.setPointerCapture(e.pointerId); cv.classList.add('drag'); });
cv.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; cam.follow = false; }
  if (drag.moved) { cam.x = drag.cx - dx / cam.z; cam.y = drag.cy - dy / cam.z; }
});
cv.addEventListener('pointerup', (e) => {
  cv.classList.remove('drag');
  if (drag && !drag.moved) pick(e.clientX, e.clientY);
  drag = null;
});
cv.addEventListener('dblclick', (e) => { pick(e.clientX, e.clientY); if (selected) zoomTo(selected); });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const [wx, wy] = toWorld(e.clientX, e.clientY), f = Math.exp(-e.deltaY * 0.0015);
  cam.z = clamp(cam.z * f, 0.25, 20);
  const r = cv.getBoundingClientRect();
  cam.x = wx - (e.clientX - r.left - r.width / 2) / cam.z; cam.y = wy - (e.clientY - r.top - r.height / 2) / cam.z;
}, { passive: false });

function pick(sx, sy) {
  const [wx, wy] = toWorld(sx, sy); let best = null, bd = 1e9;
  for (const c of sim.cells) {
    const d = Math.hypot(c.x - wx, c.y - wy) - c.P.a * c.sc * U;
    if (d < bd) { bd = d; best = c; }
  }
  if (best && bd < 14 / cam.z) select(best);
}
function zoomTo(c) { cam.follow = true; cam.z = clamp(150 / (c.P.a * c.sc * U), 1, 20); cam.x = c.x; cam.y = c.y; }
function select(c) { selected = c; renderStatic(); }
$('follow').onclick = () => { if (selected && selected.alive) zoomTo(selected); };
$('fit').onclick = fitAll;

// ---------------------------------------------------------------- controls
for (const k of ['light', 'nutrient', 'hypo', 'mutation']) {
  const el = $(k), out = $('v-' + k);
  const upd = () => { sim.params[k] = +el.value; out.textContent = (+el.value).toFixed(k === 'mutation' ? 3 : 2); };
  el.oninput = upd; upd();
}
const speed = $('speed'); speed.oninput = () => { $('v-speed').textContent = speed.value + 'x'; }; speed.oninput();
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; };
$('reset').onclick = () => { sim.seed = (Math.random() * 1e9) | 0; sim.reset($('mode').value); selected = null; renderStatic(); };
const inoc = $('inoc'); ARCHETYPES.forEach((n) => { const o = document.createElement('option'); o.textContent = n; inoc.append(o); });
$('add').onclick = () => {
  for (let i = 0; i < 12; i++) sim.spawn(archetype(inoc.value), null, clamp(cam.x + (Math.random() - 0.5) * 200, 20, sim.W - 20), clamp(cam.y + (Math.random() - 0.5) * 200, 20, sim.H - 20));
};
let eventTimer = 0, savedLight = 1, savedMut = 0;
$('dark').onclick = () => { savedLight = sim.params.light; sim.params.light = 0; $('light').value = 0; $('v-light').textContent = '0.00'; eventTimer = Math.max(eventTimer, 1500); sim._restore = () => { sim.params.light = savedLight; $('light').value = savedLight; $('v-light').textContent = savedLight.toFixed(2); }; };
$('crash').onclick = () => sim.nut.fill(0.02);
$('mutagen').onclick = () => { savedMut = sim.params.mutation; sim.params.mutation = Math.min(0.25, savedMut * 8 + 0.05); $('mutation').value = sim.params.mutation; eventTimer = 800; sim._restore = () => { sim.params.mutation = savedMut; $('mutation').value = savedMut; $('v-mutation').textContent = savedMut.toFixed(3); }; };

// ---------------------------------------------------------------- ambience (cosmetic only)
const rngA = mulberry32(77);
const snow = Array.from({ length: 140 }, () => ({ x: rngA() * sim.W, y: rngA() * sim.H, r: 0.8 + rngA() * 1.6, s: 0.05 + rngA() * 0.12, ph: rngA() * 6.28 }));
const bubbles = [];
function makeCaustics() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.filter = 'blur(1.6px)'; x.strokeStyle = 'rgba(200,255,245,0.8)'; x.lineWidth = 1.5;
  const r = mulberry32(5);
  for (let i = 0; i < 70; i++) {
    const cx = r() * 256, cy = r() * 256, rad = 18 + r() * 40;
    for (let k = 0; k < 2; k++) {
      x.beginPath(); const a0 = r() * 6.28;
      for (let t = 0; t <= 10; t++) { const a = a0 + t * 0.55, rr = rad * (0.6 + 0.4 * Math.sin(t * 1.3 + k)); const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr * 0.6; for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { /* wrap */ } t ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
  }
  return c;
}
const causticTile = makeCaustics();
let causticPat = null;
let lastFrameT = 0;

// ---------------------------------------------------------------- rendering
const nutCv = document.createElement('canvas'); nutCv.width = sim.gw; nutCv.height = sim.gh;
const nutCtx = nutCv.getContext('2d'), nutImg = nutCtx.createImageData(sim.gw, sim.gh);
let tNow = 0;

function drawWorld(dt) {
  const W = cv.width, H = cv.height, z = cam.z * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#031017'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
  const light = Math.min(1.5, sim.params.light);
  // water column: bright teal at the surface down to near-black at the vents
  const bg = ctx.createLinearGradient(0, 0, 0, sim.H); bg.addColorStop(0, '#12707a'); bg.addColorStop(0.35, '#0b4d5a'); bg.addColorStop(0.7, '#073040'); bg.addColorStop(1, '#030f16');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, sim.W, sim.H);
  // caustics: two drifting copies of one pattern, strongest near the surface
  if (!causticPat) causticPat = ctx.createPattern(causticTile, 'repeat');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const bands = [[0, 0.2, 0.16], [0.2, 0.4, 0.09], [0.4, 0.62, 0.04]];
  for (const [y0, y1, a] of bands) {
    for (const [sc, vx, vy] of [[2.4, 9, 4], [3.6, -7, 3]]) {
      causticPat.setTransform(new DOMMatrix().translate(tNow * vx, tNow * vy).scale(sc));
      ctx.globalAlpha = a * light; ctx.fillStyle = causticPat; ctx.fillRect(0, sim.H * y0, sim.W, sim.H * (y1 - y0));
    }
  }
  // soft light shafts
  for (let i = 0; i < 6; i++) {
    const x0 = (i + 0.5) * sim.W / 6 + Math.sin(tNow * 0.15 + i * 1.7) * 60, w = 70 + 30 * Math.sin(i * 2.1 + tNow * 0.2), lean = 160 + 40 * Math.sin(tNow * 0.1 + i);
    const g = ctx.createLinearGradient(0, 0, 0, sim.H * 0.75); g.addColorStop(0, `rgba(190,255,240,${0.12 * light})`); g.addColorStop(1, 'rgba(190,255,240,0)');
    ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - w / 2, 0); ctx.lineTo(x0 + w / 2, 0); ctx.lineTo(x0 + w / 2 + lean, sim.H * 0.75); ctx.lineTo(x0 - w / 2 + lean, sim.H * 0.75); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // dissolved nutrients as a warm haze
  const d = nutImg.data;
  for (let i = 0; i < sim.nut.length; i++) { const v = Math.min(1, sim.nut[i]); d[i * 4] = 235; d[i * 4 + 1] = 175; d[i * 4 + 2] = 80; d[i * 4 + 3] = v * 80; }
  nutCtx.putImageData(nutImg, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(nutCv, 0, 0, sim.W, sim.H);
  // vents with rising bubbles
  for (const v of sim.vents) {
    const rg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 90); rg.addColorStop(0, 'rgba(255,170,80,0.6)'); rg.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = rg; ctx.fillRect(v.x - 90, v.y - 90, 180, 180);
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.moveTo(v.x - 26, sim.H); ctx.lineTo(v.x - 9, v.y + 4); ctx.lineTo(v.x + 9, v.y + 4); ctx.lineTo(v.x + 26, sim.H); ctx.closePath(); ctx.fill();
    if (!paused && Math.random() < 0.25 * sim.params.nutrient) bubbles.push({ x: v.x + (Math.random() - 0.5) * 12, y: v.y, r: 1 + Math.random() * 2.4, vy: 0.6 + Math.random() * 0.8, ph: Math.random() * 6 });
  }
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; if (!paused) { b.y -= b.vy * dt * 60; b.x += Math.sin(tNow * 2 + b.ph) * 0.3; b.r += 0.002 * dt * 60; }
    if (b.y < sim.H * 0.3) { bubbles.splice(i, 1); continue; }
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.28); ctx.strokeStyle = 'rgba(255,230,190,0.45)'; ctx.lineWidth = 0.8 / z * dpr; ctx.stroke();
  }
  // marine snow
  ctx.fillStyle = 'rgba(220,240,240,0.28)';
  for (const p of snow) {
    if (!paused) { p.y += p.s * dt * 60; p.x += Math.sin(tNow * 0.4 + p.ph) * 0.1; if (p.y > sim.H) { p.y = 0; p.x = Math.random() * sim.W; } }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,200,210,0.35)'; ctx.lineWidth = 2 / z; ctx.strokeRect(0, 0, sim.W, sim.H);

  const vx0 = cam.x - W / 2 / z - 80, vx1 = cam.x + W / 2 / z + 80, vy0 = cam.y - H / 2 / z - 80, vy1 = cam.y + H / 2 / z + 80;
  for (const c of sim.cells) {
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    const P = c.P, half = P.a * c.sc * U * z;
    const lod = half < 3.5 ? 0 : half < 9 ? 1 : half < 28 ? 2 : 3;
    ctx.save(); ctx.translate(c.x, c.y);
    if (half > 5) {                                           // soft halo so cells read against the water
      const R = Math.max(P.a, P.b) * c.sc * U * 1.9, hg = ctx.createRadialGradient(0, 0, R * 0.25, 0, 0, R);
      hg.addColorStop(0, `hsla(${P.hue * 360},70%,75%,0.22)`); hg.addColorStop(1, `hsla(${P.hue * 360},70%,75%,0)`);
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.28); ctx.fill();
    }
    ctx.rotate(c.ang);
    const u = U * c.sc;
    ctx.scale(u, u);
    drawCell(ctx, P, { t: tNow + c.id * 0.37, seed: c.id, fv: c.fv, div: c.divT > 0 ? Math.min(1, c.divT / 70) : 0, beat: c.beat ?? 1 }, u * z, { lod });
    ctx.restore();
    if (c === selected) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 4 / z]); ctx.lineDashOffset = -tNow * 12 / z;
      ctx.beginPath(); ctx.arc(0, 0, Math.max(P.a, P.b) * c.sc * U * 1.15 + 6 / z, 0, 6.28); ctx.stroke(); ctx.restore();
    }
  }
  // vignette (screen space)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,8,12,0.5)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (selected && selected.alive) {                              // tag next to the selected cell
    const sx = (selected.x - cam.x) * z + W / 2, sy = (selected.y - cam.y) * z + H / 2 - (Math.max(selected.P.a, selected.P.b) * selected.sc * U * 1.15 + 14) * z;
    const txt = `#${selected.id}  gen ${selected.gen}`; ctx.font = `${12 * dpr}px system-ui`; const tw = ctx.measureText(txt).width + 12 * dpr;
    ctx.fillStyle = 'rgba(8,18,24,0.8)'; ctx.beginPath(); ctx.roundRect(sx - tw / 2, sy - 16 * dpr, tw, 18 * dpr, 5 * dpr); ctx.fill();
    ctx.fillStyle = '#ffe27a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, sx, sy - 7 * dpr);
  }
}

// ---------------------------------------------------------------- inspector
const pctx = $('portrait').getContext('2d');
function renderStatic() {
  const c = selected;
  if (!c) { $('parts').innerHTML = '<div class="hint">Select a cell to see what each part is for.</div>'; $('genes').innerHTML = ''; $('desc').textContent = 'Click a cell in the pool.'; $('muts').textContent = ''; return; }
  $('desc').textContent = describe(c.P).replace(/^./, (m) => m.toUpperCase());
  const maxv = Math.max(1, ...c.g.map((q) => q.v * q.x));
  $('genes').innerHTML = [...c.g].sort((a, b) => a.k.localeCompare(b.k) || b.v - a.v).map((q) => `<div class="gene" data-k="${q.k}" title="${GENE_INFO[q.k] || ''}"><span>${q.k}</span><i style="width:${Math.min(100, (q.v * q.x / maxv) * 100)}%"></i><span>${q.v.toFixed(2)} × ${q.x.toFixed(2)}</span></div>`).join('');
  $('genes').querySelectorAll('.gene').forEach((el) => { el.onmouseenter = () => { $('geneinfo').textContent = el.dataset.k + ': ' + (GENE_INFO[el.dataset.k] || ''); }; });
  $('muts').textContent = c.muts.length ? 'Mutations at its birth: ' + c.muts.map((m) => `${m.type} (${m.kind})`).join(', ') : 'No mutations at its birth.';
  const parts = partsOf(c.P);
  $('parts').innerHTML = parts.map((p) => `<div class="part"><div class="pn"><i style="background:${p.color}"></i>${p.name}<em>${p.level}</em></div><p>${p.what}</p><p class="cost">${p.cost}</p></div>`).join('') || '<div class="hint">A very simple cell with no specialised structures.</div>';
}
let lastInspect = 0;
function drawInspector() {
  const c = selected;
  if (!c) { pctx.fillStyle = '#fbfaf6'; pctx.fillRect(0, 0, 840, 640); pctx.fillStyle = '#999'; pctx.font = '22px Georgia'; pctx.textAlign = 'center'; pctx.fillText('Click a cell to see its structure', 420, 320); return; }
  drawPortrait(pctx, 840, 640, c.P, { t: tNow, seed: c.id, fv: c.fv, div: c.divT > 0 ? Math.min(1, c.divT / 70) : 0, beat: c.beat ?? 1 }, {});
  if (performance.now() - lastInspect > 400) {
    lastInspect = performance.now();
    const rows = [['Cell', '#' + c.id + (c.alive ? '' : ' (gone: ' + c.cause + ')')], ['Generation', c.gen], ['Parent', c.parent ? '#' + c.parent : 'founder'], ['Founder line', '#' + c.lin], ['Age', c.age + ' ticks'], ['Offspring', c.kids], ['Prey eaten', c.kills],
      ['Size', (c.sc * 100).toFixed(0) + '% of newborn'], ['Speed', (c.thrust > 0.05 ? c.thrust / c.drag : 0).toFixed(2) + ' px/tick'], ['Genes', c.P.genes]];
    $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    const gain = (c.lastGain || 0) * 1000, cost = (c.lastCost || 0) * 1000, mx = Math.max(gain, cost, 1) * 1.2;
    $('energy').innerHTML = `<div class="kv"><span>Income</span><span>${gain.toFixed(1)}</span></div><div class="bar"><i style="width:${gain / mx * 100}%;background:#7bdc65"></i></div>
      <div class="kv"><span>Upkeep + movement</span><span>${cost.toFixed(1)}</span></div><div class="bar"><i style="width:${cost / mx * 100}%;background:#ff7a66"></i></div>
      <div class="kv"><span>Net per tick</span><span style="color:${gain >= cost ? '#7bdc65' : '#ff7a66'}">${(gain - cost >= 0 ? '+' : '') + (gain - cost).toFixed(1)}</span></div>
      <div class="kv"><span>Stored energy</span><span>${(c.energy / c.B * 100).toFixed(0)}% of biomass</span></div><div class="bar"><i style="width:${clamp(c.energy / c.B, 0, 1) * 100}%;background:#5fd6c8"></i></div>
      <div class="kv"><span>Growth to division</span><span>${clamp((c.B / c.B0 - 1) * 100, 0, 100).toFixed(0)}%</span></div><div class="bar"><i style="width:${clamp(c.B / c.B0 - 1, 0, 1) * 100}%;background:#ffb454"></i></div>`;
  }
}

// ---------------------------------------------------------------- charts
const FEATURES = [['euk', 'eukaryote', '#c084fc'], ['photo', 'photosynthetic', '#7bdc65'], ['flag', 'flagellated', '#5fd6c8'], ['cilia', 'ciliated', '#60a5fa'], ['wall', 'walled', '#ffb454'], ['mouth', 'predator', '#ff6b57'], ['amoeba', 'amoeboid', '#f0abfc']];
const ser = (arr) => arr.map(([key, label, color, scale]) => ({ key, label, color, scale, on: true }));
const charts = [];
function addChart(id, legId, cfg, series) {
  cfg.series = ser(series); cfg.canvas = $(id); cfg.getData = () => sim.hist;
  const ch = makeChart(cfg); charts.push(ch);
  $(legId).innerHTML = cfg.series.map((s, i) => `<label data-i="${i}"><input type="checkbox" checked hidden><i style="background:${s.color}"></i>${s.label}</label>`).join('');
  $(legId).querySelectorAll('label').forEach((el) => { el.onclick = (e) => { e.preventDefault(); const s = cfg.series[+el.dataset.i]; s.on = !s.on; el.classList.toggle('off', !s.on); ch.draw(); }; });
}
addChart('chart-features', 'leg-features', { percent: true, auto: () => $('ch-auto').checked, smooth: () => +$('ch-smooth').value }, FEATURES);
addChart('chart-pop', 'leg-pop', { stacked: () => $('ch-fill').checked, floor0: true, smooth: () => 3, fmt: (v) => Math.round(v) }, [['n', 'cells', '#5fd6c8']]);
addChart('chart-demo', 'leg-demo', { floor0: true, smooth: () => 3, fmt: (v) => Math.round(v) }, [['births', 'births', '#7bdc65'], ['starved', 'starved', '#ff7a66'], ['eaten', 'eaten', '#f43f5e'], ['lysed', 'burst', '#fbbf24']]);
addChart('chart-energy', 'leg-energy', { stacked: true, percent: true, smooth: () => 5 }, [['srcLight', 'light', '#fde047'], ['srcNut', 'dissolved nutrients', '#fb923c'], ['srcPrey', 'eating other cells', '#f43f5e']]);
addChart('chart-div', 'leg-div', { floor0: true, smooth: () => 5, fmt: (v) => +v.toFixed(1) }, [['diversity', 'effective body plans', '#c084fc'], ['plans', 'distinct body plans', '#60a5fa']]);
addChart('chart-traits', 'leg-traits', { floor0: true, smooth: () => 5, fmt: (v) => +v.toFixed(1) }, [['size', 'average size ×10', '#5fd6c8', 10], ['genes', 'genes per cell', '#ffb454']]);
$('ch-auto').onchange = $('ch-smooth').onchange = $('ch-fill').onchange = () => charts.forEach((c) => c.draw());

// ---------------------------------------------------------------- census, tiles, records
function tile(label, value, sub = '') { const long = String(value).length > 9; return `<div class="tile"${long ? ' style="grid-column:span 2"' : ''}><small>${label}</small><b${long ? ' style="font-size:14px"' : ''}>${value}</b>${sub ? `<em>${sub}</em>` : ''}</div>`; }
const kfmt = (v) => (v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v));
function census() {
  const tally = new Map();
  for (const c of sim.cells) { const k = describe(c.P); let e = tally.get(k); if (!e) tally.set(k, (e = { n: 0, rep: c })); e.n++; if (c.B > e.rep.B) e.rep = c; }
  const list = [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 9), total = sim.cells.length || 1;
  $('plans').innerHTML = list.map(([k, e]) => `<div class="plan"><span>${k}</span><b>${e.n} <span style="color:var(--dim);font-weight:400">(${Math.round(e.n / total * 100)}%)</span></b></div>`).join('');
  [...$('plans').children].forEach((el, i) => { el.onclick = () => { select(list[i][1].rep); zoomTo(list[i][1].rep); }; });
  const h = sim.hist[sim.hist.length - 1] || {};
  $('c-n').textContent = sim.cells.length; $('c-t').textContent = sim.tick; $('c-euk').textContent = ((h.euk || 0) * 100).toFixed(0) + '%';
  $('c-photo').textContent = ((h.photo || 0) * 100).toFixed(0) + '%'; $('c-mouth').textContent = ((h.mouth || 0) * 100).toFixed(0) + '%';
  const mut = Object.values(sim.mutCounts).reduce((a, b) => a + b, 0), dead = Object.values(sim.deaths).reduce((a, b) => a + b, 0);
  $('c-mut').textContent = kfmt(mut); $('c-dead').textContent = kfmt(dead);
  const pct = (x) => Math.round((x || 0) * 100) + '%';
  $('tiles').innerHTML = [
    tile('Cells', sim.cells.length, 'of ' + sim.params.maxPop), tile('Biomass', kfmt(h.biomass || 0)), tile('Energy reserve', pct(h.energyFrac), 'of biomass'),
    tile('Effective plans', (h.diversity || 0).toFixed(1), 'of ' + (h.plans || 0)), tile('Newest lineage depth', h.maxGen || 0, 'generations'), tile('Average age', kfmt(h.meanAge || 0), 'ticks'),
    tile('Births', Math.round((h.births || 0) * 1000 / 30), 'per 1k ticks'), tile('Deaths', Math.round(((h.starved || 0) + (h.eaten || 0) + (h.lysed || 0)) * 1000 / 30), 'per 1k ticks'),
    tile('Nutrients', pct(h.nutrient), 'avg level'), tile('Swimming speed', (h.speed || 0).toFixed(2), 'px/tick'), tile('Mutation rate', ((h.mutRate || 0) * 100).toFixed(1) + '%', 'per gene/birth'),
    tile('Energy mix', `${pct(h.srcLight)} light · ${pct(h.srcNut)} food · ${pct(h.srcPrey)} prey`), tile('Births total', kfmt(sim.totalBirths)),
  ].join('');
  const m = sim.mutCounts; $('mutline').textContent = `Mutations so far: ${m.point} point, ${m.regulatory} regulatory, ${m.duplication} duplications, ${m.deletion} deletions, ${m.insertion} new genes.   Deaths: ${sim.deaths.starved} starved, ${sim.deaths.eaten} eaten, ${sim.deaths.lysed} burst.`;
  const best = (fn) => sim.cells.reduce((a, c) => (!a || fn(c) > fn(a) ? c : a), null);
  const recs = [['Largest', best((c) => c.area * c.sc * c.sc), (c) => (c.area * c.sc * c.sc).toFixed(1) + ' u²'], ['Oldest', best((c) => c.age), (c) => kfmt(c.age) + ' ticks'], ['Most offspring', best((c) => c.kids), (c) => c.kids],
    ['Top predator', best((c) => c.kills), (c) => c.kills + ' eaten'], ['Most evolved', best((c) => c.gen), (c) => 'gen ' + c.gen], ['Most genes', best((c) => c.P.genes), (c) => c.P.genes + ' genes']];
  $('records').innerHTML = recs.filter((r) => r[1]).map(([n, c, f]) => `<div class="rec"><span>${n}</span><span>#${c.id} · ${f(c)}</span></div>`).join('');
  [...$('records').children].forEach((el, i) => { const c = recs.filter((r) => r[1])[i][1]; el.onclick = () => { select(c); zoomTo(c); }; });
  charts.forEach((c) => c.draw());
}

// ---------------------------------------------------------------- main loop
let lastCensus = 0, autoPicked = false;
function frame(ms) {
  const dt = Math.min(0.1, (ms - lastFrameT) / 1000 || 0.016); lastFrameT = ms; tNow = ms / 1000;
  if (!paused) {
    const n = +speed.value;
    for (let i = 0; i < n; i++) sim.step();
    if (eventTimer > 0) { eventTimer -= n; if (eventTimer <= 0 && sim._restore) { sim._restore(); sim._restore = null; } }
  }
  if (cam.follow && selected && selected.alive) { cam.x += (selected.x - cam.x) * 0.2; cam.y += (selected.y - cam.y) * 0.2; }
  if (!autoPicked && sim.tick > 3) {
    autoPicked = true;
    const big = [...sim.cells].filter((c) => c.P.euk).sort((a, b) => b.area - a.area)[0] || sim.cells[0];
    if (big) select(big);
  }
  const p0 = performance.now(); drawWorld(dt); const p1 = performance.now(); drawInspector(); const p2 = performance.now();
  window.__perf = { world: p1 - p0, insp: p2 - p1 };
  if (ms - lastCensus > 700) { lastCensus = ms; census(); }
  requestAnimationFrame(frame);
}
renderStatic();
requestAnimationFrame(frame);
