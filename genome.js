// Genome -> body plan. Every visible structure (nucleus, plastids, flagella, cilia, walls...)
// is produced by develop() from genes. Nothing here names a "species".
// A genome is a list of genes {id, k: kind, v: amplitude, x: expression}. Genes of the same
// kind add up, so duplication adds dosage and a copy can then drift on its own.

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export const KINDS = [
  'size', 'elong', 'taper', 'box', 'lobe', 'flex', 'hue', 'wall',
  'nucleus', 'mito', 'chloro', 'vacuole', 'cvac', 'golgi', 'er',
  'flag', 'cilia', 'pili', 'eye', 'mouth', 'sense', 'growth', 'mutator',
];

let nextGeneId = 1;
export const gene = (k, v, x = 1) => ({ id: nextGeneId++, k, v, x });
export const cloneGenome = (g) => g.map((q) => ({ ...q }));

const sum = (g, k) => { let s = 0; for (const q of g) if (q.k === k) s += q.v * q.x; return s; };

// ---------------------------------------------------------------------------------------
export function develop(g) {
  const P = {};
  const grow = 0.5 + sum(g, 'growth');
  P.growth = clamp(grow, 0.15, 2.5);
  P.size = clamp(0.55 + sum(g, 'size') + 0.12 * (P.growth - 1), 0.35, 3.2);   // pleiotropy: growth gene adds size
  P.aspect = 1 + 2.5 * clamp(sum(g, 'elong'), 0, 1.6);
  P.a = P.size * Math.sqrt(P.aspect);               // half-length
  P.b = P.size / Math.sqrt(P.aspect);               // half-width (area is conserved)
  P.taper = clamp(sum(g, 'taper'), 0, 0.85);
  P.box = clamp(sum(g, 'box'), 0, 1);
  P.wall = clamp(sum(g, 'wall'), 0, 1.5);
  P.flex = clamp(sum(g, 'flex'), 0, 1) * (1 - 0.6 * Math.min(1, P.wall));            // epistasis: a wall stiffens
  P.lobe = clamp(sum(g, 'lobe'), 0, 1) * (0.25 + 0.75 * P.flex);                      // pseudopods need flexibility
  const nuc = sum(g, 'nucleus');
  P.euk = nuc >= 0.5;                                                                // epistasis gate for eukaryote organelles
  P.nucleus = P.euk ? clamp(0.2 + 0.1 * nuc, 0.2, 0.45) : 0;
  P.mito = P.euk ? clamp(Math.round(sum(g, 'mito')), 0, 10) : 0;
  const chl = sum(g, 'chloro');
  P.chloroRaw = clamp(chl, 0, 8);
  P.plastids = P.euk ? clamp(Math.round(chl), 0, 8) : 0;                              // proper chloroplasts
  P.thylakoid = !P.euk ? clamp(chl / 3, 0, 1) : 0;                                    // bacterial photosynthetic membranes
  P.vacuole = clamp(sum(g, 'vacuole'), 0, 1);
  P.cvac = clamp(Math.round(sum(g, 'cvac')), 0, 3);
  P.golgi = P.euk ? clamp(Math.round(sum(g, 'golgi')), 0, 3) : 0;
  P.er = P.euk ? clamp(sum(g, 'er'), 0, 1) : 0;
  P.flagella = g.filter((q) => q.k === 'flag' && q.v * q.x > 0.2).slice(0, 6).map((q) => clamp(q.v * q.x, 0.2, 3));
  P.cilia = clamp(sum(g, 'cilia'), 0, 1);
  P.pili = clamp(sum(g, 'pili'), 0, 1);
  P.eye = clamp(sum(g, 'eye'), 0, 1);
  P.mouth = clamp(sum(g, 'mouth'), 0, 1);
  P.sense = clamp(sum(g, 'sense'), 0, 1.5);
  P.mutator = Math.max(0, sum(g, 'mutator'));
  const hs = g.filter((q) => q.k === 'hue');
  P.hue = hs.length ? hs.reduce((s, q) => s + q.v, 0) / hs.length : 0.5;
  P.genes = g.length;
  return P;
}

// ---------------------------------------------------------------------------------------
// Mutation operators (each logged by type so the UI can count them).
const NEW_KIND_AMP = {
  size: 0.15, elong: 0.2, taper: 0.15, box: 0.2, lobe: 0.2, flex: 0.2, hue: 0.5, wall: 0.2, nucleus: 0.6,
  mito: 1, chloro: 1, vacuole: 0.25, cvac: 1, golgi: 1, er: 0.3, flag: 0.8, cilia: 0.2, pili: 0.2,
  eye: 0.3, mouth: 0.25, sense: 0.2, growth: 0.15, mutator: 0.05,
};

function heavy(rng, scale) {
  const u = rng() + rng() + rng() - 1.5;               // ~normal
  const jump = rng() < 0.05 ? 4 : 1;                   // rare large-effect mutations
  return u * 1.6 * scale * jump;
}

export function mutate(genome, rate, rng, log) {
  const g = cloneGenome(genome);
  const note = (t, k) => log && log.push({ type: t, kind: k });
  // each operator fires with its own probability scaled by the mutation rate
  for (let i = g.length - 1; i >= 0; i--) {
    const q = g[i];
    if (rng() < rate) {                                                 // point mutation
      const amp = Math.max(0.08, Math.abs(q.v)) * 0.35 + 0.03;
      q.v = Math.max(0, q.v + heavy(rng, amp)); note('point', q.k);
    }
    if (rng() < rate * 0.25) {                                          // regulatory: expression level
      q.x = clamp(q.x * Math.exp(heavy(rng, 0.25)), 0.05, 2.5); note('regulatory', q.k);
    }
    if (rng() < rate * 0.12 && g.length < 60) {                         // duplication, the copy can drift
      g.push({ ...q, id: nextGeneId++, v: Math.max(0, q.v * (0.6 + 0.8 * rng())) }); note('duplication', q.k);
    }
    if (rng() < rate * 0.12 && g.length > 6) {                          // deletion / loss of function
      note('deletion', q.k); g.splice(i, 1);
    }
  }
  if (rng() < rate * 0.8 && g.length < 60) {                            // insertion of a novel gene
    const k = KINDS[Math.floor(rng() * KINDS.length)];
    g.push(gene(k, NEW_KIND_AMP[k] * (0.2 + rng() * 0.8), 1)); note('insertion', k);
  }
  return g;
}

// ---------------------------------------------------------------------------------------
// Hand-written starting genomes, for the gallery and for seeding. They are just genomes:
// the same develop() draws them as it draws anything evolution produces.
export function archetype(name) {
  const G = (...a) => a.map(([k, v, x]) => gene(k, v, x ?? 1));
  switch (name) {
    case 'Chlamydomonas-like':
      return G(['size', 0.5], ['elong', 0.2], ['taper', 0.05], ['nucleus', 1.2], ['mito', 2], ['chloro', 1], ['vacuole', 0.1],
        ['cvac', 1], ['golgi', 1], ['er', 0.5], ['flag', 1.2], ['flag', 1.2], ['eye', 0.9], ['wall', 0.3], ['hue', 0.34], ['growth', 0.5]);
    case 'Euglena-like':
      return G(['size', 0.75], ['elong', 1.0], ['taper', 0.6], ['nucleus', 1.2], ['mito', 2], ['chloro', 3], ['golgi', 1], ['er', 0.6],
        ['flag', 2.0], ['eye', 0.9], ['flex', 0.35], ['cvac', 1], ['hue', 0.26], ['growth', 0.5]);
    case 'Paramecium-like':
      return G(['size', 1.0], ['elong', 0.75], ['taper', 0.2], ['nucleus', 2.0], ['mito', 3], ['cvac', 2], ['cilia', 1.0],
        ['mouth', 0.9], ['golgi', 1], ['hue', 0.55], ['flex', 0.1], ['growth', 0.5]);
    case 'Bacterium':
      return G(['size', 0.25], ['elong', 0.9], ['box', 1.0], ['wall', 0.4], ['pili', 0.4], ['flag', 0.9], ['flag', 0.8], ['flag', 1.0],
        ['hue', 0.07], ['growth', 0.5]);
    case 'Amoeba-like':
      return G(['size', 0.8], ['flex', 1.0], ['lobe', 1.0], ['nucleus', 1.4], ['mito', 2], ['vacuole', 0.2], ['cvac', 1],
        ['mouth', 1.0], ['hue', 0.47], ['growth', 0.5]);
    case 'Yeast-like':
      return G(['size', 0.7], ['elong', 0.2], ['wall', 0.5], ['nucleus', 1.6], ['mito', 4], ['vacuole', 0.3], ['hue', 0.09], ['growth', 0.5]);
    case 'Cyanobacterium':
      return G(['size', 0.3], ['elong', 0.5], ['box', 0.8], ['wall', 0.5], ['chloro', 3], ['hue', 0.45], ['growth', 0.5]);
    case 'Proto-cell':
      return G(['size', 0.1], ['wall', 0.1], ['hue', 0.6], ['growth', 0.5], ['pili', 0.05]);
    default: throw new Error('unknown archetype ' + name);
  }
}
export const ARCHETYPES = ['Chlamydomonas-like', 'Euglena-like', 'Paramecium-like', 'Bacterium', 'Amoeba-like', 'Yeast-like', 'Cyanobacterium', 'Proto-cell'];

// A short description built from what the cell actually has, not from a lookup of names.
export function describe(P) {
  const bits = [];
  bits.push(P.euk ? 'eukaryote-grade' : 'prokaryote-grade');
  if (P.plastids || P.thylakoid > 0.3) bits.push('photosynthetic');
  if (P.mouth > 0.4) bits.push('phagocytic');
  if (P.flagella.length) bits.push(P.flagella.length + ' flagell' + (P.flagella.length > 1 ? 'a' : 'um'));
  if (P.cilia > 0.4) bits.push('ciliated');
  if (P.wall > 0.5) bits.push('walled');
  if (P.lobe > 0.35) bits.push('amoeboid');
  if (P.aspect > 2.2) bits.push('elongate');
  return bits.join(', ');
}
