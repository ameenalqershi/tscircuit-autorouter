# #2868 — bounded XY corridor search: exact-output, zero-DRC isolated control

**Experimental proof, NOT an upstream production routing patch.** No claim of full 684-connection board completion. The corridor mask is deliberately hard-guarded to a **single, derived, two-port control** with the **unchanged original 3,809 obstacle records and all six layers**.

## Provenance and guard

Original issue attachment SHA-256: `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`. The derived control retains the exact 3,809 physical obstacles, six layers and original board bounds, but keeps only original `source_net_558` endpoints `pcb_port_127` (top, -2.9751, -34.1658) and `pcb_port_1370` (top, 4.0249, -34.1658), separated by **exactly 7 mm**, removing unrelated route requests and now-irrelevant differential-pair metadata. Derived input SHA-256 `ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071`.

The diagnostic script **refuses** inputs with any different SHA, more than one connection, or any differential-pair requests; it also requires the explicit `ALLOW_CORRIDOR_EXPERIMENT=1` environment flag. It must never be run as a replacement for whole-board DRC or as a production mask of graph terminals.

## A/B and two different margins — same exact output SHA

| Metric | Original unbounded isolated control | 3-mm padding around endpoint rectangle | 8-mm padding |
|---|---:|---:|---:|
| Available graph ports | 346,278 | 1,989 | 9,182 |
| Existing graph ports deliberately masked | 0 | 344,289 | 337,096 |
| PortPointPathing stage outer steps | **330,367** | **1,997** | **8,814** |
| Stage-step reduction versus baseline | — | **99.40% (~165× fewer)** | **97.33% (~37.5× fewer)** |
| Full Pipeline outer steps | 482,802 | 154,399 | 161,216 |
| Total Pipeline wall time | 63.7s | 64.9s | 61.7s |
| `solved`, `failed` | true, false | true, false | true, false |
| Default/strict DRC errors | 0 | 0 | 0 |
| Relaxed DRC errors | 0 | 0 | 0 |
| Disconnected ports or missing source traces | 0 | 0 | 0 |
| Final routed output SHA-256 | `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348` | **identical** | **identical** |

No wall-time improvement is claimed: the initial graph preparation, downstream DRC and repair dominate this reduced one-net control. This is **a measured reduction in search steps**, potentially valuable when search dominates a large board as in #2868. The full original-board `8,000,000` graph-iteration failure still needs a real solution.

## Implementation of the diagnostic

After the one-route `solveGraph` solver exists but before its first iteration (`graphIterationsAtMask=0`), the script gets its actual numeric start/goal ports and original topology XY positions. It creates a simple axis-aligned bounding rectangle expanded by the requested margin. It sets `problem.portSectionMask[i]=0` for previously enabled ports outside this rectangle, retaining start/goal unconditionally, and runs **the otherwise unchanged tiny-hypergraph solver and full Pipeline9 output validation**. No input SRJ fields, copper obstacles or layer count are edited. Only the one test route's in-memory graph mask is mutated for diagnostic purposes.

The ~165× step reduction from keeping 1,989 of 346,278 candidate ports suggests the solver's expensive search of the entire board-scale graph contributes substantially even when a valid output trace is local. The near-linear port-count/step-count relationship is an observation, **not yet an instrumented causal count of all popped/stale candidates**.

## Production-safe design **to implement and verify**, NOT present in this experiment

1. **Do not permanently modify the shared graph mask.** Create a route-scoped candidate restriction/visibility overlay with a clear lifetime; restore it before subsequent routes. Original fixed section masks and reservations always take precedence.
2. For a short connection, try the smallest plausible locality window around its terminals. The window needs to consider current-layer geometry, usable via transitions, obstacle clearances, topology, and possible detours. An XY box by itself is **not universally valid**.
3. If the local search has no valid path, expand the window geometrically and restart that route with a fresh candidate frontier, without losing committed routes or carrying stale costs/closed-hop state. The final fallback must be the exact **unrestricted** solver, not a false `unroutable` classification. Cap retries and total work.
4. Validate candidate traces with the existing DRC and source-ID connectivity gates; no coincident ports or power-plane rectangles count as electrical connections by assumption.
5. Reproduce and A/B against the exact **full** #2868 board with all 684 logical source connections and zero strict/relaxed DRC. All tscircuit benchmarks, especially srj18 sample11 and stacked-layer MST regressions, must remain non-regressed.

## Reproduce

```
# Baseline (existing local stage-qualified control):
SRJ_FILE=/absolute/path/derived-pair.srj.json bun scripts/repros/issue2868-qualify.ts

# Diagnostic 3 mm:
ALLOW_CORRIDOR_EXPERIMENT=1 CORRIDOR_MM=3 SRJ_FILE=/absolute/path/derived-pair.srj.json bun scripts/repros/issue2868-qualify-corridor-isolation.ts

# Diagnostic 8 mm:
ALLOW_CORRIDOR_EXPERIMENT=1 CORRIDOR_MM=8 SRJ_FILE=/absolute/path/derived-pair.srj.json bun scripts/repros/issue2868-qualify-corridor-isolation.ts
```

On the authorized remote server, evidence for the control is `.../issue-2868/anchor-verify/route1209-isolation/isolation-clean.jsonl`, and for the two corridor widths `.../issue-2868/corridor-isolation/margin3.jsonl` and `margin8.jsonl`. This is an experimental fork-only proof, not a merged PR or a full-board solution.
