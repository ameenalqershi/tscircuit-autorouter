import { expect, test } from "bun:test"
import { compareStaticFrontierRuns } from "../../scripts/repros/issue2868-compare-static-frontier"
const sha = "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071"
const logs = (source: string, scans: number, qualified: boolean) =>
  [
    { tag: "input", inputSha256: source, connections: 1 },
    { tag: "end", failed: !qualified, elapsedSeconds: 23 },
    {
      tag: "corridor-final",
      iteration: 8000000,
      route: 1710,
      stats: { widened: 80, fullFallbacks: 38 },
      staticFrontierPruning: { portMask: 12 },
    },
    { tag: "adaptive-stats", remainingQueued: 893 },
    {
      tag: "route-search-diagnostics-final",
      completedRouteCount: 1710,
      totalByReason: { queuePop: 7982887, neighborScanned: scans },
    },
    {
      tag: "qualification",
      qualified,
      outputSha256: qualified ? "equal" : "",
      strictDrcErrorCount: qualified ? 0 : null,
    },
  ]
    .map((x) => JSON.stringify(x))
    .join("\n")
test("rejects mismatched source files and refuses to invent SHA", () => {
  expect(() =>
    compareStaticFrontierRuns(logs(sha, 100, true), logs("garbage", 20, true)),
  ).toThrow("Unknown or mismatched")
})
test("checks exact graph-work parity without declaring a failed original board connected", () => {
  const a = compareStaticFrontierRuns(
    logs(sha, 100, false),
    logs(sha, 75, false),
  )
  expect(a.exactGraphProgressParity).toBe(true)
  expect(a.difference.neighborScans).toBe(-25)
  expect(a.originalBoardQualified).toBe(false)
  expect(a.exactQualifiedCopperParity).toBe(false)
})
test("same validated reduced output qualifies only the reduced fixture", () => {
  const a = compareStaticFrontierRuns(logs(sha, 100, true), logs(sha, 75, true))
  expect(a.exactQualifiedCopperParity).toBe(true)
  expect(a.originalBoardQualified).toBe(false)
})
