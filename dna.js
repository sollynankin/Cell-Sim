// Double-helix view of a genome. One rung per gene; rung brightness, glow and thickness show how strong the
// gene is (amplitude x expression). Rungs are coloured by gene kind and grouped by kind along the helix.
import { GENE_INFO } from './info.js';

export const KIND_COLORS = {
  size: '#38bdf8', elong: '#0ea5e9', taper: '#22d3ee', box: '#06b6d4', lobe: '#2dd4bf', flex: '#14b8a6',      // body shape
  hue: '#f9a8d4', wall: '#f59e0b', growth: '#facc15', mutator: '#fde047',                                    // colour, wall, growth, mutation
  nucleus: '#a855f7', mito: '#fb7185', chloro: '#84cc16', vacuole: '#7dd3fc', cvac: '#fb923c', golgi: '#818cf8', er: '#60a5fa', // organelles
  flag: '#34d399', cilia: '#4ade80', pili: '#fdba74', eye: '#ef4444', mouth: '#f43f5e', sense: '#c084fc',       // motion and senses
};
const hexToRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (c, k) => c.map((v) => Math.round(v * k + 255 * (1 - k) * 0.0));                         // scale towards black
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const lighten = (c, f) => c.map((v) => Math.round(v + (255 - v) * f));

export function orderGenes(genes) {
  return [...genes].sort((a, b) => a.k.localeCompare(b.k) || b.v * b.x - a.v * a.x);
}
export const strengthOf = (q) => q.v * q.x;

// Draws the helix; returns the list of rungs [{x, y0, y1, gene}] for hit-testing.
export function drawDNA(ctx, W, H, genes, t, hoverIdx = -1) {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1620'); g.addColorStop(1, '#0e1d29');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const list = orderGenes(genes), n = list.length;
  if (!n) return [];
  const padX = 18, cy = H / 2, A = H * 0.34;
  const span = W - padX * 2, dx = span / Math.max(1, n - 1 + 0.0001), twist = 0.62;                     // radians per rung
  const th = (x) => ((x - padX) / dx) * twist + t * 0.9;
  const strands = [1, -1];
  // sampled backbone points per strand
  const samples = Math.max(60, n * 5), pts = [[], []];
  for (let j = 0; j <= samples; j++) {
    const x = padX + (j / samples) * span, a = th(x);
    pts[0].push({ x, y: cy + A * Math.sin(a), z: Math.cos(a) });
    pts[1].push({ x, y: cy - A * Math.sin(a), z: -Math.cos(a) });
  }
  const drawBackbone = (front) => {
    for (let s = 0; s < 2; s++) {
      for (let j = 1; j <= samples; j++) {
        const p0 = pts[s][j - 1], p1 = pts[s][j], z = (p0.z + p1.z) / 2;
        if ((z > 0) !== front) continue;
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.lineWidth = 1.6 + 1.6 * (z + 1) * 0.5 + (front ? 0.8 : 0); ctx.lineCap = 'round';
        const l = 38 + 30 * (z + 1) * 0.5;
        ctx.strokeStyle = s === 0 ? `hsl(200,45%,${l}%)` : `hsl(215,40%,${l - 4}%)`; ctx.stroke();
      }
    }
  };
  drawBackbone(false);
  // rungs, back to front
  const maxS = 3;                                                                                    // fixed scale so brightness compares between cells
  const rungs = list.map((q, i) => { const x = padX + i * dx, a = th(x); return { i, q, x, a, z: Math.cos(a), y0: cy + A * Math.sin(a), y1: cy - A * Math.sin(a) }; });
  const order = [...rungs].sort((p, q) => p.z - q.z);
  for (const r of order) {
    const s = Math.sqrt(Math.min(1, strengthOf(r.q) / maxS));                                          // 0..1 perceptual strength
    const base = hexToRgb(KIND_COLORS[r.q.k] || '#9ca3af');
    const depth = 0.55 + 0.45 * (r.z + 1) / 2;                                                         // farther rungs dimmer
    const bright = (0.06 + 0.94 * s * s) * depth;                                                          // brightness = gene strength
    const c0 = lighten(base, 0.35 * s), c1 = lighten(base, 0.7 * s);
    const mid = (r.y0 + r.y1) / 2, w = 3 + 7 * s;
    const hov = r.i === hoverIdx;
    if (s > 0.28) { ctx.save(); ctx.shadowColor = rgba(base, 0.9 * s); ctx.shadowBlur = 8 + 22 * s; ctx.lineWidth = w; ctx.strokeStyle = rgba(base, 0.5 * bright); ctx.beginPath(); ctx.moveTo(r.x, r.y0); ctx.lineTo(r.x, r.y1); ctx.stroke(); ctx.restore(); }
    ctx.lineCap = 'round'; ctx.lineWidth = w;
    ctx.strokeStyle = rgba(c0, 0.18 + 0.82 * bright); ctx.beginPath(); ctx.moveTo(r.x, r.y0); ctx.lineTo(r.x, mid); ctx.stroke();      // two bases meeting in the middle
    ctx.strokeStyle = rgba(c1, 0.18 + 0.82 * bright); ctx.beginPath(); ctx.moveTo(r.x, mid); ctx.lineTo(r.x, r.y1); ctx.stroke();
    ctx.fillStyle = rgba(lighten(base, 0.9), 0.3 + 0.7 * bright); ctx.beginPath(); ctx.arc(r.x, mid, 1 + 1.4 * s, 0, 6.283); ctx.fill();
    if (hov) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.rect(r.x - w / 2 - 3, Math.min(r.y0, r.y1) - 4, w + 6, Math.abs(r.y1 - r.y0) + 8); ctx.stroke(); }
  }
  drawBackbone(true);
  // phosphate nodes where rungs meet the backbone
  for (const r of rungs) {
    const s = Math.sqrt(Math.min(1, strengthOf(r.q) / maxS));
    for (const y of [r.y0, r.y1]) { ctx.beginPath(); ctx.arc(r.x, y, 2.2 + 0.8 * s, 0, 6.283); ctx.fillStyle = `rgba(210,235,250,${0.35 + 0.5 * s})`; ctx.fill(); }
  }
  return rungs;
}

export function dnaLegend(genes) {
  const kinds = [...new Set(genes.map((q) => q.k))].sort();
  return kinds.map((k) => `<span><i style="background:${KIND_COLORS[k] || '#9ca3af'}"></i>${k}</span>`).join('');
}
export const describeGene = (q) => `${q.k}: amplitude ${q.v.toFixed(2)} × expression ${q.x.toFixed(2)} = strength ${(q.v * q.x).toFixed(2)}. ${GENE_INFO[q.k] || ''}`;
