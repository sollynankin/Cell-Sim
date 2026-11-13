import { Sim, U } from './sim.js';
import { ARCHETYPES, archetype, describe, clamp } from './genome.js';
import { drawCell, drawPortrait } from './cellart.js';

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
  if (best && bd < 14 / cam.z) select(best); else if (!best || bd >= 14 / cam.z) { /* keep current */ }
}
function zoomTo(c) { cam.follow = true; cam.z = clamp(150 / (c.P.a * c.sc * U), 1, 20); cam.x = c.x; cam.y = c.y; }
function select(c) { selected = c; updateInspectorStatic(); }
$('follow').onclick = () => { if (selected && selected.alive) zoomTo(selected); };
$('fit').onclick = fitAll;

// ---------------------------------------------------------------- controls
const sliders = ['light', 'nutrient', 'hypo', 'mutation'];
for (const k of sliders) {
  const el = $(k), out = $('v-' + k);
  const upd = () => { sim.params[k] = +el.value; out.textContent = (+el.value).toFixed(k === 'mutation' ? 3 : 2); };
  el.oninput = upd; upd();
}
const speed = $('speed'); speed.oninput = () => { $('v-speed').textContent = speed.value + 'x'; }; speed.oninput();
$('pause').onclick = () => { paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; };
$('reset').onclick = () => { sim.seed = (Math.random() * 1e9) | 0; sim.reset($('mode').value); selected = null; };
const inoc = $('inoc'); ARCHETYPES.forEach((n) => { const o = document.createElement('option'); o.textContent = n; inoc.append(o); });
$('add').onclick = () => {
  const [x, y] = [cam.x, cam.y];
  for (let i = 0; i < 12; i++) sim.spawn(archetype(inoc.value), null, clamp(x + (Math.random() - 0.5) * 200, 20, sim.W - 20), clamp(y + (Math.random() - 0.5) * 200, 20, sim.H - 20));
};
let eventTimer = 0, savedLight = 1, savedMut = 0;
$('dark').onclick = () => { savedLight = sim.params.light; sim.params.light = 0; $('light').value = 0; $('v-light').textContent = '0.00'; eventTimer = Math.max(eventTimer, 1500); sim._restore = () => { sim.params.light = savedLight; $('light').value = savedLight; $('v-light').textContent = savedLight.toFixed(2); }; };
$('crash').onclick = () => sim.nut.fill(0.02);
$('mutagen').onclick = () => { savedMut = sim.params.mutation; sim.params.mutation = Math.min(0.25, savedMut * 8 + 0.05); $('mutation').value = sim.params.mutation; eventTimer = 800; sim._restore = () => { sim.params.mutation = savedMut; $('mutation').value = savedMut; $('v-mutation').textContent = savedMut.toFixed(3); }; };

// ---------------------------------------------------------------- rendering
const nutCv = document.createElement('canvas'); nutCv.width = sim.gw; nutCv.height = sim.gh;
const nutCtx = nutCv.getContext('2d'), nutImg = nutCtx.createImageData(sim.gw, sim.gh);
let tNow = 0;

function drawWorld() {
  const W = cv.width, H = cv.height, z = cam.z * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16626b'); g.addColorStop(0.5, '#0a3945'); g.addColorStop(1, '#04161d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(z, 0, 0, z, W / 2 - cam.x * z, H / 2 - cam.y * z);
  // light shafts and pool edge
  const lg = ctx.createLinearGradient(0, 0, 0, sim.H);
  lg.addColorStop(0, `rgba(120,230,220,${0.38 * Math.min(1.5, sim.params.light)})`); lg.addColorStop(0.6, 'rgba(60,160,170,0.05)'); lg.addColorStop(1, 'rgba(0,0,0,0.0)');
  ctx.fillStyle = '#041a22'; ctx.fillRect(0, 0, sim.W, sim.H);
  const bg = ctx.createLinearGradient(0, 0, 0, sim.H); bg.addColorStop(0, '#0e4c58'); bg.addColorStop(0.55, '#083440'); bg.addColorStop(1, '#03141b');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, sim.W, sim.H);
  ctx.fillStyle = lg; ctx.fillRect(0, 0, sim.W, sim.H);
  // nutrient haze
  const d = nutImg.data;
  for (let i = 0; i < sim.nut.length; i++) { const v = Math.min(1, sim.nut[i]); d[i * 4] = 220; d[i * 4 + 1] = 190; d[i * 4 + 2] = 90; d[i * 4 + 3] = v * 90; }
  nutCtx.putImageData(nutImg, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(nutCv, 0, 0, sim.W, sim.H);
  for (const v of sim.vents) { const rg = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, 60); rg.addColorStop(0, 'rgba(255,170,80,0.55)'); rg.addColorStop(1, 'rgba(255,170,80,0)'); ctx.fillStyle = rg; ctx.fillRect(v.x - 60, v.y - 60, 120, 120); }
  ctx.strokeStyle = 'rgba(120,200,210,0.35)'; ctx.lineWidth = 2 / z; ctx.strokeRect(0, 0, sim.W, sim.H);

  const vx0 = cam.x - W / 2 / z - 80, vx1 = cam.x + W / 2 / z + 80, vy0 = cam.y - H / 2 / z - 80, vy1 = cam.y + H / 2 / z + 80;
  // draw small cells first, large last
  for (const c of sim.cells) {
    if (c.x < vx0 || c.x > vx1 || c.y < vy0 || c.y > vy1) continue;
    const P = c.P, half = P.a * c.sc * U * z;
    const lod = half < 3.5 ? 0 : half < 9 ? 1 : half < 28 ? 2 : 3;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang);
    const u = U * c.sc;
    ctx.scale(u, u);
    drawCell(ctx, P, { t: tNow + c.id * 0.37, seed: c.id, fv: c.fv, div: c.divT > 0 ? Math.min(1, c.divT / 70) : 0, beat: c.beat ?? 1 }, u * z, { lod });
    ctx.restore();
    if (c === selected) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.strokeStyle = '#ffe27a'; ctx.lineWidth = 2 / z; ctx.setLineDash([6 / z, 4 / z]);
      ctx.beginPath(); ctx.arc(0, 0, Math.max(P.a, P.b) * c.sc * U * 1.12 + 6 / z, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- inspector
const pctx = $('portrait').getContext('2d');
function updateInspectorStatic() {
  const c = selected;
  if (!c) return;
  $('desc').textContent = describe(c.P);
  const rows = [['Cell', '#' + c.id], ['Generation', c.gen], ['Parent', c.parent ? '#' + c.parent : 'founder'], ['Founder line', '#' + c.lin]];
  $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  const maxv = Math.max(1, ...c.g.map((q) => q.v * q.x));
  $('genes').innerHTML = [...c.g].sort((a, b) => a.k.localeCompare(b.k) || b.v - a.v).map((q) => `<div class="gene"><span>${q.k}</span><i style="width:${Math.min(100, (q.v * q.x / maxv) * 100)}%"></i><span>${q.v.toFixed(2)} × ${q.x.toFixed(2)}</span></div>`).join('');
  $('muts').textContent = c.muts.length ? 'Mutations at its birth: ' + c.muts.map((m) => `${m.type} (${m.kind})`).join(', ') : 'No mutations at its birth.';
}
let lastInspect = 0;
function drawInspector() {
  const c = selected;
  if (!c) { pctx.fillStyle = '#fbfaf6'; pctx.fillRect(0, 0, 840, 640); pctx.fillStyle = '#999'; pctx.font = '22px Georgia'; pctx.textAlign = 'center'; pctx.fillText('Click a cell to see its structure', 420, 320); return; }
  if (!c.alive) { $('desc').textContent = 'This cell is gone (' + c.cause + '). Click another.'; }
  drawPortrait(pctx, 840, 640, c.P, { t: tNow, seed: c.id, fv: c.fv, div: c.divT > 0 ? Math.min(1, c.divT / 70) : 0, beat: c.beat ?? 1 }, {});
  if (performance.now() - lastInspect > 400) {
    lastInspect = performance.now();
    const rows = [['Cell', '#' + c.id + (c.alive ? '' : ' (dead: ' + c.cause + ')')], ['Generation', c.gen], ['Age', c.age + ' ticks'], ['Offspring', c.kids], ['Prey eaten', c.kills], ['Size', (c.sc * 100).toFixed(0) + '% of newborn'], ['Founder line', '#' + c.lin]];
    $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
    const gain = (c.lastGain || 0) * 1000, cost = (c.lastCost || 0) * 1000, mx = Math.max(gain, cost, 1) * 1.2;
    $('energy').innerHTML = `<div class="kv"><span>Income</span><span>${gain.toFixed(1)}</span></div><div class="bar"><i style="width:${gain / mx * 100}%;background:#7bdc65"></i></div>
      <div class="kv"><span>Upkeep + movement</span><span>${cost.toFixed(1)}</span></div><div class="bar"><i style="width:${cost / mx * 100}%;background:#ff7a66"></i></div>
      <div class="kv"><span>Stored energy</span><span>${(c.energy / c.B * 100).toFixed(0)}% of biomass</span></div><div class="bar"><i style="width:${clamp(c.energy / c.B, 0, 1) * 100}%;background:#5fd6c8"></i></div>
      <div class="kv"><span>Growth to division</span><span>${clamp((c.B / c.B0 - 1) * 100, 0, 100).toFixed(0)}%</span></div><div class="bar"><i style="width:${clamp(c.B / c.B0 - 1, 0, 1) * 100}%;background:#ffb454"></i></div>`;
  }
}

// ---------------------------------------------------------------- pool census and chart
const FEATURES = [['euk', 'eukaryote', '#c084fc'], ['photo', 'photosynthetic', '#7bdc65'], ['flag', 'flagellated', '#5fd6c8'], ['cilia', 'ciliated', '#60a5fa'], ['wall', 'walled', '#ffb454'], ['mouth', 'predator', '#ff6b57'], ['amoeba', 'amoeboid', '#f0abfc']];
$('legend').innerHTML = FEATURES.map(([, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
function drawChart() {
  const c = $('chart'), x = c.getContext('2d'), r = c.getBoundingClientRect(); c.width = r.width * dpr; c.height = r.height * dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, r.width, r.height);
  const h = sim.hist; if (h.length < 2) return;
  x.strokeStyle = '#233341'; x.lineWidth = 1; for (let i = 0; i <= 4; i++) { const y = 6 + (r.height - 12) * i / 4; x.beginPath(); x.moveTo(0, y); x.lineTo(r.width, y); x.stroke(); }
  for (const [k, , col] of FEATURES) {
    x.beginPath(); x.strokeStyle = col; x.lineWidth = 1.6;
    h.forEach((p, i) => { const px = i / (h.length - 1) * r.width, py = 6 + (r.height - 12) * (1 - (p[k] || 0)); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
  }
}
let lastCensus = 0;
function census() {
  const tally = new Map();
  for (const c of sim.cells) { const k = describe(c.P); let e = tally.get(k); if (!e) tally.set(k, (e = { n: 0, rep: c })); e.n++; if (c.B > e.rep.B) e.rep = c; }
  const list = [...tally.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 9);
  $('plans').innerHTML = list.map(([k, e], i) => `<div class="plan" data-i="${i}"><span>${k}</span><b>${e.n}</b></div>`).join('');
  [...$('plans').children].forEach((el, i) => { el.onclick = () => { select(list[i][1].rep); zoomTo(list[i][1].rep); }; });
  const h = sim.hist[sim.hist.length - 1] || {};
  $('c-n').textContent = sim.cells.length; $('c-t').textContent = sim.tick; $('c-euk').textContent = ((h.euk || 0) * 100).toFixed(0) + '%';
  $('c-photo').textContent = ((h.photo || 0) * 100).toFixed(0) + '%'; $('c-mouth').textContent = ((h.mouth || 0) * 100).toFixed(0) + '%';
  $('c-mut').textContent = Object.values(sim.mutCounts).reduce((a, b) => a + b, 0); $('c-dead').textContent = Object.values(sim.deaths).reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------- main loop
let acc = 0, autoPicked = false;
function frame(ms) {
  tNow = ms / 1000;
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
  const p0 = performance.now(); drawWorld(); const p1 = performance.now(); drawInspector(); const p2 = performance.now();
  window.__perf = { world: p1 - p0, insp: p2 - p1 };
  if (ms - lastCensus > 700) { lastCensus = ms; census(); drawChart(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
