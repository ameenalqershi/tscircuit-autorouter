/** Bounded and read-only graph-route sampler: reports observations, NOT exact per-route totals. */
type RouteGraph = {
  iterations: number
  state: {
    currentRouteId?: number
    unroutedRoutes: number[]
    candidateQueue: { length: number }
  }
  problem: {
    routeCount: number
    routeMetadata?: Array<{ connectionId?: string }>
  }
}
export class RouteCostSampler {
  private previousRouteId: number | null = null
  private previousIteration = -1
  private readonly firstSeenIteration = new Map<number, number>()
  private readonly lastSeenIteration = new Map<number, number>()
  private observations = 0
  observe(graph: RouteGraph | undefined): Record<string, unknown> | null {
    if (
      !graph ||
      graph.state.currentRouteId === undefined ||
      !Number.isFinite(graph.iterations)
    )
      return null
    const routeId = graph.state.currentRouteId
    const iteration = graph.iterations
    if (iteration < this.previousIteration)
      throw new Error(
        "Graph iteration counter must be monotonic during profiling",
      )
    this.observations++
    if (!this.firstSeenIteration.has(routeId))
      this.firstSeenIteration.set(routeId, iteration)
    this.lastSeenIteration.set(routeId, iteration)
    const transition = routeId !== this.previousRouteId
    this.previousRouteId = routeId
    this.previousIteration = iteration
    if (!transition) return null
    return {
      tag: "route-observation",
      routeId,
      routeName: graph.problem.routeMetadata?.[routeId]?.connectionId ?? null,
      graphIterations: iteration,
      remainingRoutes: graph.state.unroutedRoutes.length,
      candidateQueueLength: graph.state.candidateQueue.length,
      observedTransitionsOnly: true,
    }
  }
  summarize(): Record<string, unknown> {
    const rows = [...this.firstSeenIteration]
      .map(([routeId, firstObservedIteration]) => {
        const lastObservedIteration = this.lastSeenIteration.get(routeId)!
        return {
          routeId,
          firstObservedIteration,
          lastObservedIteration,
          observedSpanLowerBound:
            lastObservedIteration - firstObservedIteration,
        }
      })
      .sort((a, b) => b.observedSpanLowerBound - a.observedSpanLowerBound)
    return {
      tag: "route-observation-summary",
      observationCount: this.observations,
      sampledRouteCount: rows.length,
      topObservedSpans: rows.slice(0, 30),
      note: "Sampled route IDs and spans are lower bounds, not exact costs; routes shorter than sampling interval can be skipped entirely",
    }
  }
}
