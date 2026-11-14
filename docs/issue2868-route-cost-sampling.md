# #2868 — route-cost sampling protocol (experimental, not an optimization patch)

The previous exact SHA-verified run reached the GLOBAL `8,000,000` graph-iteration cap after processing a substantial number of routes. Route ID `1209` was current at the stop but **no measurement demonstrated it was individually expensive**. There were 11,508 candidate items still queued and 1,394 routes still awaiting processing.

To distinguish a few expensive routes from globally expensive routing, this optional harness observes the current route ID **every 512 outer pipeline steps**, and emits `route-observation` when a *different route ID* is seen. The sampler is read-only: it never edits route graph, costs, committed assignments, rerip decisions or order. It reports the observed span of graph iterations as a **lower bound** for each sampled route; short routes may be missed entirely, and a sample transition is not an exact route start/end event.

Reproduce with the identical unmodified SHA-256 input `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`:

```sh
SRJ_FILE=/absolute/path/scanner-full-board.simple-route.json \
MAX_STEPS=11000000 WALL_BUDGET_SECONDS=720 EFFORT=1 \
bun scripts/repros/issue2868-qualify-route-cost.ts

bun test tests/repro/issue2868-route-cost-sampler.test.ts
```

At termination it emits `route-observation-summary` with sampled route count and largest **observed lower-bound** spans. It still applies the original full-board qualification checks only if all routing stages actually finish. No output of this sampler is by itself PCB DRC, connectivity, or physical copper proof.
