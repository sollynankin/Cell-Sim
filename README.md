# Cell Evolution

**Live:** https://sollynankin.github.io/Cell-Sim/  (GitHub Pages; works on desktop and touch screens)

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

## Deploying (GitHub Pages)
The app is static: plain ES modules, no bundler. `npm run build` copies the files into `dist/`; `.github/workflows/pages.yml`
runs a headless smoke test, builds, and deploys `dist/` on every push to `main`.

One-time setup in the repo on GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
The site then lives at `https://<user>.github.io/<repo>/`. Any other static host works too: upload the contents of `dist/`.

## Designing your own cell
Click **Design your own cell...** (or the pencil button in the inspector to start from a cell that evolved). The designer is a DNA editor:
add, delete and retune individual genes (amplitude = strength, expression multiplies it), load any template, or start blank.
The portrait, helix and an energy-budget check update live ("can it make a living?" at a vent, in mid-water and near the surface,
with the number of ticks per generation), plus warnings about things that will not work (for example mitochondria without a nucleus).
Save designs to a browser-local library (they appear with a star in the Inoculate list), copy or paste them as JSON, and add 1 to 100 copies
to the pool at the camera, the vents, the surface or everywhere. A designed cell is an ordinary cell: its descendants keep its name but mutate
and compete like everything else.

## Balance notes
`npm test` runs `test.mjs` (also in CI before every deploy): genomes develop, each starting genome can make a living somewhere, primordial and mixed
runs survive without extinction or hitting the population cap, evolve new structures, and replay deterministically for a seed.

Tuning history, from a 4-seed x 60k-tick primordial run that originally stayed a featureless soup:
- Cheaper division (birth biomass 4 x area) and 1.8x vent inflow, so generations take ~1,500 ticks.
- Any swimmer follows nutrient gradients weakly, so a lone flagellum pays off without a separate sense gene.
- Warm plumes carry nutrients upward, opening a lit niche; light is shaded by the cells above and crowding adds a waste cost, which keeps populations
  around 150-600 instead of the cap.
- Big cells without a nucleus pay an internal-transport penalty, which is what rewards evolving a nucleus; complexity costs (per-gene, nucleus,
  mitochondria) are high enough that it must pay for itself.
- Starting genomes were rebalanced so no template earns 5-10x the energy of the others.

What to expect from scratch: flagella and walls within ~4,000 ticks, cilia and photosynthesis within roughly 15,000 to 70,000 (not in every seed;
some stay vent-bound bacteria), then diverse body plans. Eukaryotes and predators from a primordial start are rare and slow; the mixed start has them from tick 0.
