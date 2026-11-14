# #2868 — read-only candidate-level diagnosis, exact-output A/B control

**Verified on 2026-11-14. Diagnostic experiment, not a complete-board fix.** The source board has SHA-256 `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`. The **one-pair derived** control fixture SHA-256 is `ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071`, contains one `source_net_558` top-layer pair separated by 7mm, preserves all **3,809 original obstacles and six layers**, and omits irrelevant route requests/diff-pair metadata. This is not evidence of a completed 684-connection PCB.

## Implementation and guardrails

`tiny-hypergraph` optional `ROUTE_SEARCH_DIAGNOSTICS` tracks candidate pop, neighboring port scans, existing-hop closure, source/destination reservation rejection, state assignment rejection, cost-bound and scoring rejection, candidate insertion and goal discovery. It attributes per-route costs to bounded spatial windows versus unrestricted fallback; snapshots retain at most 24 expensive completed routes plus active route to bound memory. The instrumentation is **read-only** and can run even if locality is entirely disabled. The normal production solver has diagnostics disabled, and does not allocate the probe. Native/general incidence, regional hop frontier and prepared dense search paths are covered by dedicated unit tests; the large original graph uses the native/general path.

Counters **are not mutually exclusive counts of physically invalid copper**: `neighborScanned` is the number of neighbor considerations; other counters enumerate branches only when reached. In a dense prepared frontier, some reservation counters are incremented at frontier construction rather than each scan. Per-route graph iterations do not equal queue pops, because starting routes/window rollover also take outer `_step()` iterations. No result bypasses strict/default or relaxed DRC or physical source-terminal checks.

## A/B: same one pair, exact same routed output, no geometry differences

| Measured item | Diagnostic-only **unrestricted** native graph search | Opt-in 3mm local search + diagnostic |
|---|---:|---:|
| Graph inner iterations | **330,362** | **1,959** |
| Pipeline `portPointPathingSolver` outer steps | **330,367** | **1,997** |
| `queuePop` | **330,360** | **1,957** |
| `neighborScanned` | **8,331,181** | **56,745** |
| `candidateQueued` | **1,531,940** | **7,513** |
| `lowerBoundRejected` | **5,328,207** | **16,499** |
| `bestCostRejected` | **257,909** | **4,477** |
| `closedHop` | **314,463** | **1,825** |
| `scoreRejected` | **662,243** | **7,890** |
| `neighborOutOfCorridor` | 0 | **17,256** |
| `goalSeen`, `pathFound` | 1 / 1 | 1 / 1 |
| Global/local rerip, failed | 0 / 0, false | 0 / 0, false |
| Strict/default DRC errors | **0** | **0** |
| Relaxed DRC errors | **0** | **0** |
| Disconnected endpoints / missing source traces | 0 / 0 | 0 / 0 |
| Routed output SHA-256 | `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348` | **identical** |

The observed **neighbor-scan reduction is ~99.32%** on this reduced control (8.33M → 56.7k). `queuePop` reductions exceed 99% too. This is a **search workload** improvement in the one-pair control, not a full-board claim. Total Pipeline wall time is dominated by preprocessing, topology creation, DRC and postprocessing; do not present the neighbor reduction as the same percentage of end-to-end elapsed time.

## Reproduce independently

```bash
SRJ_FILE=/path/to/derived-one-pair.srj.json SEARCH_DIAGNOSTICS=1 DISABLE_CORRIDOR=1 \
  bun scripts/repros/issue2868-qualify-adaptive.ts

SRJ_FILE=/path/to/derived-one-pair.srj.json SEARCH_DIAGNOSTICS=1 \
  CORRIDOR_MM=3 CORRIDOR_EXPANSIONS=2 CORRIDOR_WINDOW_STEPS=8000 \
  bun scripts/repros/issue2868-qualify-adaptive.ts

bun scripts/repros/issue2868-summarize-search-diagnostics.ts /path/to/run.jsonl
```

The runner rejects any input SHA other than the original or the isolated derived fixture. It emits `route-search-diagnostics-final` and runs DRC **only after** the routing pipeline actually solves. The summary distinguishes `failed`, `incomplete` and `qualified` statuses, never silently qualifying an incomplete run. Evidence logs on the authorized VPS: `issue-2868/search-diagnostics/single-unbounded-diagnostic-control.jsonl` and `issue-2868/search-diagnostics/single-source-net-558.log`.

## Full-board hypothesis to test, not assume

Previous uninstrumented 684-connection run, same 8M graph cap, showed ~38 unrestricted fallback events and 16 distinct-nets' most expensive routes consumed at least 72.68% of the budget; source-linked report: [`issue2868-adaptive-fallback-cost-localization.md`](./issue2868-adaptive-fallback-cost-localization.md). The full-board candidate-level probe must identify **what is inside those 350k–375k iteration events**: unrestricted window neighbor scans versus bounded window rejections, static foreign-net reservations, dynamic assignments and cost-bound rejection. Only that can justify the next algorithmic improvement; avoid changing global iteration caps or locality widths speculatively.
