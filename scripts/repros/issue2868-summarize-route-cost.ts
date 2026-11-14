/** Summarize sampled global graph routes; never silently promote samples into exact per-route timing. */
import { readFileSync } from "node:fs"
const path = process.argv[2]
if (!path) throw new Error("Supply the original-board route-cost .jsonl file")
const rows = readFileSync(path, "utf8")
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
const input = rows.find((r) => r.tag === "input")
if (
  input?.inputSha256 !==
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
)
  throw new Error("Original issue attachment SHA mismatch")
const obs = rows.filter((r) => r.tag === "route-observation")
const summary = rows.find((r) => r.tag === "route-observation-summary")
const end = rows.find((r) => r.tag === "end")
const debug = rows.find((r) => r.tag === "prepared-route-debug")
const qualifies = rows.find((r) => r.tag === "qualification")
const name = new Map<number, string>(obs.map((x) => [x.routeId, x.routeName]))
const top = (summary?.topObservedSpans ?? [])
  .map((x: any) => ({ ...x, routeName: name.get(x.routeId) ?? null }))
  .slice(0, 20)
const candidateStats = obs.length
  ? {
      observedEvents: obs.length,
      uniqueRouteIds: new Set(obs.map((x) => x.routeId)).size,
      firstObservedIteration: obs[0].graphIterations,
      lastObservedIteration: obs.at(-1).graphIterations,
      maxCandidateQueueSeen: Math.max(
        ...obs.map((x) => x.candidateQueueLength),
      ),
    }
  : null
const conclusion =
  qualifies?.qualified === true
    ? "full-board-qualifies"
    : end?.failed
      ? "global-solver-failed"
      : end
        ? "bounded-incomplete"
        : "run-in-progress"
console.log(
  JSON.stringify(
    {
      sourceSha256: input.inputSha256,
      conclusion,
      graphRouteCount: debug?.graphRouteCount ?? null,
      unprocessedAtStop: debug?.remainingQueuedRoutes ?? null,
      graphIterationCap: debug?.maxIterations ?? null,
      graphIterationsAtStop: debug?.executedIterations ?? null,
      stats: candidateStats,
      reportedSummary: { ...summary, topObservedSpans: undefined },
      topObservedLowerBounds: top,
      warning:
        "This is sampled, misses short routes, is not a distribution of exact route costs, and does not establish legal physical copper or DRC qualification",
    },
    null,
    2,
  ),
)
