# Cell Evolution

Detailed single-cell organisms that evolve in a pool. Every visible structure (nucleus, nucleolus,
chloroplasts, mitochondria with cristae, Golgi stacks, ER, vacuoles, contractile vacuoles, eyespot,
cell wall, flagella, cilia, pili, oral groove, pseudopods, bacterial DNA, ribosomes) is produced by
`develop(genome)` in `genome.js` and drawn by `cellart.js`. Nothing in the drawing code names a species.

## Run
```
python -m http.server 5192
```
then open http://localhost:5192 (pool and inspector) or http://localhost:5192/gallery.html (six archetypes,
`?only=0..7` for one large portrait, `?labels=0` to hide labels).

Headless test: `node headless.mjs 20000 1 mixed`

## How it works
- **Genome**: list of genes `{kind, amplitude, expression}`. Same-kind genes add up. Mutations: point (heavy-tailed),
  regulatory, duplication, deletion, insertion of a new gene, plus a heritable mutator trait.
- **Epistasis / pleiotropy**: eukaryote organelles need the nucleus gene; walls stiffen the membrane and cancel pseudopods;
  the growth gene also changes size and upkeep.
- **Ecology** (`sim.js`): energy from light (shaded by cells above), dissolved nutrients from vents, or eating smaller cells.
  Costs for every organelle, wall, cilium and flagellar beat. Dense cells sink, vacuoles give buoyancy, thin cells burst
  in dilute water unless walled or fitted with contractile vacuoles. A cell divides when its biomass has doubled.
  There is no fitness value or reproduction probability on a cell.
- **Viewer**: wheel zoom, drag pan, click to inspect (labelled textbook portrait, genome, energy ledger), double-click to follow,
  inoculate hand-written genomes, darkness / nutrient crash / mutagen events.

## Status and known limits
- Balance is first-pass: in the default mixed seed, photosynthetic flagellates and amoeboid predators dominate.
  Cilia and thick walls are rarely selected. Tuning constants live in `K` at the top of `sim.js`.
- The earlier particle-chemistry lab (`../protocell`) is separate and unfinished (Phase 2 vesicle self-assembly not accepted).
