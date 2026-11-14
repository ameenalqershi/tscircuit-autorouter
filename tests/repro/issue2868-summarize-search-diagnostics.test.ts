import { expect, test } from "bun:test"
import { summarize } from "../../scripts/repros/issue2868-summarize-search-diagnostics"
const sha = "ba7fde466d17743a711573f6d7bbd38f6861efc3672524f0373600452129e071"
const sample = (
  input: string,
  diag: object,
  end: object,
  qualification: object,
) =>
  [
    JSON.stringify({ tag: "input", inputSha256: input, connections: 1 }),
    JSON.stringify({ tag: "route-search-diagnostics-final", ...diag }),
    JSON.stringify({ tag: "corridor-final", iteration: 100 }),
    JSON.stringify({ tag: "end", ...end }),
    JSON.stringify({ tag: "qualification", ...qualification }),
  ].join("\n")
test("rejects unrecognized source board hashes", () => {
  expect(() => summarize(sample("wrong", {}, {}, {}))).toThrow(
    "Unknown input SHA",
  )
})
test("attributes expensive route's local vs unrestricted windows without inferring qualification", () => {
  const result = summarize(
    sample(
      sha,
      {
        totalByReason: { queuePop: 80, neighborScanned: 200 },
        totalByWindowKind: {
          local: { queuePop: 10 },
          unrestricted: { queuePop: 70 },
        },
        completedRouteCount: 1,
        topRoutes: [
          {
            routeId: 4,
            routeName: "net0_mst0",
            iterations: 100,
            succeeded: true,
            windows: [
              { kind: "local", iterations: 20, counts: { queuePop: 10 } },
              {
                kind: "unrestricted",
                iterations: 80,
                counts: { queuePop: 70, neighborScanned: 200 },
              },
            ],
          },
        ],
        active: null,
      },
      { solved: false, failed: true },
      { qualified: false },
    ),
  ) as any
  expect(result.qualified).toBe(false)
  expect(result.status).toBe("failed")
  expect(result.mostExpensiveRoutes[0]).toMatchObject({
    localIterations: 20,
    unrestrictedIterations: 80,
    fallbackUsed: true,
    accountingConsistent: true,
  })
  expect(result.byWindowKind.unrestricted.queuePop).toBe(70)
})
