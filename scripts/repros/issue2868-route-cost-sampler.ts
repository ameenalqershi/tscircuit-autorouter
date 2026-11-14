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
  private readonly completedEpisodeSpanByRouteId = new Map<number, number>()
  private currentEpisodeStartIteration = -1
  private observations = 0
  observe(graph: RouteGraph | undefined): Record<string, unknown> | null {
    if (!graph || !Number.isFinite(graph.iterations)) return null
    if (graph.iterations < this.previousIteration)
      throw new Error(
        "Graph iteration counter must be monotonic during profiling",
      )
    if (graph.state.currentRouteId === undefined) {
      // An empty route stage ends the sampled episode. Do not count the idle
      // time if this same route ID later reappears after a rerip.
      if (
        this.previousRouteId !== null &&
        this.currentEpisodeStartIteration >= 0
      ) {
        const span = this.previousIteration - this.currentEpisodeStartIteration
        this.completedEpisodeSpanByRouteId.set(
          this.previousRouteId,
          (this.completedEpisodeSpanByRouteId.get(this.previousRouteId) ?? 0) +
            span,
        )
      }
      this.previousRouteId = null
      this.currentEpisodeStartIteration = -1
      this.previousIteration = graph.iterations
      return null
    }
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
    if (transition) {
      if (
        this.previousRouteId !== null &&
        this.currentEpisodeStartIteration >= 0
      ) {
        const span = this.previousIteration - this.currentEpisodeStartIteration
        this.completedEpisodeSpanByRouteId.set(
          this.previousRouteId,
          (this.completedEpisodeSpanByRouteId.get(this.previousRouteId) ?? 0) +
            span,
        )
      }
      this.currentEpisodeStartIteration = iteration
    }
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
        const completed = this.completedEpisodeSpanByRouteId.get(routeId) ?? 0
        const activeEpisodeSpan =
          this.previousRouteId === routeId &&
          this.currentEpisodeStartIteration >= 0
            ? Math.max(
                0,
                this.previousIteration - this.currentEpisodeStartIteration,
              )
            : 0
        return {
          routeId,
          firstObservedIteration,
          lastObservedIteration,
          observedSpanLowerBound: completed + activeEpisodeSpan,
        }
      })
      .sort((a, b) => b.observedSpanLowerBound - a.observedSpanLowerBound)
    return {
      tag: "route-observation-summary",
      observationCount: this.observations,
      sampledRouteCount: rows.length,
      topObservedSpans: rows.slice(0, 30),
      note: "Summed observed spans from contiguous route episodes are lower bounds, not exact costs; route requeues and sub-sample routes are not over-counted",
    }
  }
}
