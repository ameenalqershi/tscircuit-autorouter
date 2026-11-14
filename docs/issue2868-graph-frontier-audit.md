# Issue #2868 — read-only route frontier audit

Status: diagnostic experiment, not a production routing fix. No claim of whole-board success or DRC clearance.

## Input and controls

The harness expects the **unmodified** `scanner-full-board.simple-route.json` attachment, SHA-256 `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca` (684 source connections, 3,809 obstacles, six layers). It uses the exact combined performance baseline `fa7fe9202e45c747ae05a6c4b295c86f460e492e` plus the local pad-to-own-escape-via MST candidate patch used in the earlier 528.1-second experiment. This is not the production main branch.

The read-only probe inspects the active `PreparedPortPointRoutingSolver` as it runs, without writing to its topology, reservations, committed routing assignments, or queue. It records the currently blocked route ID, start/goal numeric port IDs, net, incident regions, their layer masks, reservation net IDs, nearby committed owner route IDs, and graph candidate queue size.

It performs three **necessary-only** graph accessibility diagnostics on region adjacency:

- `geometry`: ignore static net reservations and already assigned ports, but keep active section masks.
- `fixedNet`: respect fixed-net endpoint and region restrictions, ignore dynamic assigned ports.
- `occupied`: respect both fixed-net restrictions and committed port assignments.

These checks do not model actual trace crossings inside a region or exact copper geometry; a `true` result is **not** proof of physical routability. The BFS aborts at 1.5 million inspected incidences to enforce a bound. It uses the routing solver's actual chosen initial region where available.

`STATIC_REACHABILITY_PRECHECK_MAX_HOPS` in the dependency is only 16 by default; it intentionally treats reaching that hop count as *unknown but possibly reachable*. This audit is not interchangeable with that inexpensive precheck and must not be enabled on every normal route.

## Reproduce

```sh
SRJ_FILE=/absolute/path/scanner-full-board.simple-route.json \
WALL_BUDGET_SECONDS=720 MAX_STEPS=11000000 EFFORT=1 PROBE_ROUTE_ID=1209 \
bun scripts/repros/issue2868-qualify-owner-trace.ts

bun test tests/repro/issue2868-read-only-frontier-probe.test.ts
```

The harness includes original full-board qualification logic; if routing finishes, it checks relaxed and default/strict DRC, missing source traces, unconnected ports, and emitted connections. A completed `frontier-probe` record alone does not constitute a qualified solve.

## Safety notes

- Always compare with the same exact source SHA and solver revision.
- Graph route IDs and route order are not stable across algorithm changes; verify `connectionId` and source PCB ports, not just numeric route 1209.
- If `geometry=true`, `fixedNet=true`, `occupied=false`, committed assignments are a necessary blocker under current routing. If `occupied=true` but routing still fails, geometric segment crossings or search-order/cost combinatorics remain possible.
- Do not infer physical shorts from SRJ copper-pour rectangles; qualify against **final** copper with cutouts, annular clearances, trace connectivity and DRC.
- Preserve other contributors' branches and PRs. No merge to `main` or update of PR #3784 without the maintainer's standard regression gate.
