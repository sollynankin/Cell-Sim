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

## Performance and detail
Only the selected cell is drawn with full organelle detail (`drawCell`, lod 3). Every other cell uses `drawSimple`
(one flat body path, nucleus and plastid dots, one stroke for all flagella) or a single dot when tiny. The left panel's
"Full detail for" setting can also give full detail to the 6 or 25 cells nearest the view centre. With 900 cells the whole
frame costs about 5 ms of JavaScript.

## DNA view
The inspector draws the selected cell's genome as a rotating double helix: one rung per gene, coloured by gene kind, grouped by kind,
and brighter, thicker and glowing when the gene is stronger (amplitude x expression, on a fixed scale of 3 so cells are comparable).
Hover a rung to read the gene.
