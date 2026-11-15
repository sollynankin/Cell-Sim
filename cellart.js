// Detailed illustrated rendering of a developed cell (phenotype P). Pure drawing: reads P and
// a small state object, never changes dynamics. Local frame: +x is the front, units are body lengths.
import { mulberry32, clamp } from './genome.js';

const TAU = Math.PI * 2;
const sgnpow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// ---------------------------------------------------------------------------------------
// Body outline: superellipse (rods/capsules) x taper (teardrops) x lobes (amoeboid) x pinch (division)
export function outline(P, t = 0, N = 96, div = 0) {
  const n = 2 + 3 * P.box, e = 2 / n;
  const a = P.a * (1 + 0.55 * div), b = P.b * (1 - 0.1 * div);
  const pts = [];
  const hasMouth = P.mouth > 0.35 && P.aspect > 1.6;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * TAU, c = Math.cos(th), s = Math.sin(th);
    let x = a * sgnpow(c, e), y = b * sgnpow(s, e);
    const f = 1 - P.taper * Math.pow(1 - (x / a + 1) / 2, 1.4);        // pointed rear
    y *= f;
    if (P.taper > 0.3) x -= 0.05 * a * P.taper * (1 - Math.abs(c));      // pull the tail into a point
    if (P.lobe > 0.02) {                                                  // pseudopods, animated
      const k = 1 + P.lobe * 0.2 * (Math.sin(6 * th + 0.5 * t + 1) + 0.5 * Math.sin(9 * th - 0.8 * t) + 0.5 * Math.sin(4 * th + 0.4 * t)) - 0.04 * P.lobe;
      x *= k; y *= k;
    }
    if (P.flex > 0.02) { const k = 1 + 0.035 * P.flex * Math.sin(3 * th + 1.3 * t); x *= k; y *= k; }
    if (hasMouth && y > 0) {                                              // oral groove
      const g = Math.exp(-Math.pow((x - 0.05 * a) / (0.3 * a), 2));
      y -= 0.55 * b * g * Math.min(1, y / (0.5 * b));
    }
    if (div > 0) x *= 1;
    if (div > 0.02) {                                                     // pinch at the equator
      const w = 1 - 0.92 * Math.pow(div, 1.5) * Math.exp(-Math.pow(x / (0.22 * a), 2));
      y *= w;
    }
    pts.push({ x, y });
  }
  for (let i = 0; i < N; i++) {                                           // outward normals
    const p0 = pts[(i + N - 1) % N], p1 = pts[(i + 1) % N];
    let nx = p1.y - p0.y, ny = -(p1.x - p0.x);
    const l = Math.hypot(nx, ny) || 1; pts[i].nx = nx / l; pts[i].ny = ny / l;
  }
  return pts;
}

function pip(poly, x, y) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---------------------------------------------------------------------------------------
// Organelle layout, computed once per cell (cached on P._L) from its seed.
export function layoutOf(P, seed) {
  if (P._L && P._Lseed === seed) return P._L;
  const rng = mulberry32((seed * 2654435761) >>> 0);
  const R = (a, b) => a + (b - a) * rng();
  const poly = outline(P, 0, 64).map((p) => ({ x: p.x * 0.78, y: p.y * 0.78 }));
  const inside = (x, y, r = 0) => pip(poly, x, y) && pip(poly, x + r, y) && pip(poly, x - r, y) && pip(poly, x, y + r) && pip(poly, x, y - r);
  const L = { items: [], ribo: [], nucleoid: [], er: [], seed };
  const place = (type, r, extra = {}, near = null, tries = 80) => {
    for (let k = 0; k < tries; k++) {
      let x, y;
      if (near) { const an = R(0, TAU), d = near.r + r * 1.1 + R(0, 0.08); x = near.x + Math.cos(an) * d; y = near.y + Math.sin(an) * d; }
      else { x = R(-P.a, P.a) * 0.85; y = R(-P.b, P.b) * 0.85; }
      if (!inside(x, y, r * 0.8)) continue;
      if (L.items.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.9)) continue;
      const it = { type, x, y, r, rot: R(0, TAU), id: L.items.length, ...extra };
      L.items.push(it); return it;
    }
    return null;
  };
  const rn = Math.min(0.5 * P.b, P.nucleus * P.size * 1.35);
  let nuc = null;
  if (P.euk) {
    nuc = { type: 'nucleus', x: 0.08 * P.a + R(-0.1, 0.1) * P.a, y: R(-0.15, 0.15) * P.b, r: rn, rot: R(0, TAU), id: 0 };
    L.items.push(nuc);
  }
  if (P.vacuole > 0.05) place('vacuole', clamp(P.vacuole * 0.5 * P.b + 0.08, 0.1, 0.62 * P.b));
  for (let i = 0; i < P.cvac; i++) place('cvac', 0.2 * P.b + 0.05, { phase: R(0, TAU) });
  if (P.plastids >= 2) {
    for (let i = 0; i < P.plastids; i++) {
      const r = 0.15 + 0.03 * P.size;
      for (let k = 0; k < 60; k++) {                                       // plastids hug the periphery
        const an = R(0, TAU), rr = R(0.45, 0.72);
        const x = Math.cos(an) * P.a * rr, y = Math.sin(an) * P.b * rr;
        if (!inside(x, y, r * 0.7)) continue;
        if (L.items.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r + r) * 0.85)) continue;
        L.items.push({ type: 'plastid', x, y, r, rot: an + Math.PI / 2 + R(-0.5, 0.5), id: L.items.length }); break;
      }
    }
  }
  for (let i = 0; i < P.golgi; i++) place('golgi', 0.2 * P.b + 0.06, {}, nuc);
  for (let i = 0; i < P.mito; i++) place('mito', 0.1 + 0.02 * P.size, { len: R(0.8, 1.2) });
  for (let i = 0; i < (P.mouth > 0.3 ? 4 : 0); i++) place('fv', 0.09 + 0.02 * P.size, { slot: i });
  const nr = Math.round(40 * P.size * P.size * (P.euk ? 0.9 : 2.2) * P.aspect ** 0.3);
  for (let i = 0; i < nr; i++) {
    const x = R(-P.a, P.a) * 0.9, y = R(-P.b, P.b) * 0.9;
    if (inside(x, y, 0.02) && !L.items.some((o) => Math.hypot(o.x - x, o.y - y) < o.r * 1.05)) L.ribo.push({ x, y });
  }
  if (!P.euk) {                                                            // nucleoid: twisted rope of DNA strands
    for (let st = 0; st < 3; st++) {
      const strand = [], ph = R(0, TAU), k1 = 5 + R(0, 3), k2 = 11 + R(0, 4), a1 = R(0.25, 0.4), a2 = R(0.08, 0.16);
      for (let i = 0; i <= 90; i++) {
        const s0 = i / 90, x = (s0 - 0.5) * 1.5 * P.a * 0.9;
        const env = Math.sin(Math.PI * s0) ** 0.6;
        const y = P.b * env * (a1 * Math.sin(k1 * s0 * Math.PI + ph + st * 2.1) + a2 * Math.sin(k2 * s0 * Math.PI + st * 1.3));
        strand.push({ x, y });
      }
      L.nucleoid.push(strand);
    }
  } else if (P.er > 0.1 && nuc) {
    for (let i = 0; i < 3; i++) { const o = (i - 1) * 0.07; L.er.push({ o, ph: R(0, TAU) }); }
  }
  P._L = L; P._Lseed = seed;
  return L;
}

// ---------------------------------------------------------------------------------------
const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

export function palette(P) {
  const h = P.hue * 360;
  const light = P.euk ? 90 : 88;
  return {
    h,
    cyto0: hsl(h, P.euk ? 45 : 55, light + 4), cyto1: hsl(h, P.euk ? 50 : 62, light - 8),
    edge: hsl(h, 42, 52), wall: hsl(h + 8, P.wall > 0.7 ? 72 : 10, P.wall > 0.7 ? 55 : 64),
    wallIn: hsl(h + 8, 45, 78), flag: P.euk ? hsl(h, 45, 52) : hsl(42, 70, 70),
    nuc: hsl(285 + (P.hue - 0.5) * 140, 52, 56), nucDark: hsl(285 + (P.hue - 0.5) * 140, 60, 38), nucLight: hsl(285 + (P.hue - 0.5) * 140, 60, 76),
  };
}

function trace(ctx, pts, s = 1, closed = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x * s, pts[0].y * s);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x * s, pts[i].y * s);
  if (closed) ctx.closePath();
}

// ---------------------------------------------------------------------------------------
// draw: ctx must already be translated/rotated to the cell centre; `u` = pixels per unit.
// state: {t, seed, fv (food vacuoles 0..4), div (0..1 division progress), beat (0..1 flagellar/ciliary activity)}
// opts: {lod 0..3, parts: [] (collects label anchors)}
export function drawCell(ctx, P, state, u, opts = {}) {
  const lod = opts.lod ?? 3;
  const t = state.t || 0, div = state.div || 0, beat = state.beat ?? 1;
  const pal = palette(P);
  const px = 1 / u;                                                         // one screen pixel in local units
  if (lod === 0) {
    ctx.beginPath(); ctx.ellipse(0, 0, P.a, P.b, 0, 0, TAU);
    ctx.fillStyle = pal.cyto1; ctx.fill(); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = pal.edge; ctx.stroke();
    if (P.euk) { ctx.beginPath(); ctx.arc(0, 0, P.b * 0.35, 0, TAU); ctx.fillStyle = pal.nuc; ctx.fill(); }
    return;
  }
  const L = layoutOf(P, state.seed || 1);
  const N = lod === 1 ? 28 : lod === 2 ? 64 : 110;
  const pts = outline(P, t, N, div);
  const parts = opts.parts;
  const addPart = (name, x, y) => parts && parts.push({ name, x, y });

  // ---- flagella (behind the body) -------------------------------------------------
  const flagBase = P.euk ? { x: P.a * 0.96, y: 0 } : { x: -P.a * 0.96, y: 0 };
  P.flagella.forEach((len, i) => {
    const n = P.flagella.length, spread = n === 1 ? 0 : (i / (n - 1) - 0.5);
    const dir = P.euk ? Math.atan2(spread * 1.4, 1) : Math.PI + spread * 1.5;
    const by = flagBase.y + (P.euk ? spread * 0.1 * P.b : spread * 0.7 * P.b);
    ctx.beginPath();
    let x = flagBase.x, y = by, ph = dir;
    ctx.moveTo(x, y);
    const Ltot = len * P.a * 1.1, seg = lod >= 2 ? 48 : 18, ds = Ltot / seg;
    const curl = P.euk ? 0.0 : 0.0;
    for (let k = 1; k <= seg; k++) {
      const s = k / seg;
      const amp = (0.25 + 1.1 * s) * (0.35 + 0.65 * beat);
      ph = dir + amp * Math.sin(TAU * 2.2 * s - t * 9 * (0.4 + beat) + i * 1.7) * 0.8 + curl * s + (P.euk && i === 0 ? 1.7 * s * s * Math.sin(0.4 * t + 1) : 0);
      x += Math.cos(ph) * ds; y += Math.sin(ph) * ds;
      ctx.lineTo(x, y);
    }
    if (lod >= 2) { ctx.lineWidth = (P.euk ? 4.6 : 5.4) * px; ctx.lineCap = 'round'; ctx.strokeStyle = hsl(P.euk ? pal.h : 42, 40, 60, 0.16); ctx.stroke(); }
    ctx.lineWidth = (P.euk ? 1.9 : 2.6) * px; ctx.lineCap = 'round'; ctx.strokeStyle = pal.flag; ctx.stroke();
    if (lod >= 2) { ctx.beginPath(); ctx.arc(flagBase.x, by, 2.2 * px, 0, TAU); ctx.fillStyle = hsl(P.euk ? pal.h : 30, 55, 36); ctx.fill(); }
    if (lod >= 2 && !P.euk) { ctx.lineWidth = 0.8 * px; ctx.strokeStyle = hsl(40, 80, 82); ctx.stroke(); }
  });
  if (P.flagella.length && i2(lod)) addPart(P.euk ? 'Flagella' : 'Flagella', P.euk ? P.a * 1.3 : -P.a * 1.4, 0);

  // ---- pili and cilia -------------------------------------------------------------
  if (lod >= 2 && P.pili > 0.05) {
    const step = Math.max(2, Math.round(N / (14 + 40 * P.pili)));
    ctx.lineWidth = 0.9 * px; ctx.strokeStyle = hsl(pal.h, 45, 50, 0.85); ctx.lineCap = 'round';
    for (let i = 0; i < N; i += step) {
      const p = pts[i], len = (0.14 + 0.1 * ((i * 37) % 7) / 7) * (0.6 + P.pili);
      const w = 0.25 * Math.sin(t * 1.5 + i);
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + p.nx * len * 0.5 - p.ny * w * 0.3, p.y + p.ny * len * 0.5 + p.nx * w * 0.3, p.x + p.nx * len, p.y + p.ny * len);
      ctx.stroke();
    }
  }
  if (lod >= 2 && P.cilia > 0.05) {
    const step = Math.max(1, Math.round(N / (50 + 90 * P.cilia)));
    ctx.lineWidth = 1.1 * px; ctx.strokeStyle = hsl(pal.h, 45, 42, 0.95); ctx.lineCap = 'round';
    for (let i = 0; i < N; i += step) {
      const p = pts[i], len = 0.1 * (0.7 + 0.5 * P.cilia) * Math.max(0.7, Math.min(1.4, P.size));
      const bend = 0.7 * Math.sin(TAU * i / N * 6 - t * 8 * (0.3 + beat)) * (0.3 + 0.7 * beat);
      const ang = Math.atan2(p.ny, p.nx) + bend;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.quadraticCurveTo(p.x + Math.cos(ang) * len * 0.6, p.y + Math.sin(ang) * len * 0.6, p.x + Math.cos(ang + bend * 0.5) * len, p.y + Math.sin(ang + bend * 0.5) * len);
      ctx.stroke();
    }
  }

  // ---- body: wall band, cytoplasm, membrane --------------------------------------
  const wallPx = P.wall > 0.08 ? 1.5 + 4.5 * Math.min(1.2, P.wall) : 0;
  const g = ctx.createRadialGradient(-P.a * 0.25, -P.b * 0.3, 0.02, 0, 0, Math.max(P.a, P.b) * 1.05);
  g.addColorStop(0, pal.cyto0); g.addColorStop(1, pal.cyto1);
  trace(ctx, pts);
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();

  // cytoplasm texture: faint granules, drifting slowly
  if (lod >= 3) {
    const gr = mulberry32(((state.seed || 1) * 7919) >>> 0); ctx.fillStyle = hsl(pal.h, 40, 45, 0.11);
    for (let k = 0; k < 90; k++) { const x = (gr() * 2 - 1) * P.a, y = (gr() * 2 - 1) * P.b; ctx.beginPath(); ctx.arc(x + Math.sin(t * 0.3 + k) * 0.01, y + Math.cos(t * 0.27 + k) * 0.01, (0.4 + 1.6 * gr()) * px, 0, TAU); ctx.fill(); }
  }
  // organelles are clipped to the body
  drawInterior(ctx, P, L, pts, pal, state, u, lod, t, parts);
  if (lod >= 2) { trace(ctx, pts); ctx.lineWidth = Math.max(7 * px, 0.14 * Math.min(P.a, P.b)); ctx.strokeStyle = hsl(pal.h, 45, 40, 0.14); ctx.stroke(); }   // inner rim shading for depth
  ctx.restore();

  if (wallPx) {
    trace(ctx, pts); ctx.lineWidth = wallPx * px; ctx.strokeStyle = pal.wall; ctx.lineJoin = 'round'; ctx.stroke();
    if (lod >= 2) { trace(ctx, pts, 1 - (wallPx * 0.5 * px) / Math.max(0.2, P.b)); ctx.lineWidth = 1.2 * px; ctx.strokeStyle = pal.wallIn; ctx.stroke(); }
    if (lod >= 2) addPart(P.euk ? 'Cell wall' : 'Cell wall', pts[Math.floor(N * 0.12)].x, pts[Math.floor(N * 0.12)].y);
  } else {
    if (lod >= 2) { trace(ctx, pts); ctx.lineWidth = 4.5 * px; ctx.strokeStyle = hsl(pal.h, 40, 60, 0.18); ctx.lineJoin = 'round'; ctx.stroke(); }
    trace(ctx, pts); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = pal.edge; ctx.lineJoin = 'round'; ctx.stroke();
  }
  // soft gloss
  if (lod >= 2) {
    ctx.save(); trace(ctx, pts); ctx.clip();
    const gl = ctx.createRadialGradient(-P.a * 0.35, -P.b * 0.45, 0, -P.a * 0.35, -P.b * 0.45, P.a * 0.8);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(-P.a * 1.4, -P.b * 1.4, P.a * 2.8, P.b * 2.8); ctx.restore();
  }
  if (lod >= 2 && P.cilia > 0.3) addPart('Cilia', pts[Math.floor(N * 0.3)].x, pts[Math.floor(N * 0.3)].y);
  if (lod >= 2 && P.pili > 0.3) addPart('Pili', pts[Math.floor(N * 0.8)].x + pts[Math.floor(N * 0.8)].nx * 0.1, pts[Math.floor(N * 0.8)].y + pts[Math.floor(N * 0.8)].ny * 0.1);
  if (lod >= 2 && P.mouth > 0.35 && P.aspect > 1.6) addPart('Oral groove', 0.05 * P.a, P.b * 0.55);
}
const i2 = (lod) => lod >= 2;

// ---------------------------------------------------------------------------------------
function drawInterior(ctx, P, L, pts, pal, state, u, lod, t, parts) {
  const px = 1 / u;
  const addPart = (name, x, y) => parts && parts.push({ name, x, y });
  const stream = (it) => [Math.sin(t * 0.5 + it.id * 1.7) * 0.012, Math.cos(t * 0.43 + it.id * 2.3) * 0.012];

  // photosynthetic membranes of bacteria: concentric thylakoid lines
  if (P.thylakoid > 0.05 && lod >= 2) {
    ctx.lineWidth = 1.1 * px; ctx.strokeStyle = hsl(160, 45, 38, 0.35 + 0.5 * P.thylakoid);
    for (let k = 0; k < Math.ceil(P.thylakoid * 3); k++) { trace(ctx, pts, 0.9 - k * 0.1); ctx.stroke(); }
    addPart('Thylakoid membranes', pts[Math.floor(pts.length * 0.62)].x * 0.85, pts[Math.floor(pts.length * 0.62)].y * 0.85);
  }
  // chloroplast cup (one big plastid, Chlamydomonas style)
  if (P.plastids === 1) {
    const N = pts.length, i0 = Math.floor(N * 0.2), i1 = Math.floor(N * 0.97);
    const outer = [], inner = [];
    for (let i = i0; i <= i1; i++) {
      const p = pts[i % N], f = 0.9 - 0.05 * Math.sin((i - i0) / (i1 - i0) * Math.PI);
      outer.push({ x: p.x * f, y: p.y * f });
      const w = 0.7 - 0.3 * Math.pow(Math.abs((i - i0) / (i1 - i0) - 0.5) * 2, 2);
      inner.push({ x: p.x * w, y: p.y * w });
    }
    ctx.beginPath(); ctx.moveTo(outer[0].x, outer[0].y);
    outer.forEach((p) => ctx.lineTo(p.x, p.y));
    for (let k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k].x, inner[k].y);
    ctx.closePath();
    { const cg = ctx.createRadialGradient(0, 0, 0.1, 0, 0, Math.max(P.a, P.b)); cg.addColorStop(0, 'hsl(96,50%,44%)'); cg.addColorStop(1, 'hsl(100,60%,60%)'); ctx.fillStyle = cg; }
    ctx.fill();
    ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'hsl(110,50%,30%)'; ctx.stroke();
    if (lod >= 2) {                                                    // thylakoid lamellae follow the cup
      ctx.lineWidth = 0.9 * px; ctx.strokeStyle = 'hsla(120,55%,24%,0.55)';
      for (let m = 1; m <= 4; m++) {
        const f = m / 5; ctx.beginPath();
        outer.forEach((p, k) => { const x = p.x + (inner[k].x - p.x) * f, y = p.y + (inner[k].y - p.y) * f; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
      const pm = Math.floor(outer.length * 0.32);                      // pyrenoid
      const px0 = (outer[pm].x * 0.55 + inner[pm].x * 0.45), py0 = (outer[pm].y * 0.55 + inner[pm].y * 0.45);
      ctx.beginPath(); ctx.arc(px0, py0, 0.085 * P.size + 0.03, 0, TAU); ctx.fillStyle = 'hsl(95,40%,88%)'; ctx.fill();
      ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'hsl(110,50%,32%)'; ctx.stroke();
    }
    const m = Math.floor(outer.length * 0.55); addPart('Chloroplast', (outer[m].x + inner[m].x) / 2, (outer[m].y + inner[m].y) / 2);
  }
  let labelled = {};
  const label = (name, it) => { if (!labelled[name]) { labelled[name] = 1; addPart(name, it.x, it.y); } };

  // nucleus drawn first so other organelles overlap its rim naturally
  for (const it of L.items) {
    const [dx, dy] = stream(it); const x = it.x + dx, y = it.y + dy;
    switch (it.type) {
      case 'nucleus': {
        const dup = state.div > 0.4 ? 1 : 0;
        const draw1 = (cx, cy, r) => {
          if (P.cilia > 0.5 && lod >= 2) {                                // ciliate macronucleus: bean shape
            ctx.beginPath(); ctx.ellipse(cx, cy, r * 1.15, r * 0.8, it.rot * 0.2, 0, TAU);
            ctx.fillStyle = hsl(310, 78, 52); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + r * 0.1, cy - r * 0.62, r * 0.28, 0, TAU); ctx.fillStyle = hsl(310, 80, 46); ctx.fill();
            ctx.lineWidth = 1 * px; ctx.strokeStyle = hsl(310, 70, 36); ctx.stroke();
            if (lod >= 3) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.25, r * 0.4, r * 0.18, -0.4, 0, TAU); ctx.fill(); }
          } else {
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
            if (lod >= 2) { const ng = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r); ng.addColorStop(0, pal.nucLight); ng.addColorStop(0.55, pal.nuc); ng.addColorStop(1, pal.nucDark); ctx.fillStyle = ng; } else ctx.fillStyle = pal.nuc;
            ctx.fill();
            ctx.lineWidth = 1.5 * px; ctx.strokeStyle = pal.nucDark; ctx.stroke();
            if (lod >= 3) { ctx.fillStyle = 'rgba(255,255,255,0.75)'; for (let k = 0; k < 16; k++) { const an = (k / 16) * TAU; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * r, cy + Math.sin(an) * r, 0.9 * px, 0, TAU); ctx.fill(); } }
            if (lod >= 2) {
              ctx.beginPath(); ctx.arc(cx, cy, r * 0.97, 0, TAU); ctx.lineWidth = 1.1 * px; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
              ctx.beginPath(); ctx.arc(cx + r * 0.1, cy + r * 0.05, r * 0.36, 0, TAU); ctx.fillStyle = pal.nucDark; ctx.fill();   // nucleolus
              ctx.beginPath(); ctx.arc(cx + r * 0.2, cy - r * 0.1, r * 0.14, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
            }
            if (lod >= 3) {                                               // chromatin speckles
              const rr = mulberry32(it.id + 5);
              ctx.fillStyle = pal.nucLight;
              for (let k = 0; k < 14; k++) { const an = rr() * TAU, d = (0.45 + 0.5 * rr()) * r; ctx.beginPath(); ctx.arc(cx + Math.cos(an) * d, cy + Math.sin(an) * d, r * 0.045, 0, TAU); ctx.fill(); }
            }
          }
        };
        if (dup) { draw1(x - P.a * 0.28 * state.div, y, it.r * 0.7); draw1(x + P.a * 0.28 * state.div, y, it.r * 0.7); }
        else draw1(x, y, it.r);
        label(P.cilia > 0.5 ? 'Macronucleus' : 'Nucleus', it); break;
      }
      case 'vacuole': {
        ctx.beginPath(); ctx.arc(x, y, it.r, 0, TAU);
        { const vg = ctx.createRadialGradient(x - it.r * 0.3, y - it.r * 0.35, it.r * 0.05, x, y, it.r); vg.addColorStop(0, 'hsla(195,80%,96%,0.98)'); vg.addColorStop(1, 'hsla(205,70%,80%,0.95)'); ctx.fillStyle = vg; }
        ctx.fill(); ctx.lineWidth = 1.3 * px; ctx.strokeStyle = 'hsla(200,45%,62%,0.9)'; ctx.stroke();
        if (lod >= 2) { ctx.beginPath(); ctx.arc(x - it.r * 0.25, y - it.r * 0.3, it.r * 0.55, Math.PI * 1.1, Math.PI * 1.65); ctx.lineWidth = 1.6 * px; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.stroke(); }
        label('Vacuole', it); break;
      }
      case 'cvac': {
        const pulse = 0.72 + 0.28 * Math.sin(t * 1.6 + it.phase);
        const r = it.r * pulse;
        if (lod >= 2) {                                                   // radiating canals
          ctx.strokeStyle = hsl(24, 90, 55); ctx.lineCap = 'round';
          for (let k = 0; k < 8; k++) {
            const an = (k / 8) * TAU + it.rot, l = it.r * (1.5 + 0.5 * Math.sin(k * 2.3));
            ctx.lineWidth = 1.5 * px; ctx.beginPath(); ctx.moveTo(x + Math.cos(an) * r * 0.9, y + Math.sin(an) * r * 0.9);
            ctx.quadraticCurveTo(x + Math.cos(an + 0.2) * l * 0.7, y + Math.sin(an + 0.2) * l * 0.7, x + Math.cos(an + 0.1) * l, y + Math.sin(an + 0.1) * l); ctx.stroke();
          }
        }
        ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, TAU); ctx.fillStyle = hsl(24, 92, 56); ctx.fill();
        if (lod >= 3) { ctx.beginPath(); ctx.arc(x - r * 0.2, y - r * 0.25, r * 0.28, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(); }
        label('Contractile vacuole', it); break;
      }
      case 'plastid': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(it.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, it.r * 1.55, it.r * 0.62, 0, 0, TAU);
        { const pg = ctx.createLinearGradient(0, -it.r * 0.62, 0, it.r * 0.62); pg.addColorStop(0, 'hsl(92,62%,64%)'); pg.addColorStop(1, 'hsl(86,56%,42%)'); ctx.fillStyle = pg; }
        ctx.fill(); ctx.lineWidth = 1.1 * px; ctx.strokeStyle = 'hsl(100,50%,28%)'; ctx.stroke();
        if (lod >= 3) {                                                   // grana: little stacks of discs
          for (let k = -1; k <= 1; k++) for (let d = 0; d < 3; d++) { ctx.beginPath(); ctx.ellipse(it.r * 0.5 * k, (d - 1) * it.r * 0.17, it.r * 0.17, it.r * 0.065, 0, 0, TAU); ctx.fillStyle = 'hsl(100,55%,30%)'; ctx.fill(); }
        }
        ctx.restore(); label('Chloroplast', it); break;
      }
      case 'golgi': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(it.rot);
        const bands = lod >= 2 ? 5 : 3;
        for (let k = 0; k < bands; k++) {
          const o = (k - (bands - 1) / 2) * it.r * 0.3, w = it.r * (0.95 - 0.1 * Math.abs(k - (bands - 1) / 2));
          ctx.beginPath(); ctx.moveTo(-w, o + it.r * 0.18); ctx.quadraticCurveTo(0, o - it.r * 0.28, w, o + it.r * 0.18);
          ctx.lineWidth = Math.max(1.8 * px, it.r * 0.16); ctx.lineCap = 'round'; ctx.strokeStyle = k % 2 ? hsl(215, 70, 66) : hsl(255, 55, 68); ctx.stroke();
        }
        if (lod >= 3) { ctx.fillStyle = hsl(215, 70, 70); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(it.r * (1.1 + 0.15 * k), it.r * (0.3 - 0.25 * k), it.r * 0.09, 0, TAU); ctx.fill(); } }
        ctx.restore(); label('Golgi apparatus', it); break;
      }
      case 'mito': {
        ctx.save(); ctx.translate(x, y); ctx.rotate(it.rot);
        const w = it.r * 1.5 * it.len, h = it.r * 0.78;
        ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, TAU);
        { const mg = ctx.createLinearGradient(0, -h, 0, h); mg.addColorStop(0, hsl(350, 85, 90)); mg.addColorStop(1, hsl(350, 75, 74)); ctx.fillStyle = mg; }
        ctx.fill(); ctx.lineWidth = 1.1 * px; ctx.strokeStyle = hsl(345, 60, 55); ctx.stroke();
        if (lod >= 3) { ctx.beginPath(); ctx.ellipse(0, 0, w * 0.82, h * 0.7, 0, 0, TAU); ctx.lineWidth = 0.7 * px; ctx.strokeStyle = hsl(345, 60, 62, 0.6); ctx.stroke(); }   // inner membrane
        if (lod >= 3) {                                                   // cristae
          ctx.beginPath(); ctx.moveTo(-w * 0.7, 0);
          for (let k = 0; k < 6; k++) ctx.lineTo(-w * 0.7 + (k + 0.5) * w * 0.23, (k % 2 ? 1 : -1) * h * 0.55);
          ctx.lineTo(w * 0.7, 0); ctx.lineWidth = 0.9 * px; ctx.strokeStyle = hsl(345, 65, 58); ctx.stroke();
        } else if (lod >= 2) { ctx.beginPath(); ctx.moveTo(-w * 0.6, 0); ctx.lineTo(w * 0.6, 0); ctx.lineWidth = 0.9 * px; ctx.strokeStyle = hsl(345, 65, 58); ctx.stroke(); }
        ctx.restore(); label('Mitochondrion', it); break;
      }
      case 'fv': {
        if (it.slot >= (state.fv || 0)) break;
        ctx.beginPath(); ctx.arc(x, y, it.r, 0, TAU); ctx.fillStyle = 'hsla(75,70%,86%,0.95)'; ctx.fill();
        ctx.lineWidth = 1.2 * px; ctx.strokeStyle = 'hsl(85,55%,42%)'; ctx.stroke();
        if (lod >= 2) { ctx.fillStyle = 'hsl(95,60%,48%)'; const rr = mulberry32(it.id * 31); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(x + (rr() - 0.5) * it.r, y + (rr() - 0.5) * it.r, it.r * 0.2, 0, TAU); ctx.fill(); } }
        label('Food vacuole', it); break;
      }
    }
  }
  // endoplasmic reticulum: wavy folds hugging the nucleus
  if (P.euk && L.er.length && lod >= 2) {
    const nuc = L.items[0];
    ctx.strokeStyle = hsl(205, 55, 62, 0.85); ctx.lineWidth = 1.4 * px; ctx.lineCap = 'round';
    for (const e of L.er) {
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const an = 0.4 + (k / 24) * 2.6, rr = nuc.r * (1.28 + e.o * 2 + 0.07 * Math.sin(k * 1.7 + e.ph + t * 0.5));
        const x = nuc.x + Math.cos(an) * rr, y = nuc.y + Math.sin(an) * rr;
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    addPart('Endoplasmic reticulum', nuc.x + Math.cos(2.0) * nuc.r * 1.45, nuc.y + Math.sin(2.0) * nuc.r * 1.45);
  }
  // prokaryote DNA and ribosomes
  if (!P.euk && L.nucleoid.length && lod >= 2) {
    for (const strand of L.nucleoid) {
      ctx.beginPath(); strand.forEach((p, i) => { const y = p.y + Math.sin(t * 0.7 + p.x * 3) * 0.01; i ? ctx.lineTo(p.x, y) : ctx.moveTo(p.x, y); });
      ctx.lineWidth = 2.1 * px; ctx.strokeStyle = 'hsl(245,70%,62%)'; ctx.lineJoin = 'round'; ctx.stroke();
      if (lod >= 3) { ctx.lineWidth = 0.8 * px; ctx.strokeStyle = 'hsl(245,85%,84%)'; ctx.stroke(); }
    }
    addPart('Nucleoid (DNA)', L.nucleoid[0][45].x, L.nucleoid[0][45].y);
  }
  if (lod >= 2 && L.ribo.length) {
    ctx.fillStyle = P.euk ? hsl(25, 80, 62, 0.8) : hsl(24, 90, 55);
    const rs = (P.euk ? 1.3 : 2.1) * px;
    for (const p of L.ribo) { ctx.beginPath(); ctx.arc(p.x, p.y, rs, 0, TAU); ctx.fill(); }
    if (!P.euk) addPart('Ribosomes', L.ribo[3].x, L.ribo[3].y);
  }
  // eyespot (stigma)
  if (P.eye > 0.25 && P.euk && lod >= 2) {
    const x = P.a * 0.55, y = P.b * 0.62;
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5);
    ctx.beginPath(); ctx.ellipse(0, 0, 0.1 + 0.05 * P.eye, 0.05 + 0.03 * P.eye, 0, 0, TAU); ctx.fillStyle = 'hsl(350,85%,52%)'; ctx.fill();
    ctx.lineWidth = 1 * px; ctx.strokeStyle = 'hsl(350,70%,36%)'; ctx.stroke(); ctx.restore();
    addPart('Eyespot', x, y);
  }
  // oral groove funnel
  if (P.mouth > 0.35 && P.aspect > 1.6 && lod >= 2) {
    ctx.strokeStyle = hsl(pal.h, 45, 62, 0.9); ctx.lineWidth = 2.2 * px; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(P.a * 0.0, P.b * 0.5); ctx.quadraticCurveTo(-P.a * 0.28, P.b * 0.05, -P.a * 0.45, -P.b * 0.12); ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------
// Portrait helper: draws one cell on a light "textbook" background with labelled organs.
export function drawPortrait(ctx, W, H, P, state, opts = {}) {
  ctx.save();
  ctx.fillStyle = opts.bg || '#fbfaf6'; ctx.fillRect(0, 0, W, H);
  const labels = opts.labels !== false;
  const rot = opts.rot !== undefined ? opts.rot : (P.aspect > 1.7 ? -0.5 : 0);
  // fit the rotated body (and flagella) into the free area
  const body = outline(P, 0, 64), fl = P.flagella.length ? Math.min(0.9 * P.a, Math.max(...P.flagella) * P.a * 0.8) : 0;
  const ext = body.map((p) => ({ x: p.x, y: p.y }));
  if (fl) ext.push(P.euk ? { x: P.a + fl, y: 0 } : { x: -P.a - fl, y: 0 });
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let hx = 0.3, hy = 0.3;
  for (const p of ext) { hx = Math.max(hx, Math.abs(p.x * cr - p.y * sr)); hy = Math.max(hy, Math.abs(p.x * sr + p.y * cr)); }
  const availW = W * (labels ? 0.36 : 0.46), availH = H * 0.42;
  const u = Math.min(availW / hx, availH / hy);
  const parts = [];
  ctx.save(); ctx.strokeStyle = 'rgba(120,130,150,0.07)'; ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.translate(W / 2 + 6, H / 2 + 10); ctx.scale(u, u); ctx.rotate(rot);
  trace(ctx, outline(P, state.t || 0, 64, state.div || 0)); ctx.shadowColor = 'rgba(20,30,50,0.28)'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(u, u); ctx.rotate(rot);
  drawCell(ctx, P, state, u, { lod: 3, parts });
  ctx.restore();
  if (labels) {
    const anchors = parts.map((p) => ({ name: p.name, x: W / 2 + (p.x * cr - p.y * sr) * u, y: H / 2 + (p.x * sr + p.y * cr) * u }));
    const seen = new Set(), uniq = anchors.filter((a) => (seen.has(a.name) ? false : seen.add(a.name)));
    const left = uniq.filter((a) => a.x < W / 2).sort((a, b) => a.y - b.y), right = uniq.filter((a) => a.x >= W / 2).sort((a, b) => a.y - b.y);
    const fs = Math.max(13, Math.round(W / 62));
    ctx.font = fs + 'px Georgia, serif'; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    const lay = (list, side) => {
      const gap = fs * 1.7; let ys = list.map((a) => a.y);
      for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + gap);
      const over = ys.length ? ys[ys.length - 1] - (H - 20) : 0; if (over > 0) ys = ys.map((y) => y - over);
      list.forEach((a, i) => {
        const tx = side < 0 ? 16 : W - 16, ty = Math.max(16, ys[i]), tw = ctx.measureText(a.name).width;
        ctx.strokeStyle = 'rgba(60,60,70,0.55)'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(side < 0 ? tx + tw + 8 : tx - tw - 8, ty); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(40,40,50,0.8)'; ctx.beginPath(); ctx.arc(a.x, a.y, 3, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#23252b'; ctx.textAlign = side < 0 ? 'left' : 'right'; ctx.fillText(a.name, tx, ty);
      });
    };
    lay(left, -1); lay(right, 1);
  }
  ctx.restore();
  return parts;
}


// ---------------------------------------------------------------------------------------
// Cheap renderer for the crowd (everything that is not selected): one flat body path with a wall/cilia hint,
// a nucleus dot, a few plastid dots and one stroke for all flagella. No gradients, no per-organelle detail.
export function drawSimple(ctx, P, state, u) {
  let S = P._S;
  if (!S) {
    const pal = palette(P);
    S = P._S = { pts: outline(P, 0, 16, 0), pal, plast: Math.min(3, P.plastids || (P.thylakoid > 0.3 ? 2 : 0)) };
  }
  const { pts, pal } = S, px = 1 / u, t = state.t || 0;
  if (P.flagella.length) {
    ctx.beginPath();
    const n = P.flagella.length;
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : i / (n - 1) - 0.5, L = P.flagella[i] * P.a * 0.9, w = Math.sin(t * 9 + i * 2) * 0.35 * L;
      if (P.euk) { const x0 = P.a * 0.96; ctx.moveTo(x0, 0); ctx.quadraticCurveTo(x0 + L * 0.5, w + spread * L * 0.6, x0 + L, spread * L * 0.9 - w * 0.6); }
      else { const x0 = -P.a * 0.96; ctx.moveTo(x0, spread * 0.5 * P.b); ctx.quadraticCurveTo(x0 - L * 0.5, w + spread * L * 0.6, x0 - L, spread * L - w * 0.6); }
    }
    ctx.lineWidth = 1.6 * px; ctx.strokeStyle = pal.flag; ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (P.cilia > 0.3) { ctx.lineWidth = 3.4 * px; ctx.strokeStyle = 'rgba(120,170,200,0.45)'; ctx.stroke(); }     // ciliary fuzz
  ctx.fillStyle = pal.cyto1; ctx.fill();
  ctx.lineWidth = (P.wall > 0.3 ? 2.6 : 1.3) * px; ctx.strokeStyle = P.wall > 0.3 ? pal.wall : pal.edge; ctx.stroke();
  for (let k = 0; k < S.plast; k++) { ctx.beginPath(); ctx.ellipse(-0.35 * P.a + k * 0.32 * P.a, (k % 2 ? 1 : -1) * 0.38 * P.b, Math.max(0.12, 0.22 * P.b), Math.max(0.07, 0.12 * P.b), 0, 0, TAU); ctx.fillStyle = '#7cc242'; ctx.fill(); }
  if (P.euk) { ctx.beginPath(); ctx.arc(0.08 * P.a, 0, Math.min(0.5 * P.b, P.nucleus * P.size * 1.1), 0, TAU); ctx.fillStyle = pal.nuc; ctx.fill(); }
}
