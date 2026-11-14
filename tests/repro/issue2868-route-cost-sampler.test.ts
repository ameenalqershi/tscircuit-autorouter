import { expect, test } from "bun:test"
import { RouteCostSampler } from "../../scripts/repros/issue2868-route-cost-sampler"
const makeGraph = (routeId: number, iterations: number) => ({
  iterations,
  state: {
    currentRouteId: routeId,
    unroutedRoutes: [2, 3],
    candidateQueue: { length: 8 },
  },
  problem: {
    routeCount: 4,
    routeMetadata: [
      { connectionId: "a" },
      { connectionId: "b" },
      { connectionId: "c" },
      { connectionId: "d" },
    ],
  },
})
test("observe transition without mutating the input graph or claiming exact per-route counts", () => {
  const p = new RouteCostSampler()
  const g = makeGraph(0, 100)
  const before = JSON.stringify(g)
  const first = p.observe(g)
  expect(first).toMatchObject({
    tag: "route-observation",
    routeId: 0,
    graphIterations: 100,
    observedTransitionsOnly: true,
  })
  expect(JSON.stringify(g)).toBe(before)
  expect(p.observe(makeGraph(0, 140))).toBeNull()
  expect(p.observe(makeGraph(1, 180))).toMatchObject({
    routeId: 1,
    graphIterations: 180,
  })
  expect(p.observe(makeGraph(1, 250))).toBeNull()
  const summary = p.summarize() as {
    topObservedSpans: Array<{ routeId: number; observedSpanLowerBound: number }>
    sampledRouteCount: number
  }
  expect(summary.sampledRouteCount).toBe(2)
  expect(summary.topObservedSpans).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ routeId: 0, observedSpanLowerBound: 40 }),
      expect.objectContaining({ routeId: 1, observedSpanLowerBound: 70 }),
    ]),
  )
})
test("reject declining graph iteration count to avoid false estimates", () => {
  const p = new RouteCostSampler()
  p.observe(makeGraph(0, 200))
  expect(() => p.observe(makeGraph(1, 180))).toThrow("monotonic")
})
