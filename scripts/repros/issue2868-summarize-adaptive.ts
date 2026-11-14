/** Source-hash-guarded, read-only summary; no incomplete PCB is accepted. */
import { readFileSync } from "node:fs"
const path = process.argv[2]
if (!path) throw Error("Specify the full .jsonl run log")
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
const input = rows.find((e) => e.tag === "input")
const approved = new Set([
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca",
  "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071",
])
if (!approved.has(input?.inputSha256)) throw Error("Unknown input fixture SHA")
const last = (tag: string) => rows.filter((e) => e.tag === tag).at(-1)
const final = last("end")
const qualification = last("qualification")
const adaptive = last("corridor-final") ?? last("corridor-runtime")
const fail = last("prepared-route-debug")
const sampled = last("route-observation-summary")
const routeNameById = new Map<number, string>(
  rows
    .filter(
      (event) =>
        event.tag === "route-observation" && typeof event.routeId === "number",
    )
    .map((event) => [
      event.routeId as number,
      String(event.routeName ?? "unknown"),
    ]),
)
const done = Boolean(final && qualification)
const qualified =
  done &&
  qualification.qualified === true &&
  final.solved === true &&
  final.failed === false &&
  qualification.drcErrorCount === 0 &&
  qualification.strictDrcErrorCount === 0 &&
  qualification.disconnectedPcbPortCount === 0 &&
  qualification.missingSourceTraceCount === 0 &&
  qualification.unrepresentedConnectionNames?.length === 0
console.log(
  JSON.stringify(
    {
      inputSha256: input.inputSha256,
      inputConnections: input.connections,
      obstacles: input.obstacles,
      layers: input.layers,
      state: qualified
        ? "qualified"
        : done
          ? "not-qualified"
          : "in-progress-or-incomplete",
      end: final
        ? {
            elapsedSeconds: final.elapsedSeconds,
            steps: final.steps,
            solved: final.solved,
            failed: final.failed,
            error: final.error,
            peakRssMB: final.peakObservedRssMB,
          }
        : null,
      routing: adaptive
        ? {
            preparedSolver: adaptive.solver,
            graphIterations: adaptive.iteration,
            options: adaptive.options,
            stats: adaptive.stats,
          }
        : null,
      failure: fail
        ? {
            currentRoute: fail.currentConnectionName,
            remainingQueued: fail.remainingQueuedRoutes,
            graphIterationCap: fail.maxIterations,
          }
        : null,
      routeSampling: sampled
        ? {
            observationCount: sampled.observationCount,
            sampledRouteCount: sampled.sampledRouteCount,
            // These are lower bounds from a 512-Pipeline-step sampler, NOT exact route costs.
            topObservedLowerBounds: sampled.topObservedSpans
              ?.slice(0, 20)
              .map(
                (span: {
                  routeId: number
                  observedSpanLowerBound: number
                }) => ({
                  ...span,
                  routeName: routeNameById.get(span.routeId) ?? null,
                }),
              ),
          }
        : null,
      drc:
        qualification && qualification.qualified !== undefined
          ? {
              qualified: qualification.qualified,
              strict: qualification.strictDrcErrorCount,
              relaxed: qualification.drcErrorCount,
              disconnected: qualification.disconnectedPcbPortCount,
              missingSource: qualification.missingSourceTraceCount,
              unrepresentedInput:
                qualification.unrepresentedConnectionNames?.length,
              outputSha256: qualification.outputSha256,
            }
          : null,
    },
    null,
    2,
  ),
)
