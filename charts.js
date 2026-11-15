// Small self-contained chart helper: nice axes, auto-scaling, smoothing, stacked areas and a hover readout.

function niceStep(range, target) {
  const raw = range / Math.max(1, target), mag = Math.pow(10, Math.floor(Math.log10(raw || 1))), f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}
function smoothArr(a, w) {
  if (w <= 1) return a;
  const out = new Array(a.length); let sum = 0, q = [];
  for (let i = 0; i < a.length; i++) { q.push(a[i]); sum += a[i]; if (q.length > w) sum -= q.shift(); out[i] = sum / q.length; }
  return out;
}

// cfg: { canvas, series: [{key,label,color,on}], getData: () => hist, fmt, stacked, percent, auto, smooth, logy, ymin, ymax, height }
export function makeChart(cfg) {
  const cv = cfg.canvas, ctx = cv.getContext('2d');
  let hoverX = null;
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); hoverX = e.clientX - r.left; draw(); });
  cv.addEventListener('pointerleave', () => { hoverX = null; draw(); });

  function draw() {
    const hist = cfg.getData(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect(); const W = rect.width, H = rect.height;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const L = 44, R = 10, T = 8, B = 20, pw = W - L - R, ph = H - T - B;
    const on = cfg.series.filter((s) => s.on !== false);
    if (hist.length < 2 || !on.length) { ctx.fillStyle = '#6b7f8f'; ctx.font = '12px system-ui'; ctx.fillText(hist.length < 2 ? 'collecting data…' : 'all series hidden', L, H / 2); return; }
    const sm = cfg.smooth ? cfg.smooth() : 1;
    const stacked = typeof cfg.stacked === 'function' ? cfg.stacked() : cfg.stacked;
    const vals = {}; for (const s of on) vals[s.key] = smoothArr(hist.map((p) => (p[s.key] ?? 0) * (s.scale || 1)), sm);
    const n = hist.length;
    // y-range
    let lo = Infinity, hi = -Infinity;
    if (stacked) {
      const tot = hist.map((_, i) => on.reduce((a, s) => a + vals[s.key][i], 0)); lo = 0; hi = cfg.percent ? 1 : Math.max(...tot);
    } else for (const s of on) for (const v of vals[s.key]) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const auto = cfg.auto ? cfg.auto() : true;
    if (cfg.percent && !auto) { lo = 0; hi = 1; }
    else if (!stacked) { const pad = (hi - lo) * 0.12 || Math.max(0.05, Math.abs(hi) * 0.1); lo = cfg.floor0 ? Math.max(0, lo - pad) : lo - pad; hi += pad; if (cfg.percent) { lo = Math.max(0, lo); hi = Math.min(1.02, hi); if (hi - lo < 0.04) hi = lo + 0.04; } }
    if (stacked && !cfg.percent) hi *= 1.08;
    if (!(hi > lo)) hi = lo + 1;
    const X = (i) => L + (i / (n - 1)) * pw, Y = (v) => T + ph * (1 - (v - lo) / (hi - lo));
    // grid + y ticks
    const step = niceStep(hi - lo, 4), fmt = cfg.fmt || ((v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : +v.toFixed(2)));
    ctx.font = '11px system-ui'; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) {
      const y = Y(v); ctx.strokeStyle = '#1d2c38'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
      ctx.fillStyle = '#7b90a1'; ctx.fillText(cfg.percent ? Math.round(v * 100) + '%' : fmt(v), L - 6, y);
    }
    // x ticks (simulation ticks)
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    const t0 = hist[0].t, t1 = hist[n - 1].t, xs = niceStep(t1 - t0, 5);
    for (let t = Math.ceil(t0 / xs) * xs; t <= t1; t += xs) { const x = L + ((t - t0) / (t1 - t0)) * pw; ctx.fillStyle = '#7b90a1'; ctx.fillText(t >= 1000 ? (t / 1000) + 'k' : t, x, H - B + 4); ctx.strokeStyle = '#16242f'; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); }
    if (stacked) {
      const base = new Array(n).fill(0); const tot = hist.map((_, i) => on.reduce((a, s) => a + vals[s.key][i], 0));
      for (const s of on) {
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const v = base[i] + vals[s.key][i] / (cfg.percent ? (tot[i] || 1) : 1); i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)); }
        for (let i = n - 1; i >= 0; i--) ctx.lineTo(X(i), Y(base[i]));
        ctx.closePath(); ctx.fillStyle = s.color + 'cc'; ctx.fill();
        for (let i = 0; i < n; i++) base[i] += vals[s.key][i] / (cfg.percent ? (tot[i] || 1) : 1);
      }
    } else {
      for (const s of on) {
        ctx.beginPath(); ctx.strokeStyle = s.color; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
        vals[s.key].forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
      }
    }
    // hover readout
    if (hoverX !== null && hoverX >= L && hoverX <= W - R) {
      const i = Math.round(((hoverX - L) / pw) * (n - 1));
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(X(i), T); ctx.lineTo(X(i), T + ph); ctx.stroke();
      const lines = on.map((s) => [s.label, s.color, cfg.percent && !stacked ? Math.round(vals[s.key][i] * 100) + '%' : fmt(vals[s.key][i])]);
      ctx.font = '11px system-ui'; const tw = Math.max(...lines.map((l) => ctx.measureText(l[0] + '  ' + l[2]).width)) + 26, th = lines.length * 15 + 20;
      let bx = X(i) + 10; if (bx + tw > W - 4) bx = X(i) - tw - 10;
      ctx.fillStyle = 'rgba(8,16,22,0.94)'; ctx.strokeStyle = '#2b3f4e'; ctx.beginPath(); ctx.roundRect(bx, T + 4, tw, th, 6); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#9fb2c0'; ctx.fillText('tick ' + hist[i].t, bx + 8, T + 15);
      lines.forEach((l, k) => { const y = T + 30 + k * 15; ctx.fillStyle = l[1]; ctx.fillRect(bx + 8, y - 4, 8, 8); ctx.fillStyle = '#dfe9f0'; ctx.fillText(l[0] + '  ' + l[2], bx + 20, y); });
    }
  }
  return { draw };
}
