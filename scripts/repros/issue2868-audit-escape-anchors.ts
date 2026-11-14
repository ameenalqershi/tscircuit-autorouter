/** Exact-board, SHA-verified MST-only audit; does NOT qualify routed copper or DRC. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { EscapeViaLocationSolver } from "lib/solvers/EscapeViaLocationSolver/EscapeViaLocationSolver"
import { NetToPointPairsSolver } from "lib/solvers/NetToPointPairsSolver/NetToPointPairsSolver"
import type { SimpleRouteJson } from "lib/types"
import { getInitiallyConnectedMapFromSimpleRouteJson } from "lib/utils/get-initially-connected-map-from-simple-route-json"

const file = process.env.SRJ_FILE
if (!file) throw new Error("Set SRJ_FILE to the original #2868 attachment JSON")
const raw = readFileSync(file, "utf8")
const sha256 = createHash("sha256").update(raw).digest("hex")
if (
  sha256 !== "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
) {
  throw new Error(`Input SHA mismatch: ${sha256}`)
}
const input = JSON.parse(raw) as SimpleRouteJson
const source = input.connections.find((c) => c.name === "source_net_144")
if (
  !source ||
  input.connections.length !== 684 ||
  input.obstacles.length !== 3809 ||
  input.layerCount !== 6
) {
  throw new Error("Original 684-connection, 6-layer issue attachment expected")
}
const escape = new EscapeViaLocationSolver(input)
escape.solve()
if (escape.failed) throw new Error(`Escape placement failed: ${escape.error}`)
const escaped = escape.getOutputSimpleRouteJson()
const solver = new NetToPointPairsSolver(
  escaped,
  {},
  getInitiallyConnectedMapFromSimpleRouteJson(escaped),
)
solver.solve()
if (solver.failed || !solver.solved)
  throw new Error(`MST failed: ${solver.error}`)
const gnd = escaped.connections.find((c) => c.name === "source_net_144")
if (!gnd) throw new Error("GND missing after escape planning")
const vias = gnd.pointsToConnect.filter((p) =>
  p.pointId?.startsWith("escape-via:"),
)
const metadata = escape.getEscapeViaMetadataByPointId()
const edges = solver.newConnections.filter((c) =>
  c.__rootConnectionNames?.includes("source_net_144"),
)
const selected = new Set(
  edges.map((c) =>
    c.pointsToConnect
      .map((p) => p.pointId)
      .sort()
      .join("|"),
  ),
)
const local = vias.filter((via) => {
  const sourceId = metadata.get(via.pointId!)?.sourcePointId
  return Boolean(
    sourceId && selected.has([via.pointId!, sourceId].sort().join("|")),
  )
})
const edgeLengths = edges.map((edge) =>
  Math.hypot(
    edge.pointsToConnect[0]!.x - edge.pointsToConnect[1]!.x,
    edge.pointsToConnect[0]!.y - edge.pointsToConnect[1]!.y,
  ),
)
const covered = new Set(
  edges.flatMap((edge) => edge.pointsToConnect.map((point) => point.pointId)),
)
const missingSourceIds = source.pointsToConnect
  .map((point) => point.pointId)
  .filter((pointId): pointId is string =>
    Boolean(pointId && !covered.has(pointId)),
  )
console.log(
  JSON.stringify({
    sha256,
    sourceConnections: input.connections.length,
    physicalObstacles: input.obstacles.length,
    layers: input.layerCount,
    gndSourceTerminals: source.pointsToConnect.length,
    gndEscapeVias: vias.length,
    gndExternallyConnectedGroups:
      gnd.externallyConnectedPointIds?.map((group) => group.length) ?? [],
    gndMstEdges: edges.length,
    localPadViaEdges: local.length,
    nonlocalViaEdges: vias.length - local.length,
    gndEdgesLongerThan4mm: edgeLengths.filter((length) => length > 4).length,
    longestGndMstEdgeMm: Math.max(...edgeLengths),
    missingSourceIds,
  }),
)
if (missingSourceIds.length) process.exitCode = 2
