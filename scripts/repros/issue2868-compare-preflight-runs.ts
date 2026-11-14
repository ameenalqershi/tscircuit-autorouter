/** Exact-source benchmark comparator; never interprets graph progress as PCB DRC. */
import { readFileSync } from "node:fs"
const original =
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
const onePair =
  "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071"
export function comparePreflightRuns(
  baselineRaw: string,
  experimentRaw: string,
) {
  const records = (data: string) =>
    data
      .split("\n")
      .filter(Boolean)
      .flatMap((s) => {
        try {
          return [JSON.parse(s)]
        } catch {
          return []
        }
      })
  const a = records(baselineRaw),
    b = records(experimentRaw)
  const last = (arr: any[], tag: string) =>
    arr.filter((x) => x.tag === tag).at(-1)
  const inputA = last(a, "input"),
    inputB = last(b, "input")
  if (
    !inputA ||
    !inputB ||
    inputA.inputSha256 !== inputB.inputSha256 ||
    ![original, onePair].includes(inputA.inputSha256)
  )
    throw new Error("Different or unrecognized SRJ SHA-256; refuse comparison")
  const collect = (arr: any[]) => {
    const corridor = last(arr, "corridor-final"),
      end = last(arr, "end"),
      qual = last(arr, "qualification"),
      forensic = last(arr, "prepared-route-debug"),
      diag = last(arr, "route-search-diagnostics-final")
    return {
      completed: !!end,
      graphIterations: corridor?.iteration ?? null,
      activeRouteId: corridor?.route ?? null,
      remainingQueued:
        forensic?.remainingQueuedRoutes ?? (end?.solved === true ? 0 : null),
      pipelineSteps: end?.steps ?? null,
      peakObservedRssMB: end?.peakObservedRssMB ?? null,
      elapsedSeconds: end?.elapsedSeconds ?? null,
      widened: corridor?.stats?.widened ?? null,
      fallbacks: corridor?.stats?.fullFallbacks ?? null,
      preflight: corridor?.preflight ?? null,
      queuedCandidates: diag?.totalByReason?.candidateQueued ?? null,
      candidatePops: diag?.totalByReason?.queuePop ?? null,
      neighborScans: diag?.totalByReason?.neighborScanned ?? null,
      failed: end?.failed ?? null,
      qualified: qual?.qualified === true,
      strictDrcErrors: qual?.strictDrcErrorCount ?? null,
      relaxedDrcErrors: qual?.drcErrorCount ?? null,
      disconnectedPorts: qual?.disconnectedPcbPortCount ?? null,
      outputSha256: qual?.outputSha256 ?? null,
    }
  }
  const base = collect(a),
    experiment = collect(b)
  const delta = (x: number | null, y: number | null) =>
    x === null || y === null ? null : y - x
  return {
    inputSha256: inputA.inputSha256,
    sourceConnections: inputA.connections,
    baseline: base,
    experiment,
    difference: {
      graphIterations: delta(base.graphIterations, experiment.graphIterations),
      pipelineSteps: delta(base.pipelineSteps, experiment.pipelineSteps),
      activeRouteId: delta(base.activeRouteId, experiment.activeRouteId),
      remainingQueued: delta(base.remainingQueued, experiment.remainingQueued),
      unrestrictedFallbacks: delta(base.fallbacks, experiment.fallbacks),
      candidatePops: delta(base.candidatePops, experiment.candidatePops),
      neighborScans: delta(base.neighborScans, experiment.neighborScans),
    },
    identicalQualifiedOutput:
      base.qualified &&
      experiment.qualified &&
      base.outputSha256 !== null &&
      base.outputSha256 === experiment.outputSha256,
    fullBoardQualified: inputA.inputSha256 === original && experiment.qualified,
    note: "Unfinished graph routes and graph candidate counts are NOT physical connections. No full-board electrical success unless full-board-qualified=true; wall time and RSS can vary with concurrent server load.",
  }
}
if (import.meta.main) {
  if (!process.argv[2] || !process.argv[3])
    throw Error("Need baseline.jsonl and experiment.jsonl")
  console.log(
    JSON.stringify(
      comparePreflightRuns(
        readFileSync(process.argv[2], "utf8"),
        readFileSync(process.argv[3], "utf8"),
      ),
      null,
      2,
    ),
  )
}
