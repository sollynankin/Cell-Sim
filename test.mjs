// Regression checks for ecosystem balance and the genome model. Run: npm test
import assert from 'node:assert/strict';
import { Sim, Cell } from './sim.js';
import { ARCHETYPES, archetype, develop, describe } from './genome.js';

let failed = 0;
const check = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message); } };

// every starting genome develops into something drawable, and designed genomes can be developed
check('archetypes develop', () => { for (const n of ARCHETYPES) { const P = develop(archetype(n)); assert.ok(P.a > 0 && P.b > 0, n); assert.ok(describe(P).length > 0); } });

check('starting genomes are viable somewhere (not all negative)', () => {
  const s = new Sim({ seed: 1, mode: [] });
  for (const n of ARCHETYPES) {
    const c = new Cell(1, archetype(n), 0, 0, null);
    const nets = [[0.55, 0], [0.2, 0.35], [0.06, 1]].map(([nut, L]) => { const l = s.ledger(c, nut, L); return l.up + l.photo - l.cost; });
    if (!['Paramecium-like', 'Amoeba-like'].includes(n)) assert.ok(Math.max(...nets) > 0, `${n} cannot make a living anywhere (${nets})`);   // the two hunters live on prey
  }
});

function run(mode, seed, ticks) {
  const s = new Sim({ seed, mode }); let min = 1e9, max = 0;
  for (let i = 0; i < ticks; i++) { s.step(); min = Math.min(min, s.cells.length); max = Math.max(max, s.cells.length); }
  return { s, min, max };
}
for (const seed of [1, 2]) {
  check(`primordial seed ${seed}: survives, stays below the cap, evolves motility`, () => {
    const { s, min, max } = run('primordial', seed, 15000);
    assert.ok(min >= 40, `population fell to ${min}`);
    assert.ok(max < s.params.maxPop * 0.9, `population ran into the cap (${max})`);
    const h = s.hist[s.hist.length - 1];
    assert.ok(h.flag > 0.05 || h.wall > 0.05, 'no new structure evolved in 15k ticks');
    assert.ok(s.mutCounts.point + s.mutCounts.insertion > 50, 'too few mutations occurred');
  });
}
for (const seed of [1, 3]) {
  check(`mixed seed ${seed}: survives and keeps several body plans`, () => {
    const { s, min, max } = run('mixed', seed, 20000);
    assert.ok(min >= 40, `population fell to ${min}`);
    assert.ok(max < s.params.maxPop * 0.9, `population ran into the cap (${max})`);
    const h = s.hist[s.hist.length - 1];
    assert.ok(h.plans >= 4, `only ${h.plans} body plans left`);
  });
}
check('deterministic for a seed', () => {
  const a = run('mixed', 5, 3000).s, b = run('mixed', 5, 3000).s;
  assert.equal(a.cells.length, b.cells.length); assert.equal(a.totalBirths, b.totalBirths);
});

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
