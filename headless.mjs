// node headless.mjs <ticks> <seed> <mixed|primordial|bacteria>
import { Sim } from './sim.js';
import { describe } from './genome.js';

const ticks = +(process.argv[2] || 20000), seed = +(process.argv[3] || 1), mode = process.argv[4] || 'mixed';
const sim = new Sim({ seed, mode });
const t0 = Date.now();
for (let i = 1; i <= ticks; i++) {
  sim.step();
  if (i % 2000 === 0) {
    const h = sim.hist[sim.hist.length - 1] || {};
    const pc = (x) => ((x || 0) * 100).toFixed(0) + '%';
    console.log(`t=${i} n=${sim.cells.length} euk=${pc(h.euk)} photo=${pc(h.photo)} flag=${pc(h.flag)} cilia=${pc(h.cilia)} wall=${pc(h.wall)} mouth=${pc(h.mouth)} amoeba=${pc(h.amoeba)} size=${(h.size || 0).toFixed(2)} genes=${(h.genes || 0).toFixed(1)} deaths=${JSON.stringify(sim.deaths)} muts=${Object.values(sim.mutCounts).reduce((a, b) => a + b, 0)}  [${((Date.now() - t0) / 1000).toFixed(0)}s]`);
  }
  if (!sim.cells.length) { console.log('EXTINCT at', i); break; }
}
const tally = {};
for (const c of sim.cells) { const d = describe(c.P); tally[d] = (tally[d] || 0) + 1; }
console.log('final body plans:'); Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([k, v]) => console.log(' ', v, k));
