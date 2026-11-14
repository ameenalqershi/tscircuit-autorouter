# #2868 — original-board A/B **rejects** static region preflight as a performance fix

**Date:** 2026-11-14. **Disposition: NEGATIVE performance result. Do not enable or merge this optimization into production for #2868.** The implementation is preserved on an isolated, disabled-by-default research branch for deterministic review and safe future experimentation; it is **not** an upstream PR claiming an electrical fix.

## Exact source and code provenance

- Unaltered original 684-connection, 3,809-obstacle, six-layer SRJ SHA-256: `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`.
- Native graph has 2,604 point-pair route requests. The experiment did not delete any source nets, masks, obstacles, layers, via keepouts, DRC rules or path reservations.
- A/B engine is source-pinned to experimental `tiny-hypergraph` commit `d6484b3ad7d81da7dd886ce2a8afc214018fa813`, as integrated by `tscircuit-autorouter` commit `55eef0f10f44ebb8809e47c53b1850090e4ec3c4`. The first full-board run started at that exact revision. Later follow-up commits add tests/docs/comparison only.
- Opt-in flags `LOCAL_ROUTE_CORRIDOR_REGION_PREFLIGHT: true` at engine layer, or `REGION_PREFLIGHT=1` on the guarded original-SHA runner; **off by default**. Pipeline9 had an unchanged global graph cap **8,000,000**, 3mm / 9mm / 27mm corridor windows with 8,000 iterations each, exact native unrestricted A* as mandatory final fallback. Separate `SEARCH_DIAGNOSTICS=1` provides comparable read-only counts in both variants.
- Baseline raw log on authorized VPS: `issue-2868/search-diagnostics/full-board-candidate-diagnostics.jsonl` (same source SHA, same graph cap, no region preflight). Experiment raw log: `issue-2868/region-preflight/full-board.jsonl`. The [machine-readable exact-SHA comparator receipt](./evidence/issue2868-full-board-static-preflight-ab.json) uses the SHA-guarded `scripts/repros/issue2868-compare-preflight-runs.ts`.

## Outcome: no meaningful search-work reduction

| Metric | Same-SHA baseline; no preflight | Opt-in conservative static preflight |
|---|---:|---:|
| Preflight calls | 0 | **1,791** |
| Static reachable witness | — | **1,791** |
| Locally unreachable windows skipped | — | **0** |
| Inconclusive preflights | — | 0 |
| Extra preflight port incidences scanned | 0 | **14,799,962** |
| Extra preflight region visits | 0 | **1,220,425** |
| Graph solver iterations | **8,000,000** | **8,000,000** |
| Candidate queue pops | **7,982,887** | **7,982,887** |
| A* neighbor-port scans | **187,946,546** | **187,946,546** |
| Graph-candidate insertions | **34,842,690** | **34,842,690** |
| Corridor widenings / unrestricted fallbacks | 80 / 38 | 80 / 38 |
| Last active graph route | **1710** (`source_net_529_mst2`) | **1710** (same) |
| Remaining queued graph routes | **893** | **893** |
| Total Pipeline step count | **8,321,271** | **8,321,271** |
| Pipeline elapsed wall seconds (observed) | 551.3 | 554.1 |
| Peak observed RSS MB | 7,057 | 7,089 |
| `solved=false`, `failed=true`, 684-net physical DRC qualification | **Failure; DRC not reached** | **Failure; DRC not reached** |

The *same* 1,710 graph-route successes (1,672 within bounded windows, 38 after unbounded fallback) have occurred before the active route 1710 fails. These are **graph search successes** and are **NOT** guarantees that 1,710 physical source nets are connected. DRC, exact physical copper/pour/via clearance and all-source-net connectivity **were never reached** on this board. The source has only 684 logical connections, expanded to 2,604 point-pair routes.

### Why the static approach is ineffective

The conservative region graph permits possible paths under *static* fixed net ownership while deliberately ignoring dynamic port assignments, route-segment intersections, via/drill and copper legality, congestion and cost. That overapproximation is deliberate for safety: `reachable` does not imply A* can finish under the same local 8k candidate budget. On the real board, **all 1,791 bounded-window preflights returned reachable**, including windows which later exhausted their budget and required widening or unrestricted search. No local window was skipped. Consequently the original cost-bound and region-reservation pathfinding branches and all 38 expensive unrestricted searches performed **exactly the same workload**, plus extra BFS scans and region visits. Wall time differences are small and potentially confounded by concurrent server workload; the exact unchanged graph counts are the decisive no-benefit finding.

### Reduced real-fixture electrical safety control

On the one-pair `source_net_558` fixture **with all 3,809 obstacles and six layers intact**, preflight called once, visited **57 regions** and scanned **1,643 port incidences**, then native A* routed the same output SHA-256 `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348` as no preflight and native unbounded controls. Both default/strict and relaxed DRC yielded **zero errors**; zero disconnected ports and zero missing source traces. This control demonstrates noninterference on *one pair only*.

### Testing and decision

- Engine tests: 32 passing / 300 expectations, covering static reservations, multi-layer abstract detour, native prepared route-parity, safe fallback, disabled-default behavior and no fabricated routes. Targeted strict TypeScript compilation passed.
- Autorouter integration TypeScript noEmit passed and existing diagnostics/test suite passed. The SHA-checked comparator has four independent cases, including refusal of mismatched source SHA and no false full-board qualification.
- **Do not open an upstream PR advertising this as #2868 resolution.** Preserve the branch as a reproducible research artifact (flag stays disabled by default), and move engineering attention to the expensive **A* candidate-expansion/cost-lower-bound** loop that consumes 82.57% of queue operations inside only 38 unrestricted fallback searches.

**Next research hypothesis (not implemented, not proven):** an *admissible and cost-aware* hierarchical A* lower bound or dynamic-occupancy-aware corridor scoring may reduce unbounded candidate expansions. Such a prototype requires a small adversarial topology where the same route output is preserved and an exact original-board candidate-pop reduction, **without removing native fallback or bypassing final strict/relaxed DRC**. Do not infer physical shorts from static copper-pour rectangles or fabricate source-net equivalences.

## Reproduce and review

```bash
# Baseline and experiment must share the exact source SHA, corridor budget and 8M cap.
SRJ_FILE=/path/to/original/scanner-full-board.simple-route.json \
  SEARCH_DIAGNOSTICS=1 REGION_PREFLIGHT=1 CORRIDOR_MM=3 \
  CORRIDOR_GROWTH=3 CORRIDOR_EXPANSIONS=2 CORRIDOR_WINDOW_STEPS=8000 \
  MAX_STEPS=16000000 WALL_BUDGET_SECONDS=1120 EFFORT=1 \
  bun scripts/repros/issue2868-qualify-adaptive.ts

bun scripts/repros/issue2868-compare-preflight-runs.ts baseline.jsonl experiment.jsonl
```

The comparative benchmark is **not a reward/acceptance claim** and does not modify production behavior unless explicitly opted in. All artifacts remain in separate branches to avoid interference with other agents or with upstream PRs #3774/#3775/#3784.
