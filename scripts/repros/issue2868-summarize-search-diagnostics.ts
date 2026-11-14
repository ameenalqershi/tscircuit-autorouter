/** Read-only, SHA-guarded route-search statistics summary. No PCB is qualified here. */
import { readFileSync } from "node:fs"
const hashes = new Set([
  "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca",
  "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071",
])
type Counts = Record<string, number>
type Window = {
  kind: "local" | "unrestricted"
  iterations: number
  counts: Counts
}
type Route = {
  routeId: number
  routeName: string | null
  iterations: number
  succeeded: boolean
  windows: Window[]
}
type Diagnostic = {
  totalByReason: Counts
  totalByWindowKind: { local: Counts; unrestricted: Counts }
  completedRouteCount: number
  topRoutes: Route[]
  active: Route | null
}
export const summarize = (data: string) => {
  const rows = data
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)]
      } catch {
        return []
      }
    })
  const input = rows.find((row) => row.tag === "input")
  if (!hashes.has(input?.inputSha256))
    throw new Error("Unknown input SHA, refusing diagnostics summary")
  const last = (tag: string) => rows.filter((row) => row.tag === tag).at(-1)
  const diag = last("route-search-diagnostics-final") as Diagnostic | undefined
  const end = last("end")
  const qual = last("qualification")
  if (!diag)
    return {
      inputSha256: input.inputSha256,
      status: "no-complete-diagnostics",
      qualified: false,
    }
  const reasons = Object.entries(diag.totalByReason)
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({ reason, count }))
  const summarizeRoute = (route: Route) => {
    const byKind = { local: 0, unrestricted: 0 }
    for (const w of route.windows) byKind[w.kind] += w.iterations
    return {
      routeId: route.routeId,
      name: route.routeName,
      graphIterations: route.iterations,
      succeeded: route.succeeded,
      localIterations: byKind.local,
      unrestrictedIterations: byKind.unrestricted,
      fallbackUsed: byKind.unrestricted > 0,
      accountingConsistent:
        byKind.local + byKind.unrestricted === route.iterations,
      windowReasons: route.windows.map((w) => ({
        kind: w.kind,
        iterations: w.iterations,
        mostFrequentReasons: Object.entries(w.counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5),
      })),
    }
  }
  const routes = [...(diag.topRoutes ?? [])].sort(
    (a, b) => b.iterations - a.iterations,
  )
  return {
    inputSha256: input.inputSha256,
    connections: input.connections,
    status:
      end?.solved === true && qual?.qualified === true
        ? "qualified"
        : end?.failed === true
          ? "failed"
          : "incomplete",
    qualified: qual?.qualified === true,
    graphIterations: last("corridor-final")?.iteration ?? null,
    completedRouteCount: diag.completedRouteCount,
    totalReasonCounts: diag.totalByReason,
    reasonsSorted: reasons,
    byWindowKind: diag.totalByWindowKind,
    mostExpensiveRoutes: routes.map(summarizeRoute),
    activeRoute: diag.active ? summarizeRoute(diag.active) : null,
    note: "Counters record decision branches, not mutually exclusive per-neighbor categories, and do not prove PCB connectivity/DRC. Top-route retention is bounded.",
  }
}
if (import.meta.main) {
  if (!process.argv[2]) throw Error("Specify full routing .jsonl run file")
  console.log(
    JSON.stringify(summarize(readFileSync(process.argv[2], "utf8")), null, 2),
  )
}
