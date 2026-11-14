# Issue #2868 — independent exact-board path search failure analysis

Date: November 14, 2026. All values below were captured from public GitHub Actions artifacts or source-verified local experiments, not inferred from synthetic projections. **The whole-board fix remains unproven.**

## Original input and environment

- Original fixture downloaded from https://github.com/user-attachments/files/33037296/scanner-full-board.simple-route.zip
- SHA-256 of the exact original SRJ: `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`
- 684 original `connections`, 3,809 physical obstacle records, six board layers, including a full-board `source_net_144` ground copper region on `inner1` and many `source_net_0` supply regions on `inner4`.
- Preprocessing creates 2,604 MST point-pair connections, of which 730 are associated with GND `source_net_144`. The source GND connection itself has 730 terminal points. Next-largest supply `source_net_0` has 177 terminal points.
- Pipeline progress `0.44` is a **weighted stage indicator**, NOT evidence that 44% of physical electrical nets are routed.
- Every original-board run used the same source hash and a CPU-limited/bounded GitHub runner. Variations in wall-clock duration or peak RSS across independent runners cannot be treated as controlled causal speedup results.

## Controlled source-derived results

| Source configuration | Path search state | Final DRC | Run |
| --- | --- | --- | --- |
| All 684 source connections, default engine | Failed: `PreparedPortPointRoutingSolver ran out of iterations` at route `source_net_144_mst491`, 8,320,126 global steps | Not qualified | [forensic full board](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43582359831) |
| All 684, combined performance PRs #3774 and #3775 | Same failed stage and 8,320,126 global steps | Not qualified | [combined attempt](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43580254945) |
| All 684, experimentally *genuinely doubled* prepared-route budget | Still failed at 16,320,126 global steps | Not qualified | [uncapped effort=2](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43580980864) |
| GND `source_net_144` only; all original obstacles retained | 730 output routes, `solved=true`, 8,507,950 total global steps | **739 errors** | [GND isolation](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43581753183) |
| GND plus supply `source_net_0` only; all obstacles retained | 907 source endpoints, `solved=true`, 8,540,411 total global steps | **919 errors** | [differential 2-net run](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43582696818) |
| All source connections *except* supply `source_net_0` | **Failed** again after 8M internal prepared-router iterations; different route `source_net_3_mst5` | Not qualified | [differential no-supply run](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43582696818) |
| All 684, experimental distance cost `0.2` (baseline `0.05`) | Still failed at 8,320,126 steps; failed route changed to `source_net_144_mst532` | Not qualified | [distance-cost run](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43582967327) |
| All 684, **non-prepared** solver replacing Prepared | Still failed at same route `source_net_144_mst491`, same 8,320,126 steps | Not qualified | [non-prepared A/B run](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43583427284) |

## Actual failure mode

The exact-run diagnostic exposes:

```
currentRouteId: 491
connectionId: source_net_144_mst491
start:  (8.825, -7.825), bottom escape-via to inner1, pcb_port_2896
end:    (2.4379, -12.0249), top, pcb_port_1712
prepared graph solver iterations: 8,000,000
remaining queued source routes: 2,112
never-successfully-routed route sample: [491], attempts=1
selective rerip globalReripCount: 0
```

This establishes a **path-search budget exhaustion while one route remained active**. It does **not** demonstrate that `Selective Rerip` is itself defective, because its global rerip counter had not incremented in that snapshot. It does not prove the physical route is impossible. Other-net interactions are implicated because small net subsets can complete the search while more complex mixed-net cases fail, although all successful reductions are still **electrically invalid** due to DRC errors.

## Explicitly rejected experiments

- Simply doubling effort: 16.32M global steps and the same failure, no full-board progress.
- Changing `DISTANCE_TO_COST` from `0.05` to `0.2`: on a real cropped **77-source-connection six-layer** input, DRC worsened from **13 to 175** while total steps increased from 2,225,912 to 2,397,447. Although wall-clock seconds fell from 168 to 150.4 on that sample, this is **not a permissible quality regression**. Experimental fork only.
- Switching from prepared to non-prepared selective-rerip search: on 77 sources, **identical output SHA-256, 13 identical DRC violations and 2,225,912 identical steps**. Original-full-board [A/B run](https://github.com/ameenalqershi/tscircuit-autorouter/actions/runs/43583427284) also **failed at the same GND route `source_net_144_mst491` after exactly 8,320,126 steps**, with zero recorded global selective rerips. Therefore the Prepared acceleration implementation alone is not the underlying cause.

## Engineering next step: plane-aware routing, not a blind shortcut

The original geometry has a full-board GND copper region on `inner1`. A **hypothesis to validate** is that connecting plane-backed pad terminals to their respective same-net plane using rigorously checked via escapes, instead of requiring every multi-terminal net to be fully MST-routed as ordinary signal traces, could reduce redundant global route work. This is only a hypothesis; aggressively discarding GND MST edges would be unsafe.

Any implementation must prove, in this order:

1. Exact plane belongs to the same electrical net, spans a valid layer, and is usable at actual via coordinates under the obstacle/keepout geometry.
2. Every original source port remains physically connected through a valid pad-to-via escape and metal-to-plane junction. Pads too small for a via-in-pad must use a DRC-verified short escape or remain routed normally.
3. Distinct-net traces and vias never contact the plane or one another; obey trace width, via diameter, annular ring, drill and edge-clearance rules.
4. Deterministic source ID coverage and route-to-source trace integrity checks succeed; independently run both relaxed and strict DRC, with **zero** new or existing violations for the full-board acceptance gate.
5. Compare exact original SHA source, full pipeline completion, path routing trace count, final unconnected port count, memory, time, and benchmark against untouched baseline. A solve flag alone is insufficient.

The current code changes for #3774 and #3775 are **separately reviewable performance improvements**, both with green CI, but should not be described as solving #2868.
