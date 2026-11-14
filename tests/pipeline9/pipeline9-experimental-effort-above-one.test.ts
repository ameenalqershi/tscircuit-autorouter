import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { AutoroutingPipelineSolver9_PreloadedTraceGraph } from "lib/autorouter-pipelines/AutoroutingPipeline9_PreloadedTraceGraph/AutoroutingPipelineSolver9_PreloadedTraceGraph"
import type { SimpleRouteJson } from "lib/types"
const fixture = JSON.parse(
  readFileSync("tests/repro/assets/pipeline9-bga36-phase2.json", "utf8"),
) as SimpleRouteJson

for (const effort of [0.5, 1, 2]) {
  test(`Pipeline 9 passes requested effort ${effort} to tiny-hypergraph solver`, () => {
    const solver = new AutoroutingPipelineSolver9_PreloadedTraceGraph(fixture, {
      cacheProvider: null,
      effort,
    })
    let steps = 0
    while (!solver.portPointPathingSolver && !solver.failed && steps < 10000) {
      solver.step()
      steps++
    }
    const path = solver.portPointPathingSolver as unknown as {
      params: { effort: number }
      tinyPipelineSolver: {
        inputProblem: { solveGraphOptions: { MAX_ITERATIONS: number } }
      }
    }
    expect(solver.failed).toBe(false)
    expect(path).toBeDefined()
    expect(path.params.effort).toBe(effort)
    expect(
      path.tinyPipelineSolver.inputProblem.solveGraphOptions.MAX_ITERATIONS,
    ).toBe(2_000_000 * effort)
  })
}
