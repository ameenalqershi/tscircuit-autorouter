import { expect, test } from "bun:test"
import fixture from "../../fixtures/features/pour-via-escape/pour-via-escape01.json" with {
  type: "json",
}
import { EscapeViaLocationSolver } from "lib/solvers/EscapeViaLocationSolver/EscapeViaLocationSolver"
import { NetToPointPairsSolver } from "lib/solvers/NetToPointPairsSolver/NetToPointPairsSolver"
import { isSingleLayerConnectionPoint, type SimpleRouteJson } from "lib/types"
import { getInitiallyConnectedMapFromSimpleRouteJson } from "lib/utils/get-initially-connected-map-from-simple-route-json"

const original = fixture.simple_route_json as SimpleRouteJson

test("plane escape MST explicitly considers the validated local pad-to-via edge without falsely marking pads connected", () => {
  const escapes = new EscapeViaLocationSolver(original)
  escapes.solve()
  const srj = escapes.getOutputSimpleRouteJson()
  const solver = new NetToPointPairsSolver(
    srj,
    {},
    getInitiallyConnectedMapFromSimpleRouteJson(srj),
  )
  const copperVcc = srj.connections.find((c) => c.name === "source_net_0")!
  const anchorEdges = solver.getEscapeViaAnchorEdges(copperVcc)
  expect(anchorEdges.length).toBe(4)
  for (const edge of anchorEdges) {
    const via = edge.to
    expect(
      isSingleLayerConnectionPoint(via) ? via.terminalVia?.toLayer : null,
    ).toBeDefined()
    expect(
      isSingleLayerConnectionPoint(via) ? via.__planeEscapeSourcePointId : null,
    ).toBe(edge.from.pointId)
    expect(edge.weight).toBeGreaterThan(0)
    expect(edge.weight).toBeCloseTo(
      Math.hypot(edge.from.x - via.x, edge.from.y - via.y),
      8,
    )
    const connectedMap = getInitiallyConnectedMapFromSimpleRouteJson(srj)
    expect(connectedMap.getNetConnectedToId(edge.from.pointId!)).not.toBe(
      connectedMap.getNetConnectedToId(via.pointId!),
    )
  }
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  for (const originalPort of original.connections.find(
    (c) => c.name === "source_net_0",
  )!.pointsToConnect) {
    expect(
      solver.newConnections.some((c) =>
        c.pointsToConnect.some((p) => p.pointId === originalPort.pointId),
      ),
    ).toBe(true)
  }
})

test("an invalid unmarked or different-layer candidate is never introduced as a routing edge", () => {
  const solver = new NetToPointPairsSolver(
    { ...original, connections: [] },
    {},
    getInitiallyConnectedMapFromSimpleRouteJson(original),
  )
  const source = { x: 0, y: 0, layer: "top", pointId: "pad" }
  const allowed = {
    x: 1,
    y: 0,
    layer: "top",
    pointId: "via-ok",
    terminalVia: { toLayer: "inner1" },
    __planeEscapeSourcePointId: "pad",
  }
  const wrongLayer = {
    x: 1,
    y: 1,
    layer: "bottom",
    pointId: "via-wrong",
    terminalVia: { toLayer: "inner1" },
    __planeEscapeSourcePointId: "pad",
  }
  const ignored = {
    x: 1,
    y: 2,
    layer: "top",
    pointId: "via-ignored",
    terminalVia: { toLayer: "inner1" },
  }
  const edges = solver.getEscapeViaAnchorEdges({
    name: "net",
    pointsToConnect: [source, allowed, wrongLayer, ignored],
  })
  expect(edges).toHaveLength(1)
  expect(edges[0]!.from).toBe(source)
  expect(edges[0]!.to).toBe(allowed)
  expect(edges[0]!.weight).toBe(1)
})

test("invalid zero-length and same-layer terminal-via hints do not fabricate MST connectivity", () => {
  const srj: SimpleRouteJson = {
    ...original,
    connections: [],
  }
  const solver = new NetToPointPairsSolver(
    srj,
    {},
    getInitiallyConnectedMapFromSimpleRouteJson(srj),
  )
  const pad = { x: 0, y: 0, layer: "top", pointId: "pad" }
  const coincidentVia = {
    x: 0,
    y: 0,
    layer: "top",
    pointId: "coincident",
    terminalVia: { toLayer: "inner1" },
    __planeEscapeSourcePointId: "pad",
  }
  const ineffectiveVia = {
    x: 1,
    y: 0,
    layer: "top",
    pointId: "same-layer",
    terminalVia: { toLayer: "top" },
    __planeEscapeSourcePointId: "pad",
  }
  const validVia = {
    x: 1,
    y: 1,
    layer: "top",
    pointId: "valid",
    terminalVia: { toLayer: "inner1" },
    __planeEscapeSourcePointId: "pad",
  }
  const edges = solver.getEscapeViaAnchorEdges({
    name: "net",
    pointsToConnect: [pad, coincidentVia, ineffectiveVia, validVia],
  })
  expect(edges).toHaveLength(1)
  expect(edges[0]!.from).toBe(pad)
  expect(edges[0]!.to).toBe(validVia)
  expect(edges[0]!.weight).toBeGreaterThan(0)
  const connected = getInitiallyConnectedMapFromSimpleRouteJson(srj)
  expect(connected.getNetConnectedToId(pad.pointId)).toBeUndefined()
})
