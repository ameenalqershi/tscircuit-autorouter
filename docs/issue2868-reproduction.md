# Issue #2868 — reproducible regional routing evidence (not a full-board solution)

See [issue](https://github.com/tscircuit/tscircuit-autorouter/issues/2868), [memory PR #3774](https://github.com/tscircuit/tscircuit-autorouter/pull/3774) and [spatial-index PR #3775](https://github.com/tscircuit/tscircuit-autorouter/pull/3775).

The original issue attachment is public: [scanner-full-board.simple-route.zip](https://github.com/user-attachments/files/33037296/scanner-full-board.simple-route.zip). Download and extract the original JSON (46,672,854 bytes, SHA-256 `471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca`).

Recreate five deterministic regions without manually modifying the source fixture:

```bash
node scripts/repros/issue2868-derive-regions.cjs /path/to/scanner-full-board.simple-route.json .tmp-issue2868-reduced
bun install
SRJ_FILE=.tmp-issue2868-reduced/region-30mm.json WALL_BUDGET_SECONDS=120 bun scripts/repros/issue2868-qualify.ts
```

The reducer retains all original obstructing geometry intersecting the chosen crop and only complete connections with all endpoints inside. It also retains differential pairs only when both connections remain present. **Crops introduce artificial board edges and omit external routing constraints; they are tests, not electrically interchangeable with the full original board**.

Recorded on six-core Linux/Bun 1.4.4 with the combined PR #3774+#3775 code: regions 10/20/30mm contained 1/6/18 full connections, respectively, solved with zero DRC errors, zero disconnected PCB ports and missing source traces on the explicitly re-checked 30mm variant. Full serialized output SHA-256 was identical to the unmodified base in all three regions. 40mm with 28 connections solved, but had 7 DRC errors **in both baseline and modified versions** and identical output hash. Do not count it as a passing DRC case. The 50mm crop with 77 connections also reproduces the 2,000,002-iteration port-pathing budget on the original graph input subset under 16 GB RAM; an iteration-limit event is not by itself proof that the overall board is unroutable.

The harness reports 100% completion only if the solver finishes, every original connection name is represented and both relaxed/default DRC and port/source-trace connectivity checks pass. Its checks are still not a substitute for review against the original complete 684-connection design and fabrication rules.

Use this branch for diagnostic evidence only; it is **not another PR** and does not close #2868.

### Original six-layer differential pair check

The reducer also emits `diffpair-4-5.json`, containing both original `source_trace_4` and `source_trace_5`, the original differential-pair length-tolerance rule, and 56 intersecting obstacles. Run:

```bash
SRJ_FILE=.tmp-issue2868-reduced/diffpair-4-5.json WALL_BUDGET_SECONDS=120 bun scripts/repros/issue2868-qualify.ts
```

In the combined-code local proof, the differential pair was fully routed (`solved=true`, 2/2 connection names, zero relaxed/default DRC errors, zero disconnected ports, zero missing source traces) in 1.4 seconds at ~328 MB RSS. This is **one** of the original 19 differential pairs, not coverage of all 19.

### Bounded 77-connection full-solve comparison (important limitation)

The original unmodified `main` and the combined PR #3774+#3775 versions both completed the 50×50 mm crop with **77/77 represented connection names**, **107 PCB trace objects**, `solved=true`, and no disconnected PCB ports or missing source traces. They each required **2,225,912 solver steps**, including a `portPointPathingSolver` stage that reached **2,000,002 iterations**. Both generated **exactly the same serialized output SHA-256** `5d71391b3185a3ed8243dff4c6dcdbc57aedf0f52b8a9b41cbbaabfb8db035d0`, and the *same 13 DRC error signatures*. This is strong evidence that neither performance patch introduced those geometry/DRC problems, **not** evidence that the DRC violations are acceptable or that the entire 684-connection board is fixed.

Observed timings are noisy single measurements: baseline 168.0 sec / 2,282 MB RSS, combined 168.9 sec / 2,580 MB RSS, so **do not claim an end-to-end speedup for this 77-connection subset**. The indexed lookup was measurably faster in the separate full-original-attachment necessary-cramped-stage microbenchmark, but that did not translate into a provable total-run improvement here.
