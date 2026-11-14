# Issue #2868: exact original-board progressive locality A/B — bounded 8M-iteration comparison

**Result: clear routing-search progress, but NOT qualified (no complete PCB yet).** This experiment uses the unmodified six-layer `scanner-full-board.simple-route.json` SHA-256 `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`, containing 684 source connections and 3,809 obstacle records. The total tiny graph has 2,604 point-pair routes. Both runs have the **same 8,000,000 graph-iteration limit** and same exact upstream/base optimization + local escape-anchor experimental code. No copper or source input was changed.

## Independent measured result

| Metric at global stop | Baseline without progressive locality | Experimental progressive locality |
|---|---:|---:|
| Initial margin, growth, max enlargements | Not applicable | 3mm, ×3, 2 enlargements, then unlimited |
| Per-local-window iteration budget | Not applicable | 8,000 |
| Global graph iteration cap | 8,000,000 | 8,000,000 |
| Active graph route at stop | 1209, `source_net_558_mst6` | 1710, `source_net_529_mst2` |
| Graph routes still queued (excluding current) | 1,394 | 893 |
| Additional routes passed before stopping | — | **501** |
| Adaptive window expansions | — | 80 |
| Adaptive unrestricted fallbacks | — | 38 |
| `solved`, `failed` | false, true | false, true |
| All-684 connection/Drc gate reached? | No | No |

The adaptive runner reduced the number of yet-to-be-started routes by **501 / 1,394 = 35.9% relative to baseline** at an identical 8M graph-iteration cap. This percentage is **not** a percentage of PCB connections completed, nor proof that individual nets were completed with DRC. It is a controlled comparison of progress through the fixed 2,604 point-pair route sequence. `routeId` is only meaningful in the exact run and route ordering.

The read-only engine status at 7,893,786 graph iterations showed route 1707, 38 unrestricted fallbacks, 79 intermediate window widenings and 1,708 local-window starts. The first experiment then reached the iteration cap at route 1710, with 80 widenings, 38 unrestricted fallbacks and 893 queued routes remaining. This pinpoints unrestricted search in rare difficult routes as a remaining high-cost area. It **does not** prove these routes are geometrically feasible or that tighter locality always helps.

## Next controlled A/B

Keep all source data, solver cost, acceptance gates, iteration budgets and feature logic unchanged. Change **only** `CORRIDOR_EXPANSIONS=4` (3,9,27,81,243mm windows, then exact unrestricted fallback), so that expensive hard routes attempt broader local search before the potentially enormous full-board graph. Compare cumulative progress and DRC qualification against both baseline and 2-expansion control. A true success requires the original 684 source connections, zero disconnected ports, zero missing source traces, and zero **strict/default and relaxed DRC** errors. Never label an iteration-only improvement as completed PCB routing.

## Provenance

- Full 2-expansion run: `/root/tscircuit-work-20261114/issue-2868/progressive-locality/full-board.jsonl`
- Full 4-expansion run: `/root/tscircuit-work-20261114/issue-2868/progressive-locality/full-board-expanded4.jsonl`
- Source-verified read-only summary: `bun scripts/repros/issue2868-summarize-adaptive.ts <log.jsonl>`
- The implementation is opt-in and disabled in all default Pipeline9 calls; the 3mm single-route reduced control passed strict/relaxed DRC with the *same output SHA* and stage steps reduced from 330,367 to 1,997. The single-route control is not a full-board proof.

Both tests use isolated fork-only branches. No upstream PR is merged or approved.

## Second A/B completed: four expansions are worse, reject the simple parameter increase

The four-expansion experiment also ran **the original SHA-verified source and the same 8M graph-iteration cap**. It completed with `solved=false`, `failed=true`, `PreparedPortPointRoutingSolver ran out of iterations` and therefore no full-board DRC qualification.

| Fixed 8M graph iteration stop | Two expansions | Four expansions | Difference |
|---|---:|---:|---:|
| Current graph route ID | 1710 | **1674** | **-36** routes progressed |
| Remaining graph routes in queue | 893 | **929** | **+36** still queued |
| Window widenings | 80 | **142** | +62 |
| Full unrestricted fallbacks | 38 | **35** | -3 |
| Prepared stage overall solved | false | false | No improvement |
| Final full-board strict and relaxed DRC | Not reached | Not reached | No qualification |

The final four-expansion bottleneck was `source_net_639_mst2` (route ID 1674). **Do not use a greater number of corridor expansions as a general fix**: it consumed more work on unsuccessful local searches, yet left more required paths unprocessed. The two-expansion experiment is the better-performing *control* among these two, but neither is an acceptable final-board fix.

**Engineering decision:** stop scalar tuning of locality margins. The next code change requires *per-route attribution* of candidate queue pops, closure/revisit, static reservation rejections, bounding-box rejected neighbors, and cost of unrestricted fallbacks. Identify high-cost routes and verify a specific causal mechanism with a before/after failing test prior to further changes. The geometric corridor remains opt-in, and the production solver is unchanged by default. The changed `package.json` pin to newer test-only / route-requeue lifecycle commits was made **after** these A/B experiments began: the A/B runtime used engine implementation commit `6658a7d` (later commits included regression tests and a same-ID route-epoch fix; no change to the original input). Do not present either experiment as a qualification of the updated runtime pin.

## Read-only route-sampling instrumentation qualification

The guarded adaptive reproduction script now reuses `RouteCostSampler` to observe the exact route ID and cumulative graph iterations every 512 Pipeline steps. It emits transition records and an explicit lower-bound summary; it does **not** alter the routing algorithm, route candidate queue, cost ordering, geometry or electrical tests. The independent one-pair test with unchanged original 3,809 obstacles and six layers completed with `solved=true`, `failed=false`, **1,997 route-stage Pipeline steps**, **1,959 inner graph iterations**, 0 strict/default/relaxed DRC, 0 missing source traces and 0 disconnected endpoints. The final output SHA-256 `7c4fb277e573696bd7c607aa800853f4d69c35e3f71d9664d38e56af719c8348` matched the prior *unsampled* adaptive route output exactly.

This control yielded four read-only graph samples of the one route. Its first/last observed graph-iteration boundary (303 to 1,839) gives a **sampled lower bound of 1,536** graph iterations, not the exact 1,959 total. The distinction is explicitly represented by the summarizer. The source-tested artifacts are in `/root/tscircuit-work-20261114/issue-2868/progressive-locality/isolated-sampled-control.jsonl` (local authorized Linux VPS). TypeScript and 7 sampler/frontier tests passed. **This does not prove any full-board route quality, source-net electrical connectivity, or complete-board DRC.**
