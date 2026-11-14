# #2868 — 38 global fallback events; 16 expensive routes across 16 distinct source nets

**Date:** 2026-11-14. **Status:** measured full-board routing **failure**, not a fix. The original `scanner-full-board.simple-route.json` SHA-256 was `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`; it contains 684 source connections, 3,809 obstacle records and 6 layers. No source input was reduced or modified for this run. The graph contained 2,604 MST point-pair routes.

## Fixed code and run provenance

- Experimental Pipeline9 source Git revision **`54905379c92b2737726923d04ceee15706c0b37c`** at run start, with tiny-hypergraph revision **`148ff6d6109f3e3571c45680b0e63a8b52f97d07`**.
- Initial route-specific XY margin 3 mm, geometric growth ×3, 2 expansions before **mandatory unrestricted fallback**, 8,000 graph iterations maximum per bounded window. **Global cap unchanged:** 8,000,000 graph iterations.
- Read-only sampler calls `RouteCostSampler.observe()` once per 512 outer Pipeline steps; it does **not** mutate the graph, queue, path reservations, scores, admissible edges, or copper geometry.
- Forensics file on authorized VPS: `issue-2868/progressive-locality/full-board-sampled2.jsonl`; companion machine-readable data in [`docs/evidence/issue2868-adaptive-full-sampled-analysis.json`](./evidence/issue2868-adaptive-full-sampled-analysis.json).
- **15,623** graph-state samples across **376 distinct route IDs**. The 376 logged route-transition IDs are unique (no revisits). Global rerip counter was **zero**, so no discontinuous rerip episode invalidated the reported contiguous same-route lower-bound spans in this specific run. Some routes may be too short to appear between sample intervals.

## Result

The run stopped at **8,000,000 graph iterations**, `solved=false`, `failed=true`, `PreparedPortPointRoutingSolver ran out of iterations`; current route **1710 (`source_net_529_mst2`)**, 893 still queued, **38 unrestricted full-graph fallbacks**, 80 local widenings. Wall time 520.6 s, observed peak RSS 7,051 MB. The final complete-board DRC was **not reached**. There is no claim of all-684-net connectivity or physical manufacturing correctness.

### Verified conservative graph-iteration lower bounds

| Largest disjoint sampled routes | Combined minimum graph iterations | Share of entire 8M budget |
|---|---:|---:|
| Top 10 | 3,661,824 | **45.77%** |
| Top 16 | **5,814,272** | **72.68%** |
| Top 20 | 6,702,592 | **83.78%** |
| Top 30 | 7,196,672 | **89.96%** |

All 16 most expensive sampled routes come from **16 different source nets**. These are within-route first-to-last observed spans and **lower bounds only**, not exact iteration totals. Because these spans are nonoverlapping in this run (every route appeared in a single observed episode and no route IDs repeated), adding them is valid. No inferred route success or DRC result is attached to these spans.

| Source net and MST route | Route ID | Minimum graph iterations |
|---|---:|---:|
| `source_net_280_mst5` | 1508 | **376,320** |
| `source_net_300_mst5` | 1502 | 373,248 |
| `source_net_328_mst5` | 1484 | 368,128 |
| `source_net_558_mst13` | 1216 | 365,568 |
| `source_net_232_mst5` | 1538 | 364,032 |
| `source_net_347_mst6` | 1356 | 363,520 |
| `source_net_310_mst6` | 1363 | 363,520 |
| `source_net_291_mst6` | 1370 | 363,008 |
| `source_net_319_mst5` | 1490 | 362,496 |
| `source_net_262_mst6` | 1377 | 361,984 |
| `source_net_242_mst6` | 1391 | 361,984 |
| `source_net_252_mst6` | 1384 | 360,960 |
| `source_net_337_mst5` | 1478 | 359,936 |
| `source_net_271_mst5` | 1514 | 358,912 |
| `source_net_634_mst3` | 1603 | 356,352 |
| `source_net_289_mst3` | 1623 | 354,304 |

## Causal hypothesis and engineering direction

1. This is **not exclusively a GND-plane problem**: the top 16 worst routes are from separate source nets. The approx. 350k-375k per-route lower bounds across unrelated nets are **consistent with** a repeated board-scale fallback search, but do not prove what is being expanded inside the queue.
2. **The next exact measurement must count the cause of cost**: queued/popped/closed candidate hops, region-rejection reasons, source and destination layers, reserved regions, failed local corridor reachability, and the unrestricted fallback's candidate frontier. Do not infer a blocked physical connection merely from an empty local window or an expensive search.
3. More local window expansions were already falsified: increasing from 2 to 4 worsened original-board route progress at the same 8M cap (route 1710 → 1674). Increasing global `MAX_ITERATIONS` was also previously falsified as a complete fix. **Do not repeat parameter sweeps**.
4. Investigate a route-aware *admissible* search graph reduction or a provably complete alternative search that preserves all physical constraints, including layered via reachability. The exact unrestricted fallback must remain until an alternative is shown correct.
5. A future change must first provide a failing native regression for a top-cost route and a passing post-fix case, then a complete-board run satisfying `solved=true`, `failed=false`, zero missing/disconnected terminals, zero strict/relaxed DRC, and physical via/pour connectivity. None of those full-board acceptance conditions are met by this report.

## Reproduce and avoid false comparisons

```
SRJ_FILE=/absolute/path/original/scanner-full-board.simple-route.json \
CORRIDOR_MM=3 CORRIDOR_GROWTH=3 CORRIDOR_EXPANSIONS=2 CORRIDOR_WINDOW_STEPS=8000 \
EFFORT=1 MAX_STEPS=16000000 WALL_BUDGET_SECONDS=850 \
bun scripts/repros/issue2868-qualify-adaptive.ts

bun scripts/repros/issue2868-summarize-adaptive.ts /absolute/path/full-board-sampled2.jsonl
```

The independent unsampled 2-expansion control reached the **same 1710th route and 893 queued routes** at the same global 8M cap. The extra sampler has therefore not changed the measured routing-frontier result in this A/B. Wall time and memory are **not** comparable metrics across these runs because observation overhead and runtime environment can differ.

**Follow-on test-probe correctness:** after the run was launched, the `RouteCostSampler` was separately hardened to prevent over-counting when a route ID is reused after another route or an idle interval; both new tests were RED before the change and GREEN after. These later probe-only revisions do not alter the runtime provenance listed above. This particular full-board run had no such revisits or rerips, so its published disjoint per-route lower bounds remain valid.
