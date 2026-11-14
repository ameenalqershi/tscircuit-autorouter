/** Summarize saved read-only graph probes; does not assert geometric copper connectivity. */
import { readFileSync } from "node:fs"
const source = process.argv[2]
if (!source) throw new Error("Supply the qualification .jsonl file")
const events = readFileSync(source, "utf8")
  .split("\n")
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [JSON.parse(line)]
    } catch {
      return []
    }
  })
const input = events.find((x) => x.tag === "input")
if (
  input?.inputSha256 !==
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
)
  throw new Error("This report is not the exact original #2868 board input")
const records = events.filter((x) => x.tag === "frontier-probe")
const last = events
  .filter(
    (x) =>
      x.tag === "end" ||
      x.tag === "qualification" ||
      x.tag === "prepared-route-debug",
  )
  .map((x) => ({
    tag: x.tag,
    solved: x.solved,
    failed: x.failed,
    error: x.error,
    reason: x.reason,
    steps: x.steps,
    routeId: x.currentRouteId,
    routeName: x.currentConnectionName,
  }))
const details = records.map((x) => ({
  label: x.label,
  route: x.routeName,
  routeId: x.routeId,
  graphIterations: x.graphIterations,
  queueLength: x.queueLength,
  startRegion: x.nativeStartRegionId,
  source: x.startIncident,
  goal: x.goalIncident,
  topNearbyOwners: x.nearbyOwners,
  geometry: x.reachability.geometry,
  fixedNet: x.reachability.fixedNet,
  occupied: x.reachability.occupied,
}))
function classify(record: any) {
  if (!record) return "no-route-probe-recorded"
  const { geometry: g, fixedNet: f, occupied: o } = record.reachability
  if ([g, f, o].some((x) => x?.limited))
    return "bounded-reachability-inconclusive"
  if (!g?.found) return "no-coarse-topological-path-in-probed-section"
  if (!f?.found) return "fixed-net-or-endpoint-reservation-is-a-coarse-cut"
  if (!o?.found) return "dynamic-port-assignments-form-a-coarse-cut"
  return "coarse-graph-reachable; intra-region-crossings-or-cost-search-may-still-block"
}
console.log(
  JSON.stringify(
    {
      sourceSha256: input.inputSha256,
      probes: records.length,
      conclusion: classify(records.at(-1)),
      details,
      termination: last,
    },
    null,
    2,
  ),
)
