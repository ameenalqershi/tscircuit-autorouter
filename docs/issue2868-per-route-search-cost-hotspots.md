# #2868 — Exact-board per-route graph-search cost concentration (2026-11-14)

**Status:** reproducible negative full-board result; a causal performance target, **not** a routing fix. **Do not merge this instrumentation** into production as a solution. The original attachment was not changed.

## Fixed test environment and safeguards

- Exact original `scanner-full-board.simple-route.json`, SHA-256 `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`, 684 source connections, 3,809 obstacles, six layers.
- Same baseline `fa7fe9202e45c747ae05a6c4b295c86f460e492e` and same experimental pad-to-escape-via MST metadata as previous runs; TypeScript passes. The per-route cost sampler does **not** change route ordering, graph topology, candidate costs, queue, reservations or physical traces. It observes `currentRouteId` and cumulative graph `iterations` once per 512 outer pipeline steps.
- Exactly **15,623** graph-state samples were taken; the sampler recorded **136 distinct sampled route IDs** as they were current. Short routes may fit entirely between observations and be absent. A route's `lastObservedIteration - firstObservedIteration` is a **lower bound** on the time spent active; it is not exact per-route cost. Route labels/IDs are stable only for this exact run. No rerip was recorded.
- Graph run: `PreparedPortPointRoutingSolver ran out of iterations`, 8,000,000 cumulative graph iterations, 8,321,271 total Pipeline steps, 505.2s, observed RSS max 6,279 MB, 11,508 candidates still in the queue, 1,394 graph routes still queued; full-board `solved=false`, `failed=true` and no full-board DRC was run.

## Main finding — 16 routes account for at least 94.79% of the global 8M iteration cap

| Original net | Hot sampled route count | Sum of nonoverlapping, within-route observed lower bounds | Share of global 8M budget |
|---|---:|---:|---:|
| `source_net_144` | 4 | 2,582,528 | 32.28% |
| `source_net_558` | 6 | 2,042,368 | 25.53% |
| `source_net_0` | 2 | 1,528,832 | 19.11% |
| `source_net_3` | 4 | 1,429,504 | 17.87% |
| **TOTAL** | **16** | **7,583,232** | **94.79%** |

These 16 observed spans are disjoint in graph time and are therefore a conservative cumulative lower bound. This demonstrates a sharply concentrated cost distribution in this run. **It does not prove that these routes would be physically feasible under an alternative A* heuristic, corridor search, more iteration budget, or rerip strategy.**

Independent network-level intervals from first observed root-net transition to next (include all routes in each root-net block, sampled ±512 graph iterations): GND `source_net_144` approximately 35.78% of the full budget; `source_net_558` 25.77%; `source_net_0` 19.49%; `source_net_3` 18.07%. Together approximately **99.11%** of graph iterations prior to halt. These are not a complete all-net benchmark; thousands of later routes were never reached.

### Specific short-route hotspot

For `source_net_558`, source-derived MST point pairs `mst0`–`mst6` all connect **distinct top-layer PCB ports with an XY distance of exactly 7 mm** (the graph contains 15 MST edges for this 16-port net; only the first seven became current before the global cap). Per-route sample boundaries show six consecutive long spans near **340,000–342,000 graph iterations each**, despite this short geometric distance. Examples:

| Observed route | First observed cumulative iterations | Within-route sampled lower-bound iterations |
|---|---:|---:|
| `source_net_558_mst0` | 5,938,441 | 339,968 |
| `source_net_558_mst1` | 6,278,921 | 340,992 |
| `source_net_558_mst2` | 6,620,425 | 340,992 |
| `source_net_558_mst3` | 6,961,929 | 339,968 |
| `source_net_558_mst4` | 7,302,409 | 339,968 |
| `source_net_558_mst5` | 7,642,889 | 340,480 |
| `source_net_558_mst6` | 7,983,881 | 15,872 recorded before the *global* cap; not evidence it is cheap or impossible |

The independent **one-connection** control for the same `mst6` port pair (`pcb_port_127` → `pcb_port_1370`) preserved all original 3,809 physical obstacles and all six layers, removed competing route requests and obsolete differential-pair metadata, and **succeeded** with 0 relaxed/default DRC, 0 disconnected ports and 0 missing source traces for that **reduced** input. It consumed approximately 330,367 additional outer Pipeline steps between entering and exiting `portPointPathingSolver` (`482,639 - 152,272`), despite being a 7-mm same-layer pair. This is not a directly identical topology or exact internal graph-iteration benchmark; it suggests the large source geometry/topology itself can make even one short route expensive, not merely dynamic competing routes.

## Important conclusions and qualifications

1. The previous issue comment's speculation that `source_net_558_mst6` uniquely caused the 8M cap is refuted: most budget had already been used by earlier routes when it first appeared at 7,983,881 graph iterations.
2. A coarse region-adjacency path remained between the current route's endpoints **with** existing port assignments and static restrictions, but that read-only probe did not model copper crossings or clearance. The non-empty queue does not prove physical feasibility.
3. The combined evidence points first to **path-search complexity and candidate expansion for a few costly source-derived routes**, not a universally blocked graph or a simple need to increase `MAX_ITERATIONS`.
4. Any optimization needs a paired A/B on this exact source with per-route iteration histograms, and a strict/relaxed DRC + all-684-source-connection electrical qualification after full routing. Do not update failing snapshots merely to make CI green.

## Engineering next step (not yet implemented)

Instrument the underlying tiny-hypergraph PreparedPortPointRoutingSolver's per-route candidate pushes/pops, stale de-queues, crossing/clearance rejections, and `onPathFound()` cost. Start with source-net-558's 7-mm links and source-net-144's highest-cost MST pairs. Establish if 340k visits are dominated by topology width, repeated exploration of high-cost alternatives, or congestion crossing checks. Only then prototype locality-aware candidate pruning or a guaranteed fallback path search **under the existing clearance and connectivity contract**, isolated from unrelated board nets. Do not apply a global force-rerip or numeric cap increase as a substitute for a proven algorithmic improvement.

## Reproduction

```
SRJ_FILE=/absolute/path/scanner-full-board.simple-route.json WALL_BUDGET_SECONDS=720 MAX_STEPS=11000000 EFFORT=1 bun scripts/repros/issue2868-qualify-route-cost.ts
bun scripts/repros/issue2868-summarize-route-cost.ts /absolute/path/full.jsonl
bun test tests/repro/issue2868-route-cost-sampler.test.ts tests/repro/issue2868-read-only-frontier-probe.test.ts
```

Full source-derived server evidence: `/root/tscircuit-work-20261114/issue-2868/route-cost-sampling/full.jsonl`, plus `summary.json`. This is not evidence of a DRC-clean final PCB. Keep the route-ID and wall-time provenance whenever comparing experiments.
