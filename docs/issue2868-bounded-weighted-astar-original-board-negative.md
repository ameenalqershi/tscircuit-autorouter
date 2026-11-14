# #2868 — bounded weighted-A* with exact fallback: **negative original-board result**

**Date: 2026-11-14. Reject production enablement at tested settings.** Isolated A* algorithmic experiment at the graph-search bottleneck, not a successful routing/DRC fix.

## What was actually implemented

A new **opt-in** `LOCAL_ROUTE_WEIGHTED_FALLBACK_FACTOR` and `LOCAL_ROUTE_WEIGHTED_FALLBACK_ITERATIONS` in `tiny-hypergraph`'s `PreparedPortPointRoutingSolver`. Only after the local corridor exhausts its 3, 9 and 27mm windows and transitions to unrestricted search, try a bounded **weighted-A*** candidate queue with priority `f = g + factor × originalEuclideanH`. The cost function `g`, graph reservations, permanent route assignments, candidate mask, segment geometry and copper DRC are **unchanged**. On success, accept a regular native graph route; on exhaustion or hitting the **independent bounded window iteration cap**, clear only the tentative candidate queue/best costs, return to the **original exact unweighted unrestricted solver**, and retain existing network/trace checks. Without the option, all routing remains as before.

The library branch is [experiment/2868-adaptive-astar-fallback-20261114](https://github.com/ameenalqershi/tiny-hypergraph/tree/experiment/2868-adaptive-astar-fallback-20261114). Pipeline9 fork: [experiment/2868-bounded-weighted-astar-validation-20261114](https://github.com/ameenalqershi/tscircuit-autorouter/tree/experiment/2868-bounded-weighted-astar-validation-20261114). Commits were isolated from other agents' branches; **no production PR, no merge**.

## Original-board controlled A/B

Original board SHA-256: `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`. Identical **684 source connections, 3,809 obstacles, six layers**, graph cap **8 million iterations**, local windows 3/9/27mm, `SEARCH_DIAGNOSTICS=1`, default same scoring and DRC rules. Experimental bounded fallback factor `64`, maximum `32,000` graph iterations per weighted attempt before returning to unweighted search. Baseline used the same source and graph limits without weighted attempts.

| Graph metric | Baseline | Factor 64, capped 32k + exact fallback |
|---|---:|---:|
| Attempts of weighted unrestricted fallback | 0 | 38 |
| Weighted attempt successes / exact retries | — | 19 / 19 |
| Graph iterations | 8,000,000 | 8,000,000 |
| Last route ID on cap | **1710** | **1705** |
| Remaining route queue | **893** | **899** |
| Queue pops | 7,982,887 | **7,982,890** |
| Native neighbor-port scans | 187,946,546 | **188,979,076** |
| Lower-bound cost rejections | 72,661,170 | **73,523,094** |
| Full-board qualification | **FAIL** | **FAIL** |
| Strict/relaxed DRC on all 684 source nets | **not reached** | **not reached** |

Source logs remain on the authorized VPS: `issue-2868/search-diagnostics/full-board-candidate-diagnostics.jsonl` and `issue-2868/weighted-astar/full-board.jsonl`. [Machine-readable exact-SHA A/B receipt](./evidence/issue2868-bounded-weighted-full-ab.json).

**Interpretation:** In this exact full-board experiment, allowing 19 shorter weighted attempts did not offset the extra search work on the 19 failures. We scanned **1,032,530 more neighbor ports** and completed **five fewer route IDs** (six more tasks waiting); the original-board challenge remained unsolved. Small differences in wall time are not a reliable improvement signal due concurrent server load; the graph-work counters are decisive.

### Reduced-source electrical control

One source-derived pair of `source_net_558`, preserving all original **3,809 obstacles** and **six layers**, deliberately forced immediate unrestricted fallback with a 0.001mm initial corridor. The weighted 32k candidate attempt **failed and correctly returned to original unrestricted A***, yielding final output SHA `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348` identical to the known native baseline. **Zero default/strict and relaxed DRC errors**, missing source traces **0**, disconnected terminals **0**. The extra attempt made the reduced graph route slower, not better. This reduced control cannot qualify the full board.

## Decision

**Do not enable the factor-64 bounded weighted-A* experiment in production** or claim issue #2868 resolved. This research branch remains disabled by default for reproducibility. A next algorithmic attempt should focus on avoiding repeated **immutably forbidden frontier-neighbor expansions**, preserving native candidate order/cost (as in the separately evaluated `STATIC_FRONTIER_REJECTION` caching branch). Each change must be measured against the exact original source and eventual full-board DRC/connectivity evidence.
