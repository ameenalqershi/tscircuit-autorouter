import { expect, test } from "bun:test"
import { comparePreflightRuns } from "../../scripts/repros/issue2868-compare-preflight-runs"
const sha = "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071"
const run = (sha: string, iters: number, qualified: boolean) =>
  [
    { tag: "input", inputSha256: sha, connections: 1 },
    { tag: "end", steps: 500, solved: qualified, failed: !qualified },
    {
      tag: "corridor-final",
      iteration: iters,
      route: qualified ? null : 3,
      stats: { fullFallbacks: 2, widened: 3 },
      preflight: { checks: 10, unreachableWindowsSkipped: 2 },
    },
    {
      tag: "qualification",
      qualified,
      outputSha256: qualified ? "fixed-sha" : null,
      drcErrorCount: qualified ? 0 : null,
    },
    {
      tag: "route-search-diagnostics-final",
      totalByReason: { queuePop: iters, neighborScanned: iters * 4 },
    },
  ]
    .map((x) => JSON.stringify(x))
    .join("\n")
test("rejects incomparable or unknown SRJ inputs", () => {
  expect(() =>
    comparePreflightRuns(run(sha, 100, true), run("bad", 20, true)),
  ).toThrow("Different or unrecognized")
})
test("reports identical qualifying reduced output without inferring full-board success", () => {
  const d = comparePreflightRuns(run(sha, 200, true), run(sha, 150, true))
  expect(d.identicalQualifiedOutput).toBe(true)
  expect(d.fullBoardQualified).toBe(false)
  expect(d.difference.candidatePops).toBe(-50)
  expect(d.experiment.preflight?.unreachableWindowsSkipped).toBe(2)
})
test("never marks failed experiment fully qualified even with progress improvement", () => {
  const d = comparePreflightRuns(run(sha, 200, false), run(sha, 160, false))
  expect(d.fullBoardQualified).toBe(false)
  expect(d.identicalQualifiedOutput).toBe(false)
  expect(d.experiment.failed).toBe(true)
})
