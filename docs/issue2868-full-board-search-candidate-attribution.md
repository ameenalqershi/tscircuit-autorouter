# #2868: original-board per-candidate graph-search attribution — 8M iterations, failure confirmed

**2026-11-14 | Independent, source-SHA-verifiable engineering receipt | NOT an upstream fix.**

### Inputs and reproducibility

- **Original full-size SRJ SHA-256:** `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`.
- **684 logical source connections, 3,809 obstacles, 6 physical layers;** derived 2,604 point-pair graph routes.
- Experimental autorouter commit **`49e5f31eb496c7453c5ffcc20bd9caa2eb8540f2`** and diagnostic tiny-hypergraph engine **`743431edbb6907320c0b17daa49aa0a5e5cc6e5c`** as recorded in remote source provenance. Subsequent commits only added diagnostics-only unit coverage, pinned revision or docs. The test used in-memory engine contents equivalent to the later test-only commit.
- Search settings: 3mm local corridor, growth x3, two widening steps (3, 9, 27 mm), 8,000 iterations per local window, **unrestricted exact search fallback**, and the SAME **8,000,000** global graph-iteration cap as earlier controls.
- `SEARCH_DIAGNOSTICS=1`, all counts gathered **inside the native/regional-port and prepared candidate paths**. No physical geometry, net reservations, costs, queue sorting or routing acceptance rules modified by instrumentation. Test is opt-in and non-production.
- Source raw logs on authorized VPS: `issue-2868/search-diagnostics/full-board-candidate-diagnostics.jsonl`; bounded machine-readable snapshot saved in [`docs/evidence/issue2868-full-board-candidate-attribution.json`](./evidence/issue2868-full-board-candidate-attribution.json).

### Exact outcome

- 8,000,000 graph solver iterations; `solved=false`, `failed=true` with `PreparedPortPointRoutingSolver ran out of iterations`.
- **Route 1710**, `source_net_529_mst2` active; **893** unstarted graph routes remain, plus the active failed route. 1,710 graph-route completions are **not** 1,710 individually accepted electrical source nets.
- **80** corridor widenings, **38** unrestricted fallback starts, **0** global rerips. There are 1,672 local route successes and 38 unrestricted route successes before the failure; those are **graph-level path successes, not an electrical DRC qualification**.
- **Full-board strict/default and relaxed DRC were NOT reached**. No claim of 684-net physical connectivity or no shorts.

### Cost attribution: the dominant 38 unrestricted searches

| Graph work counter | All routing | Local corridor | Unrestricted fallback | Fraction in fallback |
|---|---:|---:|---:|---:|
| Candidate queue pops | **7,982,887** | 1,391,351 | **6,591,536** | **82.57%** |
| Neighbor-port scans | **187,946,546** | 37,584,579 | **150,361,967** | **80.00%** |
| Lower-bound cost rejection | **72,661,170** | 11,014,039 | **61,647,131** | **84.84%** |
| Candidate insertions | 34,842,690 | 7,098,602 | 27,744,088 | 79.63% |
| Different-net region reservation rejections | 17,774,292 | 2,777,651 | 14,996,641 | 84.37% |
| Different-net dynamic port-assignment rejections | 6,177,071 | 1,246,915 | 4,930,156 | 79.81% |
| Score rejection | 26,452,529 | 6,013,086 | 20,439,443 | 77.27% |
| Closed-hop rejection | 7,267,852 | 1,225,484 | 6,042,368 | 83.14% |
| Out-of-corridor neighbor consideration | 3,705,356 | 3,705,356 | 0 | 0% |

**Only 38 of 1,710 completed graph routes (2.22%)** needed an unrestricted fallback, yet those fallbacks account for **82.57% of all queue-pop operations** and **80% of all scanned neighbors** in the full-board run. This quantitatively proves that the global fallback search work, not the local-routing window itself, dominates the cap. The most common rejection in the global fallback is the **cost lower bound (61.65 million occurrences)**, versus 15.00 million fixed region-net reservation rejections and 4.93 million dynamic port-assignment rejections. The exact numbers are decision-counter events; **they are not mutually exclusive classifications of PCB errors** and some neighbor scans may reach multiple branches.

### Why the worst routes are expensive

The most expensive **24 completed** routes, retained by the bounded diagnostics snapshot, all needed unrestricted fallback. For each of the top 16, the local search consumed exactly **24,000** graph iterations across three windows, followed by roughly **331,000–353,000** more graph iterations in unrestricted fallback. Over **93% of its per-route graph iterations** in each of these cases occurred in fallback. Top-16 route-iteration-counter spans sum to **5,821,693** (72.77% of the 8M budget). The previous 512-Pipeline-step read-only sampler established the independent conservative lower bound of **5,814,272** for these top 16; the native instrumentation now narrows the attribution to actual route windows.

| Example route | Graph route ID | Total route iteration span | Unrestricted fallback span |
|---|---:|---:|---:|
| `source_net_280_mst5` | 1508 | 377,151 | 353,151 |
| `source_net_300_mst5` | 1502 | 373,467 | 349,467 |
| `source_net_328_mst5` | 1484 | 368,299 | 344,299 |
| `source_net_558_mst13` | 1216 | 365,990 | 341,990 |
| `source_net_232_mst5` | 1538 | 364,495 | 340,495 |
| `source_net_347_mst6` | 1356 | 363,977 | 339,977 |

The dominant problem is **candidate graph breadth and large-scale search repetition**, not only the GND plane or one blocked pad; the most expensive 16 routes belong to 16 distinct source nets. While region reservations do reject millions of candidates, this profiling **does not prove** a specific static-reservation bug nor explain why the 3, 9 and 27mm corridors could not finish those routes. In particular, don't treat rejected candidates as shorts, as illegally overlapping copper, or as proof a physically valid route exists.

### Targeted algorithmic next action

Do not increase `MAX_ITERATIONS`, hard-code more widening stages or disable DRC. **Research and prototype a reservation- and topology-aware search skeleton**: safely over-approximate graph reachability (including layer transitions, fixed net reservations and candidate masks), then allow an A* exploration tube around a cheaply found feasible skeleton, with geometric growth and unchanged original unrestricted fallback. If a reduced search fails, expand or run exact original search; never mark a required source pair connected or unroutable based on a heuristic alone. The new algorithm must preserve costs and current acceptance behavior, prove it cannot exclude valid candidate paths without an unrestricted fallback, and be measured on the *same fixed snapshot, with all source nets and physical copper/DRC constraints*.

Before implementation, add a small, deterministic **adversarial multi-layer detour graph** that forces current rectangular windows to fail while global routing succeeds, and unit-test the abstract skeleton's conservative reachability against fixed foreign-net region/port reservations. Only deploy such a change if it has an observable RED-before/GREEN-after test and does not regress `srj18` or original-board DRC and connectivity. This report is an evidence handoff, not an implemented algorithmic remedy.

### Reproduction

```sh
SRJ_FILE=/path/scanner-full-board.simple-route.json \
SEARCH_DIAGNOSTICS=1 CORRIDOR_MM=3 CORRIDOR_GROWTH=3 CORRIDOR_EXPANSIONS=2 \
CORRIDOR_WINDOW_STEPS=8000 WALL_BUDGET_SECONDS=1050 MAX_STEPS=16000000 EFFORT=1 \
bun scripts/repros/issue2868-qualify-adaptive.ts

bun scripts/repros/issue2868-summarize-search-diagnostics.ts /path/full-board-candidate-diagnostics.jsonl
```

An independent one-pair A/B with *all original obstacles and layers* and optional **diagnostics-only** (no corridor) produced the same output SHA and zero strict/relaxed DRC as the 3mm local search; source report: [`issue2868-search-diagnostics-one-pair-exact-output.md`](./issue2868-search-diagnostics-one-pair-exact-output.md). This validates non-interference in that reduced sample only.
