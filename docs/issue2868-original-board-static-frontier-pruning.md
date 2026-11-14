# #2868 — Immutable owned-frontier neighbor pruning: positive graph-work benchmark, NOT full-board PCB fix

**2026-11-14. This is a narrow, opt-in `tiny-hypergraph` graph-search performance patch, not a claim that all source connections route.**

## Exact input and parameters

Original source SRJ SHA-256 **`471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`**, **684 source connections**, **3,809 obstacles**, **six layers**, 2,604 derived graph point-pair route requests. No nets, fixed masks, obstacle shapes, via rules, copper pours, DRC or route requests removed. Same `Pipeline9`, 3mm→9mm→27mm local corridor, per-window 8k iterations, native unrestricted fallback, exactly **8,000,000** graph-iteration global cap and opt-in read-only diagnostics. The only A/B difference is `PRUNE_STATIC_FRONTIER=1`, mapped through Pipeline9 to `PRUNE_STATIC_FRONTIER_REJECTIONS=true` in the `tiny-hypergraph` solver. **Default remains off**, to avoid altering other agents' work.

## What the change does

`OWNED_REGIONAL_HOP_FRONTIER` already keeps a **per-route, queue-epoch scoped linked list of region neighbors**. When a neighbor is provably rejected by the fixed `portSectionMask`, missing port incidence, an endpoint reserved to another net, the currently fixed port assignment, or the `regionNetId` reservation for another net, the new opt-in path unlinks that neighbor from the **temporary frontier** for the rest of the *same route*. The existing closed-hop invalidation, route epoch, goal precedence, geometric segment scoring, `g`, heuristic `h`, candidate insertion, queue priority, global assignment, and copper rules remain unchanged. No global/static problem arrays are modified. Frontiers are invalidated on heap clear, route ID/net changes, so a later route can reconsider different-net neighbors.

Because these rejections are stable during a single candidate search, they need not be rechecked on subsequent candidate expansions of the same region. This is a **per-route performance cache**, not a heuristic claim that a region is electrically disconnected; dynamic rerip still uses the native solver.

## Full original board: exact-SHA A/B

| Counter | Reference | Pruned-frontier experiment | Difference |
|---|---:|---:|---:|
| Graph iterations | 8,000,000 | 8,000,000 | **0** |
| Queued candidate pops | 7,982,887 | 7,982,887 | **0** |
| Candidate insertions | 34,842,690 | 34,842,690 | **0** |
| Candidate lower-bound rejections | 72,661,170 | 72,661,170 | **0** |
| **Neighbor-port scans** | **187,946,546** | **171,180,853** | **−16,765,693 (−8.920%)** |
| Rejections of different-net reserved region during search | 17,774,292 | 1,008,599 | −16,765,693 |
| Unique temporary neighbor entries excluded from future scans | — | **1,010,215** | — |
| Global route completed / currently active | 1,710 / 1,710 | 1,710 / 1,710 | identical |
| Unrouted queue length | 893 | 893 | identical |
| Widenings / unrestricted fallbacks | 80 / 38 | 80 / 38 | identical |
| Full-board routing / final strict & relaxed DRC | **FAILED / not reached** | **FAILED / not reached** | NOT SOLVED |
| End-to-end elapsed seconds on shared VPS | 551.3 | 528.6 | −22.7 observed; not an isolated timing proof |

The exact identity of graph route progression (including every sampled route observation), candidate queue pop counts, candidate insertions and lower-bound rejections is strong evidence that this patch **does not change route ordering** under this source snapshot and routing configuration. The lower count of different-net region rejection branches is expected: excluded region neighbors no longer reach that branch on subsequent expansions.

**Importantly:** Only **1,010,215 frontier list entries** were pruned; that resulted in **16.77 million repeated neighbor scans avoided**. Do not call these 1.01 million copper shorts, lost source endpoints or distinct user nets. Graph route ID 1710 remains active at the unchanged 8M cap, 893 graph routes still queued, **full physical DRC and original 684-source terminal connectivity were NOT reached**.

Machine-readable and SHA-guarded A/B receipt: [`docs/evidence/issue2868-static-frontier-original-board-ab.json`](./evidence/issue2868-static-frontier-original-board-ab.json). Reproducer: [`scripts/repros/issue2868-compare-static-frontier.ts`](../scripts/repros/issue2868-compare-static-frontier.ts). Original raw run logs on authorized VPS: `issue-2868/search-diagnostics/full-board-candidate-diagnostics.jsonl` and `issue-2868/frontier-pruning/full-board.jsonl`. Library source revision `8bc7bc1487de4d510fe578d24cdd8db76d59abf5` and Pipeline9 integration revision `f895db737210d476b91362f8153a8d2f5fcd544f`; later commits add only additional tests and report scripts.

## Electrical and regression checks

One **source-derived pair** retains the original 3,809 obstacles and six layers. With cache enabled, graph effort remains **1,959 iterations**, routed output SHA-256 **`7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348`** (identical baseline). **0 default/strict DRC errors, 0 relaxed DRC errors, 0 disconnected source ports, 0 missing traces**. This does not qualify the full board. Dedicated tests include repeated-region masks, multiple deterministic port-mask variations, competing independent source nets, native/general incidence, and preserved assignment and route parity; other `tiny-hypergraph` tests confirm owned frontier and bounded fallback behavior. TypeScript typechecks passed.

## Recommendation and scope of integration

Worth submitting as a **narrow performance-only upstream PR** after rebasing the core/isolated tests on upstream `tiny-hypergraph/main`, with `PRUNE_STATIC_FRONTIER_REJECTIONS` **disabled by default** and no dependency on local-window search or instrumentation. **Do not** merge the broader experimental fork wholesale. Treat original-board #2868 as **OPEN** until all physical source connections are complete and both DRC modes pass; the remaining failure is dominated by the large number of real candidate pops and cost-bound rejections in 38 unrestricted A* fallbacks. This patch reduces neighbor-scan overhead but does not reduce the search iteration cap, so a separate deeper algorithmic change is still required for full routing.

## 2026-11-14 safety hardening after cross-review of upstream PR #283

After completing the A/B run, we discovered that upstream owner [tiny-hypergraph PR #283](https://github.com/tscircuit/tiny-hypergraph/pull/283) already implements similar fixed-neighbor retirement and intentionally **leaves dynamic port assignments live**. In our separate prototype, an earlier implementation also unlinked the **goal port** when its `state.portAssignment` was owned by another net. That is not immutable across a frontier epoch. We added an adversarial RED-before/GREEN-after regression in `tests/owned-regional-hop-frontier-parity.test.ts`: the first expansion sees the goal temporarily assigned to another net, the next expansion in the same owned frontier epoch must reconsider the goal after that assignment clears. The pre-fix experimental code failed this parity test; the corrected code passes, leaving only **static mask, absent incidence, fixed endpoint reservation, and fixed foreign-region reservations** eligible for caching.

**Pinned safe library revision:** `f92834e92ed43d36c5655b454207210531333d43`; the autorouter integration now pins that exact revision. Engine regression: **27 passed, 897 expectations** with strict targeted TypeScript compilation. The full-board A/B receipt on this page was collected against the **pre-hardening experimental source** `8bc7bc1`, NOT re-run on the later revision. However, the full-board counter `staticFrontierPruning.otherNetPortAssignment` was **exactly zero** in that run, so the unsafe dynamic-goal branch was not triggered there; all 1,010,215 removals were `otherNetRegionReservation`. The benchmark is **evidence for the fixed-region-pruning mechanism**, not a claim of a new full-board benchmark of the hardened commit. The one-pair control previously preserved exact output and zero DRC, but was also collected before this safety-only change. No production PR was opened because of the overlapping owner PR #283. The safe fork remains **disabled by default** and #2868 still fails the 8M iteration cap.

### Post-hardening source-derived electrical rerun: **PASS**

After pinning the corrected dynamic-occupancy-safe library revision `f92834e92ed43d36c5655b454207210531333d43`, we performed a **fresh independent end-to-end electrical rerun** of the one-pair `source_net_558` control (source-derived input SHA-256 `ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071`, retaining all original 3,809 obstacles and six layers). On the corrected code, Pipeline9 **solved** at graph iteration **1,959**, output SHA-256 **`7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348`** (identical to native/local baseline), with **0 strict/default DRC, 0 relaxed DRC, 0 missing source traces, and 0 disconnected PCB ports**. The run's `staticFrontierPruning.otherNetPortAssignment` remained **0**. Original raw log and source+code provenance on the authorized VPS: `issue-2868/frontier-pruning/onepair-safety-hardened.jsonl` and `issue-2868/frontier-pruning/safety-control-provenance.txt`. This freshly verifies electrical noninterference of the **hardened** implementation on this one-pair subset, **not** on the full board. The complete 684-source original board **has not been rerun after this hardening edit** and remains unqualified.
