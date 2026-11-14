# #2868 — exact original board owner/frontier forensics (2026-11-14)

**Status: negative full-board qualification.** This is a read-only, experimentally instrumented reproduction; none of the changes in this branch is approved for merging into production. Original six-layer `scanner-full-board.simple-route.json` source SHA-256: `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`, 684 logical source connections, 3,809 obstacle records. The reproduction uses base `fa7fe9202e45c747ae05a6c4b295c86f460e492e` and the previous local escape anchor patch, with a strictly read-only observer.

## Reproduced result

- **Global** PreparedPortPointRoutingSolver iteration limit: exactly `8,000,000`. The count covers all graph routes attempted up to that point; it **does not** mean current route 1209 individually consumed 8 million iterations.
- The total graph contains `2,604` routes. At exhaustion, `1,394` were still in the `unroutedRoutes` queue, with route ID `1209` (`source_net_558_mst6`) currently active; only one attempt on the current route was recorded. Numeric IDs depend on routing order and are not stable across changes.
- `state.candidateQueue.length` was **11,508** at the exact limit: queue exhaustion was **not reached**. A nonempty queue is not proof its candidates are physically feasible; they may be stale or lead to invalid crossings. It is proof that the solver reached its global iteration limit before the queue-drain condition.
- The existing selective-rerip handler is invoked through `onOutOfCandidates()`, which requires `candidateQueue.dequeue()` to yield no candidate. The recorded `globalReripCount=0` is consistent with this mechanism. It does **not** establish that reripping owners would produce a correct full-board solution.
- Running time 529.2s; observed max RSS 6,364 MB; `solved=false`, `failed=true` with `PreparedPortPointRoutingSolver ran out of iterations`. The entire original-board DRC gate was never reached.

## Read-only region graph accessibility (current route 1209)

Three increasingly constrained, bounded *region-adjacency* reachability checks all find a coarse path:

| Constraint level | Coarse path found | Explored region candidates | Visited port incidences | Dynamic assignment exclusions |
|---|---|---:|---:|---:|
| Geometry only (section mask) | Yes | 3,658 | 39,790 | — |
| Also static net and endpoint reservations | Yes | 2,252 | 25,888 | — |
| Also already committed port assignments | Yes | 2,248 | 25,879 | 216 |

All checks returned without hitting the protective inspection limit. During the fixed + assigned version, 1,848 fixed-net region transitions were excluded, but a coarse path still existed. The current start and goal terminals each have two incident top-layer regions, reserved for numeric net ID 9; one start-adjacent region already contains a segment belonging to route ID 1208 (`source_net_558_mst5`, same logical source net). This **is not evidence that route 1208 blocked route 1209**. Do not mistake counts of exclusions for a proven cut-set or a fabrication short.

**Important limitation:** The probe did not compute legal copper crossings within individual regions or a length/clearance-constrained physical path. A `true` result is a **necessary/topological accessibility observation**, not proof of valid route geometry, no shorts, or DRC compliance. The first probe was emitted near the global cap (`graphIterations=8,000,000`) and labeled `route-start` by the diagnostic's first-observation convention; **this is not the time at which route 1209 began**. This is corrected in subsequent probe source to say `first-observed`.

## What this falsifies

1. **Not proven:** the candidate route is structurally disconnected by previously committed port assignments. The coarse graph remains connected with those assignments in force.
2. **Not proven:** current route 1209 is the sole expensive route or causes the entire 8M-iteration limit. Because graph iterations accumulate across many routes, its presence at the limit is insufficient evidence of that.
3. **Confirmed:** the system-wide global iteration budget is exhausted before both route-queue depletion and any documented selective rerip of this candidate. There are 1,394 untouched queued routes at termination.
4. **Not proven:** simply raising MAX_ITERATIONS, forcing rerip, or dropping reservations will yield a DRC-clean board. Such claims require independently executed original-board electrical and physical qualification.

## Next causally targeted measurements

- Add low-overhead **per-route** counters at the tiny-graph solver's `currentRouteId` transitions: starting/ending graph iteration, candidates popped/queued/closed, route success/failure, path length, cost and localized crossing rejections. Report total per route and P50/P95/P99, with exact source SHA and deterministic routing order. This separates a small number of high-cost routes from systemic per-route inefficiency.
- Compare `candidateQueue.length` and unique candidate-hop growth for the heaviest routes; distinguish stale queue entries, repeated requeue/cost dominance and actual geometry rejection.
- For a geometrically blocked *identified* route, use the native relaxed-owner search with a bounded expansion limit to obtain exact committed owners; only then consider a narrow rerip/change in route ordering. No owner is causal merely because it appears in an adjacent region.
- Optimize search complexity or use carefully bounded, evidence-driven per-route budgeting only after the cost distribution is measured. Preserve connection completeness and the original-board strict+relaxed DRC gate; **no unverified copper-plane equivalence**.

## Reproduce and inspect evidence

```
SRJ_FILE=/absolute/path/scanner-full-board.simple-route.json WALL_BUDGET_SECONDS=720 MAX_STEPS=11000000 EFFORT=1 PROBE_ROUTE_ID=1209 bun scripts/repros/issue2868-qualify-owner-trace.ts
bun scripts/repros/issue2868-summarize-frontier.ts /absolute/path/full.jsonl
bun test tests/repro/issue2868-read-only-frontier-probe.test.ts
```

Full exact run log on authorized server: `/root/tscircuit-work-20261114/issue-2868/route-owner-frontier/full.jsonl`. Machine-readable summary: `/root/tscircuit-work-20261114/issue-2868/route-owner-frontier/summary.json`. These files are runtime evidence, not bundled in the GitHub branch. Do not post them to a PR without reviewing source data and redaction requirements.
