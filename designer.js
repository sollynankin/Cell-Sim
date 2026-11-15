// Cell designer: build a genome gene by gene, preview the developed cell, check whether it can make a living,
// save it to a library and drop copies into the pool. A designed cell is an ordinary cell: it lives, dies and
// mutates by the same rules as everything else.
import { KINDS, gene, develop, describe, archetype, ARCHETYPES, cloneGenome, mutate, mulberry32, clamp } from './genome.js';
import { drawPortrait } from './cellart.js';
import { drawDNA, orderGenes, KIND_COLORS, describeGene } from './dna.js';
import { GENE_INFO } from './info.js';
import { Cell } from './sim.js';

const LS = 'cellevo.designs.v1';
export const loadLibrary = () => { try { const a = JSON.parse(localStorage.getItem(LS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } };
const saveLibrary = (a) => { try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) { /* storage may be blocked */ } };
export const genomeFromDesign = (d) => d.genes.map((q) => gene(q.k, +q.v || 0, q.x === undefined ? 1 : +q.x));

const firstSentence = (t) => (t || '').split(/(?<=[.!?])\s/)[0];
const hueColor = (v) => `hsl(${(v * 360) % 360},65%,70%)`;

export function createDesigner(env) {
  const { sim } = env, $ = (id) => document.getElementById(id);
  const dlg = $('designer'), pctx = $('dz-portrait').getContext('2d'), dctx = $('dz-dna').getContext('2d');
  let genes = [], name = 'My cell', hoverIdx = -1, lastRungs = [], P = null, dirty = true;

  // ---- fill selects ---------------------------------------------------------------
  $('dz-template').innerHTML = ARCHETYPES.map((n) => `<option>${n}</option>`).join('');
  $('dz-newkind').innerHTML = KINDS.map((k) => `<option value="${k}">${k} · ${firstSentence(GENE_INFO[k]).slice(0, 52)}</option>`).join('');
  const kindOptions = (sel) => KINDS.map((k) => `<option${k === sel ? ' selected' : ''}>${k}</option>`).join('');

  function refreshLibrary() {
    const lib = loadLibrary();
    $('dz-lib').innerHTML = '<option value="">Saved designs…</option>' + lib.map((d, i) => `<option value="${i}">${d.name} (${d.genes.length} genes)</option>`).join('');
    env.onLibrary && env.onLibrary(lib);
  }

  // ---- gene rows ------------------------------------------------------------------
  function rebuildRows() {
    $('dz-genes').innerHTML = genes.map((g) => `<div class="dzrow" data-id="${g.id}">
      <i class="dot" style="background:${g.k === 'hue' ? hueColor(g.v) : KIND_COLORS[g.k] || '#9ca3af'}"></i>
      <select data-f="k">${kindOptions(g.k)}</select>
      <input type="range" data-f="v" min="0" max="3" step="0.05" value="${g.v}" title="amplitude: how strong the gene is">
      <b class="val" data-val="v">${g.v.toFixed(2)}</b>
      <input type="range" data-f="x" min="0.05" max="2.5" step="0.05" value="${g.x}" title="expression level (multiplies amplitude)">
      <b class="val" data-val="x">×${g.x.toFixed(2)}</b>
      <button class="ib" data-act="del" title="Delete this gene">&#10005;</button></div>`).join('') || '<div class="hint">No genes yet. Add one below, or load a template.</div>';
    $('dz-count').textContent = genes.length + ' gene' + (genes.length === 1 ? '' : 's');
  }
  const geneById = (id) => genes.find((g) => g.id === +id);
  $('dz-genes').addEventListener('input', (e) => {
    const row = e.target.closest('.dzrow'); if (!row || !e.target.dataset.f) return;
    const g = geneById(row.dataset.id); const f = e.target.dataset.f; if (!g || f === 'k') return;
    g[f] = +e.target.value; row.querySelector(`[data-val=${f}]`).textContent = f === 'v' ? g.v.toFixed(2) : '×' + g.x.toFixed(2);
    if (g.k === 'hue') row.querySelector('.dot').style.background = hueColor(g.v);
    changed();
  });
  $('dz-genes').addEventListener('change', (e) => {
    const row = e.target.closest('.dzrow'); if (!row || e.target.dataset.f !== 'k') return;
    const g = geneById(row.dataset.id); g.k = e.target.value; rebuildRows(); changed();
  });
  $('dz-genes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act=del]'); if (!b) return;
    genes = genes.filter((g) => g.id !== +b.closest('.dzrow').dataset.id); rebuildRows(); changed();
  });
  $('dz-genes').addEventListener('mouseover', (e) => {
    const row = e.target.closest('.dzrow'); if (!row) return; const g = geneById(row.dataset.id); if (!g) return;
    $('dz-kinddesc').textContent = g.k + ': ' + (GENE_INFO[g.k] || '');
    const i = orderGenes(genes).findIndex((q) => q.id === g.id); if (i !== hoverIdx) { hoverIdx = i; drawHelix(); }
  });
  $('dz-genes').addEventListener('mouseleave', () => { if (hoverIdx !== -1) { hoverIdx = -1; drawHelix(); } });

  $('dz-add').onclick = () => { if (genes.length >= 60) return; const k = $('dz-newkind').value; genes.push(gene(k, defaultAmp(k), 1)); rebuildRows(); changed(); $('dz-genes').scrollTop = 1e6; };
  const defaultAmp = (k) => ({ hue: 0.5, nucleus: 1.2, flag: 1.4, mito: 2, chloro: 2, cvac: 1, golgi: 1, cilia: 0.8, mouth: 0.8, eye: 0.8, wall: 0.5, size: 0.3, growth: 0.3 }[k] ?? 0.5);
  $('dz-load').onclick = () => { genes = archetype($('dz-template').value); name = $('dz-template').value + ' (copy)'; $('dz-name').value = name; rebuildRows(); changed(); };
  $('dz-blank').onclick = () => { genes = [gene('size', 0.1), gene('growth', 0.5), gene('hue', Math.random())]; name = 'My cell'; $('dz-name').value = name; rebuildRows(); changed(); };
  $('dz-mutate').onclick = () => { genes = mutate(genes, 0.35, mulberry32((Math.random() * 1e9) | 0), []); rebuildRows(); changed(); };
  $('dz-name').oninput = () => { name = $('dz-name').value; };

  // ---- library, import / export ---------------------------------------------------
  const design = () => ({ name: ($('dz-name').value || 'My cell').trim() || 'My cell', genes: genes.map((g) => ({ k: g.k, v: +g.v.toFixed(3), x: +g.x.toFixed(3) })) });
  $('dz-save').onclick = () => {
    const lib = loadLibrary(), d = design(), i = lib.findIndex((x) => x.name === d.name);
    if (i >= 0) lib[i] = d; else lib.push(d);
    saveLibrary(lib); refreshLibrary(); $('dz-lib').value = String(i >= 0 ? i : lib.length - 1); toast(`Saved “${d.name}” to your library`);
  };
  $('dz-lib').onchange = () => { const d = loadLibrary()[+$('dz-lib').value]; if (!d) return; genes = genomeFromDesign(d); name = d.name; $('dz-name').value = name; rebuildRows(); changed(); };
  $('dz-del').onclick = () => { const i = $('dz-lib').value; if (i === '') return; const lib = loadLibrary(); const [gone] = lib.splice(+i, 1); saveLibrary(lib); refreshLibrary(); toast(`Deleted “${gone.name}”`); };
  $('dz-export').onclick = () => { const t = JSON.stringify(design(), null, 1); $('dz-json').value = t; $('dz-json').select(); try { navigator.clipboard && navigator.clipboard.writeText(t); toast('Design copied as JSON'); } catch (e) { toast('JSON shown below'); } };
  $('dz-import').onclick = () => {
    try {
      const d = JSON.parse($('dz-json').value); if (!d || !Array.isArray(d.genes)) throw new Error('no genes');
      const ok = d.genes.filter((q) => KINDS.includes(q.k)).slice(0, 60); if (!ok.length) throw new Error('no valid genes');
      genes = genomeFromDesign({ genes: ok }); name = d.name || 'Imported cell'; $('dz-name').value = name; rebuildRows(); changed(); toast('Design loaded');
    } catch (e) { toast('Could not read that JSON: ' + e.message); }
  };

  // ---- adding to the pool -----------------------------------------------------------
  $('dz-place').onchange = () => {};
  $('dz-spawn').onclick = () => {
    const n = clamp(Math.round(+$('dz-n').value || 1), 1, 100), mode = $('dz-place').value, W = sim.W, H = sim.H, cam = env.cam();
    const nm = (design().name);
    for (let i = 0; i < n; i++) {
      let x, y;
      if (mode === 'vents') { const v = sim.vents[(Math.random() * sim.vents.length) | 0]; x = v.x + (Math.random() - 0.5) * 140; y = H * (0.82 + Math.random() * 0.14); }
      else if (mode === 'surface') { x = Math.random() * W; y = H * (0.03 + Math.random() * 0.12); }
      else if (mode === 'everywhere') { x = Math.random() * W; y = Math.random() * H * 0.92; }
      else { x = cam.x + (Math.random() - 0.5) * 220; y = cam.y + (Math.random() - 0.5) * 220; }
      const c = sim.spawn(cloneGenome(genes), null, clamp(x, 10, W - 10), clamp(y, 10, H - 10)); c.label = nm;
    }
    toast(`Added ${n} × “${nm}” to the pool`); env.onAdded && env.onAdded();
  };
  let toastT = 0;
  function toast(msg) { const t = $('dz-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

  // ---- preview ----------------------------------------------------------------------
  function drawHelix() { lastRungs = drawDNA(dctx, $('dz-dna').width, $('dz-dna').height, genes, 0.9, hoverIdx); }
  $('dz-dna').addEventListener('pointermove', (e) => {
    const cv = $('dz-dna'), r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (cv.width / r.width); let best = -1, bd = 12;
    for (const g of lastRungs) { const d = Math.abs(g.x - x); if (d < bd) { bd = d; best = g.i; } }
    if (best !== hoverIdx) { hoverIdx = best; drawHelix(); }
    if (best >= 0) $('dz-kinddesc').textContent = describeGene(lastRungs[best].q);
  });
  $('dz-dna').addEventListener('pointerleave', () => { if (hoverIdx !== -1) { hoverIdx = -1; drawHelix(); } });

  function changed() { dirty = true; }
  const raw = (k) => genes.filter((g) => g.k === k).reduce((s, g) => s + g.v * g.x, 0);
  function analyse() {
    P = develop(genes);
    $('dz-desc').textContent = genes.length ? describe(P).replace(/^./, (m) => m.toUpperCase()) : 'No genes';
    drawHelix();
    const c = new Cell(0, genes, 0, 0, null);
    const conds = [['At a vent', 0.55, 0], ['Mid-water', 0.2, 0.35], ['Near the surface', 0.06, 1]];
    const rows = conds.map(([n, nut, L]) => { const led = sim.ledger(c, nut, L); const net = led.up + led.photo - led.cost; return { n, net, inc: led.up + led.photo, cost: led.cost, gen: net > 0 ? Math.round(c.B0 / (0.8 * net)) : null }; });
    const mx = Math.max(0.001, ...rows.map((r) => Math.max(r.inc, r.cost)));
    $('dz-budget').innerHTML = `<div class="dzb">` + rows.map((r) => `<div class="dzbrow"><span>${r.n}</span>
      <div class="track"><i style="width:${r.inc / mx * 100}%;background:#7bdc65"></i></div><div class="track"><i style="width:${r.cost / mx * 100}%;background:#ff7a66"></i></div>
      <b style="color:${r.net > 0 ? '#7bdc65' : '#ff7a66'}">${r.net >= 0 ? '+' : ''}${(r.net * 1000).toFixed(1)}</b><em>${r.gen ? '≈ ' + r.gen + ' ticks per generation' : 'cannot grow'}</em></div>`).join('') +
      `<div class="hint">green = income, red = upkeep, number = net energy per tick ×1000</div></div>`;
    const w = [];
    const prot = 0.15 + 0.7 * P.wall + 0.3 * P.cvac + 0.2 * P.vacuole;
    if (!genes.length) w.push('Add at least a size gene.');
    if (!P.euk && (raw('mito') > 0.4 || raw('golgi') > 0.4 || raw('er') > 0.4)) w.push('Mitochondria, Golgi and ER do nothing without a nucleus gene of at least 0.5.');
    if (!P.euk && raw('chloro') > 0) w.push('Without a nucleus the chloroplast gene makes weaker bacterial thylakoid membranes (45% of a chloroplast).');
    if (genes.some((g) => g.k === 'flag' && g.v * g.x <= 0.2)) w.push('A flagellum gene needs a strength above 0.2 to count; each flagellum gene is one flagellum.');
    if (raw('lobe') > 0 && P.wall > 0.3) w.push('A thick wall stiffens the membrane and suppresses pseudopods.');
    if (!P.euk && P.size > 1.05) w.push('Big cells without a nucleus pay an internal-transport penalty.');
    if (raw('eye') > 0.25 && !(P.plastids || P.thylakoid > 0.1)) w.push('An eyespot only steers toward light if the cell also photosynthesises.');
    if (P.mouth > 0.3) w.push('A mouth lets it eat cells smaller than about half its own area.');
    if (sim.params.hypo - prot > 0.15) w.push('At the current dilute-water setting this cell may burst. A wall or contractile vacuole protects it.');
    if (rows.every((r) => r.net <= 0)) w.push('It cannot make a living anywhere and will starve. Add chloroplasts or lower its upkeep (fewer organelles, smaller body).');
    $('dz-warn').innerHTML = w.map((t) => `<div class="dzw">${t}</div>`).join('');
  }

  let raf = 0;
  function loop() {
    if (!dlg.open) { raf = 0; return; }
    if (dirty) { dirty = false; analyse(); }
    if (P) drawPortrait(pctx, 900, 620, P, { t: performance.now() / 1000, seed: 7, fv: P.mouth > 0.3 ? 2 : 0, beat: 1 }, { labels: $('dz-labels').checked });
    raf = requestAnimationFrame(loop);
  }

  function open(genome, label) {
    genes = genome ? cloneGenome(genome) : (genes.length ? genes : [gene('size', 0.1), gene('growth', 0.5), gene('hue', Math.random())]);
    name = label || name; $('dz-name').value = name; refreshLibrary(); rebuildRows(); dirty = true;
    if (!dlg.open) dlg.showModal();
    if (!raf) raf = requestAnimationFrame(loop);
  }
  $('dz-close').onclick = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  refreshLibrary();
  return { open, refreshLibrary };
}
