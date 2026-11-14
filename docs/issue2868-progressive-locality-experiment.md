# Issue #2868 — progressive route-local search with safe unrestricted fallback

**Status: experimental two-repository integration; not an upstream production PR or proof of original-board qualification.**

This local branch connects an opt-in Pipeline9 option `progressiveRouteCorridor` to the prepared tiny-hypergraph routing engine. The engine change lives on the `experiment/2868-progressive-locality-20261114` branch of the `ameenalqershi/tiny-hypergraph` fork, pinned by exact commit in this branch's `package.json`. No existing caller activates the option by default. `USE_PREPARED_PORT_POINT_ROUTING` remains independently controlled by Pipeline9.

The engine filters route-candidate endpoints by a rectangle spanning the current ports plus a configurable margin (mm). It never adds copper, alters the permanent section mask or geometry, treats a copper pour as automatically connected, or rewrites committed assignments. On local queue exhaustion or bounded per-window iteration budget, it widens the corridor by a configured factor, **clears only tentative route candidate states**, reseeds from the original start terminal, and ultimately retries through the **unrestricted original graph search**. Existing native selective-rerip runs only after unrestricted search is exhausted, and partial-rip plans skip corridor filtering. Both `DenseRoutingWorkspace` and its unsupported native fallback use the same opt-in candidate predicate.

Set the opt-in in experimental Pipeline9 construction:

```ts
new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, {
  cacheProvider: null,
  effort: 1,
  progressiveRouteCorridor: {
    initialMarginMm: 3,
    growthFactor: 3,
    maxExpansions: 2,
    windowIterations: 8000,
  },
})
```

This changes **search order and candidate rejection under the bounded stage**; the unrestricted stage restores all candidates and preserves native route eligibility. No general physical-routability or performance guarantee follows solely from this opt-in algorithm. All original source connections and strict/relaxed DRC must pass for #2868 to be called fixed.

## Independent control evidence

The one-net `pcb_port_127` ↔ `pcb_port_1370` reduced fixture preserved the exact 3,809 original obstacles and six layers. Its input SHA-256 is `ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071` (the original board input SHA-256 is `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`). The unmodified control took 330,367 `portPointPathingSolver` Pipeline steps. With progressive locality enabled, the integrated Pipeline9 took **1,997 stage steps** and the prepared solver recorded **1,959 graph iterations**, 0 expansions and 0 fallbacks. The output SHA-256 remains exactly `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348`. Qualification was `true` with 0 relaxed DRC, 0 default/strict DRC, 0 disconnected ports, and 0 missing source traces. This is a one-route, not a complete-board qualification.

The engine fork's unit/regression tests include native fallback when dense optimization is unsupported, accepted-route assignment parity, fixed assignment and worker compatibility. The full-board test must be separately verified; it uses the original SHA and **all 684 source connections** with 3,809 obstacles and six layers.

## Reproduce

```sh
SRJ_FILE=/absolute/path/original-board-or-derived-one-pair.json \
CORRIDOR_MM=3 CORRIDOR_GROWTH=3 CORRIDOR_EXPANSIONS=2 \
CORRIDOR_WINDOW_STEPS=8000 EFFORT=1 WALL_BUDGET_SECONDS=850 MAX_STEPS=16000000 \
bun scripts/repros/issue2868-qualify-adaptive.ts
```

The script guards input hashes and runs the strict/default and relaxed DRC plus full source connectivity gate only on a solver-completed result. The scripts are in `scripts/repros` for controlled diagnosis, not production settings.
