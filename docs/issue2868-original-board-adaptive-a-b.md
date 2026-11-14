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
