/** Local qualification harness for #2868; deliberately not committed to PRs. */
import { createHash } from "node:crypto"
import { readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import { evaluateRelaxedDrc } from "lib/testing/evaluate-relaxed-drc"
import { getDrcErrors } from "lib/testing/getDrcErrors"
import {
  checkEachPcbPortConnectedToPcbTraces,
  checkSourceTracesHavePcbTraces,
} from "@tscircuit/checks"
import type { SimpleRouteJson } from "lib/types"

const file = process.env.SRJ_FILE || "scanner-full-board.simple-route.json"
const budgetSeconds = Number(process.env.WALL_BUDGET_SECONDS || 1800)
const stepBudget = Number(process.env.MAX_STEPS || 10000000)
const inputText = readFileSync(file, "utf8")
const input = JSON.parse(inputText) as SimpleRouteJson
const inputSha256 = createHash("sha256").update(inputText).digest("hex")
const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(input, {
  cacheProvider: null,
  effort: Number(process.env.EFFORT || 1),
})
const start = performance.now()
let steps = 0
let nextReportAt = start
let peakRssMB = 0
let lastStage = "not-started"
function status(tag: string) {
  const currentStage =
    solver.pipelineDef[solver.currentPipelineStepIndex]?.solverName ||
    "completed"
  lastStage = currentStage
  const rssMB = Math.round(process.memoryUsage().rss / 1e6)
  peakRssMB = Math.max(peakRssMB, rssMB)
  const result = {
    tag,
    elapsedSeconds: +((performance.now() - start) / 1000).toFixed(1),
    stage: currentStage,
    progress: solver.progress,
    steps,
    stageIterations: solver.activeSubSolver?.iterations ?? null,
    solved: solver.solved,
    failed: solver.failed,
    error: solver.error || null,
    rssMB,
    peakObservedRssMB: peakRssMB,
    heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1e6),
  }
  console.log(JSON.stringify(result))
  return result
}
console.log(
  JSON.stringify({
    tag: "input",
    file,
    inputSha256,
    connections: input.connections.length,
    obstacles: input.obstacles.length,
    layers: input.layerCount,
    budgetSeconds,
    stepBudget,
  }),
)
status("start")
while (
  !solver.solved &&
  !solver.failed &&
  steps < stepBudget &&
  (performance.now() - start) / 1000 < budgetSeconds
) {
  solver.step()
  steps++
  if (performance.now() > nextReportAt + 5000) {
    status("progress")
    nextReportAt = performance.now()
  }
}
const final = status("end")
if (solver.failed) {
  // Forensic-only failure receipt. Avoid materializing giant graph arrays.
  try {
    const outer = solver.portPointPathingSolver as any
    const tinyPipeline = outer?.tinyPipelineSolver
    const graphSolver = tinyPipeline?.getSolver?.("solveGraph")
    const currentRouteId = graphSolver?.state?.currentRouteId
    const metadata =
      typeof currentRouteId === "number"
        ? graphSolver?.problem?.routeMetadata?.[currentRouteId]
        : undefined
    const neverRouted = graphSolver?.getNeverSuccessfullyRoutedRoutes?.()
    console.log(
      JSON.stringify({
        tag: "prepared-route-debug",
        pipelineName: tinyPipeline?.getSolverName?.() ?? null,
        solveGraphName: graphSolver?.getSolverName?.() ?? null,
        solveGraphError: graphSolver?.error ?? null,
        currentRouteId: currentRouteId ?? null,
        currentConnectionName:
          metadata?.simpleRouteConnection?.name ??
          metadata?.connectionId ??
          null,
        currentRootConnectionNames:
          metadata?.simpleRouteConnection?.__rootConnectionNames?.slice(0, 4) ??
          null,
        startPoint:
          metadata?.simpleRouteConnection?.pointsToConnect?.[0] ?? null,
        endPoint: metadata?.simpleRouteConnection?.pointsToConnect?.[1] ?? null,
        neverRoutedCount: Array.isArray(neverRouted)
          ? neverRouted.length
          : null,
        neverRoutedSample: Array.isArray(neverRouted)
          ? neverRouted.slice(0, 12)
          : null,
        maxIterations: graphSolver?.MAX_ITERATIONS ?? null,
        executedIterations: graphSolver?.iterations ?? null,
        lastStats: {
          ripCount: graphSolver?.stats?.ripCount ?? null,
          neverSuccessfullyRoutedRouteCount:
            graphSolver?.stats?.neverSuccessfullyRoutedRouteCount ?? null,
        },
      }),
    )
  } catch (error) {
    console.log(
      JSON.stringify({
        tag: "prepared-route-debug",
        diagnosticError: String(error),
      }),
    )
  }
}
if (!solver.solved || solver.failed) {
  console.log(
    JSON.stringify({
      tag: "qualification",
      qualified: false,
      reason: solver.failed ? "solver_failure" : "bounded_incomplete",
      lastStage,
      steps,
      peakObservedRssMB: peakRssMB,
    }),
  )
  process.exit(solver.failed ? 2 : 3)
}
try {
  const routes = solver.getOutputSimplifiedPcbTraces()
  const routeNames = new Set(routes.map((r) => r.connection_name))
  const missing = input.connections
    .filter((c) => !routeNames.has(c.name))
    .map((c) => c.name)
  const output = solver.getOutputSimpleRouteJson()
  const serialized = JSON.stringify(output)
  const outSha256 = createHash("sha256").update(serialized).digest("hex")
  const drc = evaluateRelaxedDrc({
    inputSrj: input,
    srjWithPointPairs: solver.srjWithPointPairs!,
    routedTraces: routes,
    includeBoardClearance: true,
  })
  const strictDrc = getDrcErrors(drc.circuitJson)
  const disconnectedPorts = checkEachPcbPortConnectedToPcbTraces(
    drc.circuitJson,
  )
  const missingSourceTraces = checkSourceTracesHavePcbTraces(drc.circuitJson)
  const result = {
    tag: "qualification",
    qualified:
      drc.errors.length === 0 &&
      strictDrc.errors.length === 0 &&
      missing.length === 0 &&
      disconnectedPorts.length === 0 &&
      missingSourceTraces.length === 0,
    drcMode: "relaxed_and_default_options",
    drcErrorCount: drc.errors.length,
    drcErrors: drc.errors.slice(0, 20),
    strictDrcErrorCount: strictDrc.errors.length,
    strictDrcErrors: strictDrc.errors.slice(0, 20),
    disconnectedPcbPortCount: disconnectedPorts.length,
    disconnectedPcbPortErrors: disconnectedPorts.slice(0, 10),
    missingSourceTraceCount: missingSourceTraces.length,
    missingSourceTraceErrors: missingSourceTraces.slice(0, 10),
    inputConnections: input.connections.length,
    routeCount: routes.length,
    routedConnectionNames: routeNames.size,
    unrepresentedConnectionNames: missing,
    outputTraceCount: output.traces?.length ?? 0,
    outputSha256: outSha256,
    steps,
    elapsedSeconds: final.elapsedSeconds,
    peakObservedRssMB: peakRssMB,
  }
  console.log(JSON.stringify(result))
  if (process.env.SAVE_ROUTED_JSON === "1")
    writeFileSync(process.env.OUTPUT_FILE || "routed-output.json", serialized)
  if (!result.qualified) process.exit(4)
} catch (error) {
  console.log(
    JSON.stringify({
      tag: "qualification",
      qualified: false,
      reason: "output_or_drc_validation_error",
      message: String(error),
    }),
  )
  process.exit(5)
}
