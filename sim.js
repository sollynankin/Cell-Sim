// Ecosystem for evolving cells. There is no "reproduction rate" or "fitness" anywhere: every
// cell gains energy from light, dissolved nutrients or prey, pays for every organelle it has
// and for moving, grows by banking the surplus, and divides when its biomass has doubled.
// Selection is whatever those costs and benefits imply in this environment.
import { mulberry32, clamp, develop, mutate, archetype, cloneGenome, describe } from './genome.js';

// Tunable physics constants (energy units per tick). Calibrated so simple cells are viable.
export const K = { uptake: 0.022, photo: 0.035, base: 0.005, gene: 0.0002, nucleus: 0.012, mito: 0.004, golgi: 0.002, er: 0.003,
  plastid: 0.002, thyl: 0.002, vac: 0.002, cvac: 0.002, eye: 0.001, sense: 0.003, pili: 0.002, wall: 0.0006, cilia: 0.0015,
  mouth: 0.0008, move: 0.0015, flag: 0.001 };
export const U = 16;                                   // pixels per body-length unit

const TWO_PI = Math.PI * 2;

export class Cell {
  constructor(id, genome, x, y, parent) {
    this.id = id; this.g = genome; this.P = develop(genome);
    this.x = x; this.y = y; this.ang = Math.random() * TWO_PI; this.vx = 0; this.vy = 0;
    this.parent = parent ? parent.id : 0; this.gen = parent ? parent.gen + 1 : 0; this.lin = parent ? parent.lin : id;
    this.anc = []; this.age = 0; this.kids = 0; this.kills = 0; this.fv = 0; this.divT = 0; this.muts = [];
    this.alive = true; this.cause = '';
    this.setScale();
  }
  setScale() {
    const P = this.P;
    this.area = Math.PI * P.a * P.b;                                     // body area in unit^2
    this.perim = TWO_PI * Math.sqrt((P.a * P.a + P.b * P.b) / 2) * (P.lobe > 0.1 ? 1 + 0.6 * P.lobe : 1);
    this.B0 = 6 * this.area;                                              // birth biomass (energy units)
    this.B = this.B0 * 1.0; this.energy = this.B0 * 0.5;
    this.sc = 1;
    // locomotion drive derived from the machinery the cell actually has
    let thrust = 0;
    for (const L of P.flagella) thrust += 0.55 * Math.pow(L, 0.8);
    thrust += P.cilia * this.perim * 0.18;
    thrust += P.lobe * P.flex * 0.5;                                      // crawling
    this.thrust = thrust;
    this.drag = 0.6 + P.size * (1 + 0.15 * (P.aspect - 1));
  }
  get r() { return Math.max(P_r(this.P), 0) * this.sc * U; }              // px radius for contact tests
}
const P_r = (P) => Math.sqrt(P.a * P.b);

export class Sim {
  constructor(opts = {}) {
    this.W = opts.W || 1800; this.H = opts.H || 1100;
    this.gw = Math.round(this.W / 20); this.gh = Math.round(this.H / 20);
    this.params = { light: 1, nutrient: 1, hypo: 0.35, mutation: 0.04, maxPop: 900, ...opts.params };
    this.seed = opts.seed ?? 1; this.reset(opts.mode || 'mixed');
  }

  reset(mode = 'mixed') {
    this.rng = mulberry32(this.seed);
    this.tick = 0; this.nextId = 1; this.cells = []; this.hist = []; this.events = [];
    this.mutCounts = { point: 0, regulatory: 0, duplication: 0, deletion: 0, insertion: 0 };
    this.deaths = { starved: 0, eaten: 0, lysed: 0 };
    this.flow = this.newFlow(); this.totalBirths = 0;
    this.nut = new Float32Array(this.gw * this.gh).fill(0.35);
    this.nut2 = new Float32Array(this.gw * this.gh);
    this.vents = [0.18, 0.42, 0.66, 0.88].map((f) => ({ x: f * this.W, y: this.H * 0.94 }));
    const mix = opts_mix(mode) || {
      mixed: [['Bacterium', 40], ['Cyanobacterium', 36], ['Proto-cell', 20], ['Yeast-like', 10], ['Chlamydomonas-like', 8], ['Euglena-like', 6], ['Amoeba-like', 6], ['Paramecium-like', 4]],
      primordial: [['Proto-cell', 80]],
      bacteria: [['Bacterium', 50], ['Cyanobacterium', 40]],
    }[mode] || [];
    for (const [name, n] of mix) for (let i = 0; i < n; i++) this.spawn(archetype(name), null, this.rng() * this.W, this.rng() * this.H * 0.9);
    this.gridInit = true;
  }

  newFlow() { return { photo: 0, uptake: 0, prey: 0, births: 0, starved: 0, eaten: 0, lysed: 0 }; }

  spawn(genome, parent, x, y) {
    const c = new Cell(this.nextId++, genome, x, y, parent);
    c.ang = this.rng() * TWO_PI;
    this.cells.push(c); return c;
  }

  // --- environment ---------------------------------------------------------------------
  light(x, y) {
    const d = clamp(1 - y / (this.H * 0.88), 0, 1);
    return this.params.light * Math.pow(d, 1.15) * (0.88 + 0.12 * Math.sin(x / 190 + this.tick / 2600));
  }
  gi(x, y) { return clamp((y / 20) | 0, 0, this.gh - 1) * this.gw + clamp((x / 20) | 0, 0, this.gw - 1); }
  nutAt(x, y) { return this.nut[this.gi(x, y)]; }

  stepGrid() {
    const { gw, gh, nut, nut2 } = this;
    const D = 0.22;
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x, c = nut[i];
      const l = nut[y * gw + (x > 0 ? x - 1 : x)], r = nut[y * gw + (x < gw - 1 ? x + 1 : x)];
      const u = nut[(y > 0 ? y - 1 : y) * gw + x], d = nut[(y < gh - 1 ? y + 1 : y) * gw + x];
      nut2[i] = c + D * (l + r + u + d - 4 * c);
    }
    this.nut = nut2; this.nut2 = nut;
    const infl = 0.09 * this.params.nutrient;
    for (const v of this.vents) {                                           // hydrothermal-style vents feed the bottom
      for (let k = -1; k <= 1; k++) { const i = this.gi(v.x + k * 20, v.y); this.nut[i] = Math.min(1, this.nut[i] + infl); }
    }
    const n = this.nut;
    for (let i = 0; i < n.length; i++) n[i] *= 0.9996;                      // slow chemical loss
  }

  // Energy ledger for one cell at given local nutrient and light. Everything derives from the phenotype.
  // Pass `out` to also receive an itemised breakdown (used by the inspector; the hot path allocates nothing extra).
  ledger(c, nutL, L, out) {
    const P = c.P, sc = c.sc, S = c.perim * sc, A = c.area * sc * sc;
    const perm = 1 / (1 + 0.7 * P.wall);
    const eff = 0.55 + 0.4 * (1 - Math.exp(-0.45 * P.mito));                 // mitochondria extract more per nutrient
    const stir = 1 + 0.5 * Math.min(1, c.thrust * 0.12);                     // beating moves fresh medium past the cell
    const up = Math.min(K.uptake * S * nutL * perm * eff * stir, nutL * 5);
    const cap = P.plastids ? 1 - Math.exp(-0.5 * P.plastids) : 0.45 * P.thylakoid;
    const photo = cap > 0 ? K.photo * L * cap * Math.pow(A, 0.9) * (1 - 0.35 * Math.min(1, P.wall)) : 0;
    const base = K.base * Math.pow(A, 0.75) * (0.6 + 0.4 * P.growth), genes = K.gene * P.genes;
    const nucleus = P.euk ? K.nucleus : 0, mito = K.mito * P.mito, golgi = K.golgi * P.golgi, er = K.er * P.er;
    const plastid = K.plastid * P.plastids + K.thyl * P.thylakoid * A, vac = K.vac * P.vacuole, cvac = K.cvac * P.cvac;
    const senses = K.eye * P.eye + K.sense * P.sense + K.pili * P.pili;
    const wall = K.wall * P.wall * S, cilia = K.cilia * P.cilia * S, mouth = K.mouth * P.mouth * A;
    const moving = c.thrust > 0.05;
    const move = moving ? K.move * c.thrust * c.thrust + K.flag * P.flagella.length : 0;
    const cost = base + genes + nucleus + mito + golgi + er + plastid + vac + cvac + senses + wall + cilia + mouth + move;
    if (out) {
      out.up = up; out.photo = photo; out.cap = cap; out.eff = eff;
      out.items = { 'Basic upkeep (size)': base, 'DNA maintenance': genes, 'Nucleus': nucleus, 'Mitochondria': mito, 'Golgi + ER': golgi + er, 'Chloroplasts / thylakoids': plastid,
        'Vacuoles': vac, 'Contractile vacuole pumps': cvac + (P.cvac ? 0.004 * P.cvac * this.params.hypo : 0), 'Senses and pili': senses, 'Cell wall': wall, 'Cilia': cilia, 'Mouth': mouth, 'Swimming': move };
    }
    return { up, photo, cost, cap, eff, moving };
  }

  // --- one tick ------------------------------------------------------------------------
  step() {
    this.tick++;
    if (this.tick % 2 === 0) this.stepGrid();
    const rng = this.rng, { W, H } = this, par = this.params;
    // spatial hash for contacts and prey search
    const CS = 64, hw = Math.ceil(W / CS), hh = Math.ceil(H / CS);
    const hash = new Map();
    for (const c of this.cells) {
      const k = ((c.y / CS) | 0) * hw + ((c.x / CS) | 0);
      let a = hash.get(k); if (!a) hash.set(k, (a = [])); a.push(c);
    }
    const near = (c, R, fn) => {
      const cx = (c.x / CS) | 0, cy = (c.y / CS) | 0, n = Math.ceil(R / CS);
      for (let yy = Math.max(0, cy - n); yy <= Math.min(hh - 1, cy + n); yy++) for (let xx = Math.max(0, cx - n); xx <= Math.min(hw - 1, cx + n); xx++) {
        const a = hash.get(yy * hw + xx); if (a) for (const o of a) if (o !== c && o.alive) fn(o);
      }
    };
    // self-shading: light falls off with the biomass above a cell in its column
    if (this.tick % 3 === 1) {
      const gw = this.gw, gh = this.gh, area = this.shadeA || (this.shadeA = new Float32Array(gw * gh));
      area.fill(0);
      for (const c of this.cells) area[this.gi(c.x, c.y)] += c.area * c.sc * c.sc;
      const sh = this.shade || (this.shade = new Float32Array(gw * gh));
      for (let x = 0; x < gw; x++) {
        let cum = 0;
        for (let y = 0; y < gh; y++) { const i = y * gw + x; sh[i] = Math.exp(-0.05 * cum); cum += area[i] + 0.3 * (area[i - (x > 0 ? 1 : 0)] + area[i + (x < gw - 1 ? 1 : 0)]); }
      }
    }
    const newborn = [];
    for (const c of this.cells) {
      if (!c.alive) continue;
      const P = c.P;
      c.age++;
      const sc = c.sc, S = c.perim * sc, A = c.area * sc * sc;
      const gi = this.gi(c.x, c.y), nutL = this.nut[gi];
      const L = this.light(c.x, c.y) * (this.shade ? this.shade[gi] : 1);
      const led = this.ledger(c, nutL, L);
      this.nut[gi] -= led.up / 6;
      let gain = led.up + led.photo, cost = led.cost;
      this.flow.uptake += led.up; this.flow.photo += led.photo;
      const cap = led.cap, eff = led.eff, moving = led.moving;
      // osmotic stress: thin walls without contractile vacuoles burst in dilute water
      const protect = 0.15 + 0.7 * P.wall + 0.3 * P.cvac + 0.2 * P.vacuole;
      const stress = par.hypo - protect;
      if (P.cvac) cost += 0.004 * P.cvac * par.hypo;
      if (stress > 0.15 && rng() < 0.01 * stress * stress) { this.kill(c, 'lysed'); continue; }
      // ------ steering and motion ------
      let tx = 0, ty = 0, have = false;
      if (P.sense > 0.02) {
        // photo-sensing cells climb the light gradient, others climb nutrients
        if (P.eye > 0.25 && cap > 0.05) { tx = 0; ty = -1; have = L < 0.85; }
        else {
          const gx = this.nutAt(c.x + 20, c.y) - this.nutAt(c.x - 20, c.y), gy = this.nutAt(c.x, c.y + 20) - this.nutAt(c.x, c.y - 20);
          if (gx * gx + gy * gy > 1e-6) { tx = gx; ty = gy; have = true; }
        }
      }
      let preyT = null;
      if (P.mouth > 0.3) {
        let best = 1e9; const reach = (c.r + 40 + 90 * P.sense) ;
        near(c, reach, (o) => {
          if (o.area * o.sc * o.sc < 0.55 * A) { const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < best) { best = d; preyT = o; } }
        });
        if (preyT && P.sense > 0.02) { tx = preyT.x - c.x; ty = preyT.y - c.y; have = true; }
      }
      if (have) {
        const want = Math.atan2(ty, tx); let d = want - c.ang; d = Math.atan2(Math.sin(d), Math.cos(d));
        c.ang += clamp(d, -0.14, 0.14) * Math.min(1, 0.3 + P.sense);
      } else c.ang += (rng() - 0.5) * 0.35;
      const sp = (moving ? c.thrust / c.drag : 0);
      const dBrown = Math.sqrt(2 * (0.18 / c.drag));
      c.vx = Math.cos(c.ang) * sp + (rng() - 0.5) * 2 * dBrown;
      c.vy = Math.sin(c.ang) * sp + (rng() - 0.5) * 2 * dBrown + 0.05 * P.size * (1 - 0.75 * P.vacuole);   // dense cells sink; vacuoles give buoyancy
      c.x += c.vx; c.y += c.vy;
      if (c.x < 4) { c.x = 4; c.ang = Math.PI - c.ang; } else if (c.x > W - 4) { c.x = W - 4; c.ang = Math.PI - c.ang; }
      if (c.y < 4) { c.y = 4; c.ang = -c.ang; } else if (c.y > H - 4) { c.y = H - 4; c.ang = -c.ang; }
      // ------ predation by contact ------
      if (preyT && preyT.alive) {
        const d = Math.hypot(preyT.x - c.x, preyT.y - c.y);
        if (d < c.r + preyT.r * 0.4) {
          const p = (P.mouth * (0.5 + 0.5 * P.flex + 0.3 * P.cilia)) / (1 + 2.2 * preyT.P.wall);
          if (rng() < p) {
            const e = preyT.B * 0.8 * eff;
            gain += e; this.flow.prey += e; c.fv = Math.min(4, c.fv + 1); c.kills++;
            this.kill(preyT, 'eaten');
          }
        }
      }
      // ------ ledger ------
      c.energy += gain - cost;
      c.fv = Math.max(0, c.fv - 0.0015);
      c.lastGain = gain; c.lastCost = cost;
      if (c.energy <= 0) { this.kill(c, 'starved'); continue; }
      // bank surplus into biomass; the reserve is kept for lean times
      const reserve = 0.45 * c.B;
      if (c.energy > reserve && c.divT === 0) {
        const inv = Math.min(c.energy - reserve, 0.02 * P.growth * c.B0 * 0.25 + 0.01);
        c.energy -= inv; c.B += inv * 0.8;
        c.sc = Math.sqrt(c.B / c.B0);
      }
      if (c.B >= 2 * c.B0 && c.divT === 0) c.divT = 1;
      if (c.divT > 0) {
        c.divT++;
        if (c.divT > 70 && this.cells.length + newborn.length < par.maxPop) { this.divide(c, newborn); }
        else if (c.divT > 70) c.divT = 1;                                    // crowded: stay pinched, wait for space
      }
      c.beat = clamp(0.4 + sp * 0.5, 0, 1);
    }
    // soft contact repulsion keeps cells from stacking
    for (const c of this.cells) {
      if (!c.alive) continue;
      near(c, c.r + 30, (o) => {
        if (o.id < c.id) return;
        const dx = o.x - c.x, dy = o.y - c.y, d = Math.hypot(dx, dy) || 0.01, m = (c.r + o.r) * 0.55;
        if (d < m) { const f = (m - d) * 0.12 / d; c.x -= dx * f; c.y -= dy * f; o.x += dx * f; o.y += dy * f; }
      });
    }
    for (const n of newborn) this.cells.push(n);
    this.cells = this.cells.filter((c) => c.alive);
    if (this.tick % 30 === 0) this.record();
  }

  kill(c, cause) {
    if (!c.alive) return;
    c.alive = false; c.cause = cause; this.deaths[cause]++; this.flow[cause]++;
    if (cause !== 'eaten') { const i = this.gi(c.x, c.y); this.nut[i] = Math.min(1, this.nut[i] + c.B / 40); }   // recycling
  }

  divide(c, out) {
    const P = c.P, rng = this.rng;
    const rate = this.params.mutation * (1 + 4 * P.mutator);
    const ax = Math.cos(c.ang), ay = Math.sin(c.ang), off = c.r * 0.6;
    const half = c.energy / 2;
    c.alive = false;                                                         // the mother becomes two daughters
    for (let k = 0; k < 2; k++) {
      const log = [];
      const g = k === 0 ? cloneGenome(c.g) : mutate(c.g, rate, rng, log);    // one copy errs; the other is the "original strand"
      const g2 = k === 0 ? mutate(g, rate * 0.5, rng, log) : g;
      const d = new Cell(this.nextId++, g2, c.x + ax * off * (k ? 1 : -1), c.y + ay * off * (k ? 1 : -1), c);
      d.ang = c.ang + (rng() - 0.5); d.energy = half; d.muts = log;
      for (const m of log) this.mutCounts[m.type]++;
      d.anc = [{ id: c.id, gen: c.gen, muts: (c.muts || []).slice(0, 6).map((m) => m.type + ' ' + m.kind) }, ...(c.anc || [])].slice(0, 24);
      c.kids++; this.flow.births++; this.totalBirths++;
      out.push(d);
    }
  }

  // --- statistics ----------------------------------------------------------------------
  record() {
    const cs = this.cells, n = cs.length || 1;
    const f = (fn) => cs.filter(fn).length / n;
    const fl = this.flow, inc = fl.photo + fl.uptake + fl.prey || 1;
    const plans = new Map();
    for (const c of cs) { const k = describe(c.P); plans.set(k, (plans.get(k) || 0) + 1); }
    let H = 0; for (const v of plans.values()) { const p = v / n; H -= p * Math.log(p); }
    let maxGen = 0, bio = 0, eFrac = 0, age = 0, mrate = 0, nutSum = 0;
    for (const c of cs) { if (c.gen > maxGen) maxGen = c.gen; bio += c.B; eFrac += c.energy / c.B; age += c.age; mrate += this.params.mutation * (1 + 4 * c.P.mutator); }
    for (let i = 0; i < this.nut.length; i++) nutSum += this.nut[i];
    this.hist.push({
      t: this.tick, n: cs.length,
      euk: f((c) => c.P.euk), photo: f((c) => c.P.plastids || c.P.thylakoid > 0.3), flag: f((c) => c.P.flagella.length > 0),
      cilia: f((c) => c.P.cilia > 0.3), wall: f((c) => c.P.wall > 0.5), mouth: f((c) => c.P.mouth > 0.3), amoeba: f((c) => c.P.lobe > 0.3),
      size: cs.reduce((s, c) => s + c.P.size, 0) / n, genes: cs.reduce((s, c) => s + c.P.genes, 0) / n,
      // energy sources this window (share of all income) and demography
      srcLight: fl.photo / inc, srcNut: fl.uptake / inc, srcPrey: fl.prey / inc,
      births: fl.births, starved: fl.starved, eaten: fl.eaten, lysed: fl.lysed,
      plans: plans.size, diversity: Math.exp(H), maxGen, biomass: bio, energyFrac: eFrac / n, meanAge: age / n, mutRate: mrate / n,
      nutrient: nutSum / this.nut.length, speed: cs.reduce((s, c) => s + (c.thrust > 0.05 ? c.thrust / c.drag : 0), 0) / n,
    });
    this.flow = this.newFlow();
    if (this.hist.length > 1500) this.hist.shift();
  }

  summary() {
    const cs = this.cells;
    return { tick: this.tick, n: cs.length, deaths: { ...this.deaths }, muts: { ...this.mutCounts }, last: this.hist[this.hist.length - 1] };
  }
}

function opts_mix(mode) { return Array.isArray(mode) ? { custom: mode }.custom : null; }
