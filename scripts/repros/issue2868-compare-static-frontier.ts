/** Exact-SRJ, read-only A/B candidate scanner and routing qualification comparator. */
import { readFileSync } from "node:fs"
const originalSha =
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
const reducedSha =
  "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071"
export function compareStaticFrontierRuns(
  baselineRaw: string,
  optimizedRaw: string,
) {
  const parse = (s: string) =>
    s
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
  const base = parse(baselineRaw),
    opt = parse(optimizedRaw)
  const last = (rows: any[], tag: string) =>
    rows.filter((row) => row.tag === tag).at(-1)
  const inputs = [last(base, "input"), last(opt, "input")]
  if (
    !inputs[0] ||
    !inputs[1] ||
    inputs[0].inputSha256 !== inputs[1].inputSha256 ||
    ![originalSha, reducedSha].includes(inputs[0].inputSha256)
  )
    throw Error("Unknown or mismatched SRJ SHA; refusing comparison")
  const analyze = (rows: any[]) => {
    const c = last(rows, "corridor-final"),
      q = last(rows, "qualification"),
      d = last(rows, "route-search-diagnostics-final"),
      end = last(rows, "end"),
      a = last(rows, "adaptive-stats")
    return {
      complete: !!end && !!c && !!q && !!d,
      failed: end?.failed ?? null,
      graphIterations: c?.iteration ?? null,
      activeGraphRoute: c?.route ?? null,
      remainingQueued: a?.remainingQueued ?? null,
      completedGraphRouteCount: d?.completedRouteCount ?? null,
      widened: c?.stats?.widened ?? null,
      unrestrictedFallbacks: c?.stats?.fullFallbacks ?? null,
      queuePops: d?.totalByReason?.queuePop ?? null,
      neighborScans: d?.totalByReason?.neighborScanned ?? null,
      lowerBoundRejected: d?.totalByReason?.lowerBoundRejected ?? null,
      otherNetRegionRejections:
        d?.totalByReason?.differentNetRegionReservation ?? null,
      otherNetPortAssignmentRejections:
        d?.totalByReason?.differentNetPortAssignment ?? null,
      pruned: c?.staticFrontierPruning ?? null,
      electricalQualified: q?.qualified === true,
      strictDrcErrors: q?.strictDrcErrorCount ?? null,
      relaxedDrcErrors: q?.drcErrorCount ?? null,
      disconnectedPorts: q?.disconnectedPcbPortCount ?? null,
      outputSha: q?.outputSha256 ?? null,
      elapsedSeconds: end?.elapsedSeconds ?? null,
    }
  }
  const a = analyze(base),
    b = analyze(opt)
  const delta = (x: number | null, y: number | null) =>
    x === null || y === null ? null : y - x
  const comparable = a.complete && b.complete
  return {
    inputSha256: inputs[0].inputSha256,
    sourceConnections: inputs[0].connections,
    baseline: a,
    optimized: b,
    difference: {
      graphIterations: delta(a.graphIterations, b.graphIterations),
      activeGraphRoute: delta(a.activeGraphRoute, b.activeGraphRoute),
      remainingQueued: delta(a.remainingQueued, b.remainingQueued),
      queuePops: delta(a.queuePops, b.queuePops),
      neighborScans: delta(a.neighborScans, b.neighborScans),
      lowerBoundRejected: delta(a.lowerBoundRejected, b.lowerBoundRejected),
    },
    exactGraphProgressParity:
      comparable &&
      a.graphIterations === b.graphIterations &&
      a.activeGraphRoute === b.activeGraphRoute &&
      a.remainingQueued === b.remainingQueued &&
      a.queuePops === b.queuePops,
    exactQualifiedCopperParity:
      comparable &&
      a.electricalQualified &&
      b.electricalQualified &&
      !!a.outputSha &&
      a.outputSha === b.outputSha,
    originalBoardQualified:
      inputs[0].inputSha256 === originalSha && b.electricalQualified,
    note: "Branch-rejection counters are decisions, not electrically invalid copper. Graph successes are not original source-net connectivity; full DRC is required for qualification.",
  }
}
if (import.meta.main) {
  if (!process.argv[2] || !process.argv[3])
    throw Error("Need baseline.jsonl and optimized.jsonl")
  console.log(
    JSON.stringify(
      compareStaticFrontierRuns(
        readFileSync(process.argv[2], "utf8"),
        readFileSync(process.argv[3], "utf8"),
      ),
      null,
      2,
    ),
  )
}
