import { expect, test } from "bun:test"
import { analyzeReachability } from "../../scripts/repros/issue2868-route-frontier-probe"

function miniGraph() {
  return {
    topology: {
      regionCount: 2,
      portCount: 3,
      incidentPortRegion: [[0], [0, 1], [1]],
      regionIncidentPorts: [
        [0, 1],
        [1, 2],
      ],
      regionCenterX: new Float64Array([0, 1]),
      regionCenterY: new Float64Array([0, 0]),
      regionWidth: new Float64Array([1, 1]),
      regionHeight: new Float64Array([1, 1]),
    },
    problem: {
      routeStartPort: new Int32Array([0]),
      routeEndPort: new Int32Array([2]),
      routeNet: new Int32Array([7]),
      regionNetId: new Int32Array([-1, -1]),
      portSectionMask: new Int8Array([1, 1, 1]),
    },
    problemSetup: {
      portEndpointReservationNetId: new Int32Array([-1, -1, -1]),
    },
    state: {
      currentRouteId: 0,
      currentRouteNetId: 7,
      portAssignment: new Int32Array([-1, -1, -1]),
    },
  }
}

test("unassigned geometric corridor is reachable", () => {
  const g = miniGraph()
  const r = analyzeReachability(g, false, false)
  expect(r.found).toBe(true)
  expect(r.blockedAssigned).toBe(0)
})

test("dynamic occupancy blocks the corridor without changing bare geometry", () => {
  const g = miniGraph()
  g.state.portAssignment[1] = 12
  const before = Array.from(g.state.portAssignment)
  expect(analyzeReachability(g, true, false).found).toBe(true)
  const blocked = analyzeReachability(g, false, false)
  expect(blocked.found).toBe(false)
  expect(blocked.blockedAssigned).toBeGreaterThan(0)
  expect(blocked.boundaryNets[0]![0]).toBe(12)
  expect(Array.from(g.state.portAssignment)).toEqual(before)
})

test("foreign static endpoint reservation blocks traversal even with assignments ignored", () => {
  const g = miniGraph()
  g.problemSetup.portEndpointReservationNetId[1] = 12
  expect(analyzeReachability(g, true, false).found).toBe(false)
  expect(analyzeReachability(g, true, true).found).toBe(true)
})

test("foreign fixed-region net blocks geometric corridor without dynamic occupancy", () => {
  const g = miniGraph()
  g.problem.regionNetId[1] = 12
  expect(analyzeReachability(g, true, false).found).toBe(false)
  expect(analyzeReachability(g, true, true).found).toBe(true)
})
