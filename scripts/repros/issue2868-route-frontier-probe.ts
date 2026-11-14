/** Read-only inspector for a live tiny-hypergraph routing solver. Never mutates topology/state. */
type Solver = any
const isAllow = (value: number | undefined, net: number) =>
  value === -1 || value === net || value === undefined

export function analyzeReachability(
  s: Solver,
  ignoreAssignments: boolean,
  ignoreNetRestrictions: boolean,
) {
  const { topology: t, problem: p, state: st } = s
  const rid = st.currentRouteId
  const net = st.currentRouteNetId ?? p.routeNet[rid]
  const start = p.routeStartPort[rid],
    goal = p.routeEndPort[rid]
  const reserved = s.problemSetup?.portEndpointReservationNetId as
    | Int32Array
    | undefined
  const visited = new Uint8Array(t.regionCount)
  const queue = new Int32Array(t.regionCount)
  let head = 0,
    tail = 0,
    blockedAssigned = 0,
    blockedEndpoint = 0,
    blockedStaticRegion = 0,
    blockedSections = 0,
    visitedPorts = 0
  const boundaryByNet = new Map<number, number>()
  const canRegion = (r: number) =>
    ignoreNetRestrictions || isAllow(p.regionNetId[r], net)
  const nativeFirstRegion = s.getStartingNextRegionId?.(rid, start)
  const initialRegions =
    nativeFirstRegion === undefined
      ? (t.incidentPortRegion[start] ?? [])
      : [nativeFirstRegion]
  for (const r of initialRegions) {
    if (!canRegion(r)) continue
    if (!visited[r]) {
      visited[r] = 1
      queue[tail++] = r
    }
  }
  let found = false
  const stopAfter = 1500000
  while (head < tail && visitedPorts < stopAfter) {
    const region = queue[head++]!
    for (const port of t.regionIncidentPorts[region] ?? []) {
      if (++visitedPorts > stopAfter) break
      // The native router cannot exit a region by returning through the same start endpoint.
      if (port === start && port !== goal) continue
      if (port === goal) {
        const goalReservation = reserved?.[port]
        const goalAssignment = st.portAssignment[port]
        if (
          (ignoreNetRestrictions ||
            goalReservation === undefined ||
            isAllow(goalReservation, net)) &&
          (ignoreAssignments || isAllow(goalAssignment, net))
        ) {
          found = true
          break
        }
      }
      if (!p.portSectionMask[port]) {
        blockedSections++
        continue
      }
      const staticReservation = reserved?.[port]
      if (
        !ignoreNetRestrictions &&
        staticReservation !== undefined &&
        !isAllow(staticReservation, net)
      ) {
        blockedEndpoint++
        boundaryByNet.set(
          staticReservation,
          (boundaryByNet.get(staticReservation) ?? 0) + 1,
        )
        continue
      }
      const dynamic = st.portAssignment[port]
      if (!ignoreAssignments && !isAllow(dynamic, net)) {
        blockedAssigned++
        boundaryByNet.set(dynamic, (boundaryByNet.get(dynamic) ?? 0) + 1)
        continue
      }
      const adjacent = t.incidentPortRegion[port] ?? []
      for (const next of adjacent) {
        if (next === region || visited[next]) continue
        if (!canRegion(next)) {
          blockedStaticRegion++
          boundaryByNet.set(
            p.regionNetId[next],
            (boundaryByNet.get(p.regionNetId[next]) ?? 0) + 1,
          )
          continue
        }
        visited[next] = 1
        queue[tail++] = next
      }
    }
    if (found) break
  }
  return {
    found,
    limited: visitedPorts >= stopAfter,
    visitedRegions: head,
    enqueuedRegions: tail,
    visitedPorts,
    blockedAssigned,
    blockedEndpoint,
    blockedStaticRegion,
    blockedSections,
    boundaryNets: [...boundaryByNet].sort((a, b) => b[1] - a[1]).slice(0, 12),
  }
}

export function probeRoute(s: Solver, label: string) {
  const { topology: t, problem: p, state: st } = s
  if (st.currentRouteId === undefined) return null
  const rid = st.currentRouteId
  const net = st.currentRouteNetId ?? p.routeNet[rid]
  const start = p.routeStartPort[rid]
  const goal = p.routeEndPort[rid]
  const incident = (port: number) =>
    (t.incidentPortRegion[port] ?? []).map((r: number) => ({
      region: r,
      net: p.regionNetId[r],
      zMask: t.regionAvailableZMask?.[r],
      center: [t.regionCenterX[r], t.regionCenterY[r]],
      width: t.regionWidth[r],
      height: t.regionHeight[r],
      routeCount: st.regionSegments[r]?.length,
      owners: (st.regionSegments[r] ?? [])
        .slice(0, 5)
        .map((entry: any) => entry[0]),
    }))
  const topOwnerRoutes = new Map<number, number>()
  // Search only nearest regions around both terminals; do not traverse the full graph for attribution.
  const neighbors = new Set<number>([
    ...(t.incidentPortRegion[start] ?? []),
    ...(t.incidentPortRegion[goal] ?? []),
  ])
  for (const region of [...neighbors])
    for (const port of t.regionIncidentPorts[region] ?? []) {
      for (const next of t.incidentPortRegion[port] ?? []) neighbors.add(next)
      if (neighbors.size > 250) break
    }
  for (const region of neighbors)
    for (const entry of st.regionSegments[region] ?? []) {
      topOwnerRoutes.set(entry[0], (topOwnerRoutes.get(entry[0]) ?? 0) + 1)
    }
  const meta = p.routeMetadata?.[rid]
  return {
    tag: "frontier-probe",
    label,
    routeId: rid,
    routeName: meta?.connectionId ?? null,
    routeNet: net,
    graphIterations: s.iterations,
    goalPortId: goal,
    startPortId: start,
    queueLength: st.candidateQueue?.length,
    nativeStartRegionId: s.getStartingNextRegionId?.(rid, start) ?? null,
    startIncident: incident(start),
    goalIncident: incident(goal),
    nearbyOwners: [...topOwnerRoutes]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18)
      .map(([routeId, count]) => ({
        routeId,
        count,
        name: p.routeMetadata?.[routeId]?.connectionId,
      })),
    reachability: {
      geometry: analyzeReachability(s, true, true),
      fixedNet: analyzeReachability(s, true, false),
      occupied: analyzeReachability(s, false, false),
    },
  }
}
