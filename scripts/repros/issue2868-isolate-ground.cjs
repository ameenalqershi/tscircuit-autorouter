#!/usr/bin/env node
/** Isolate source_net_144, retaining every original obstacle and six-layer bound. */
const fs = require("node:fs")
const crypto = require("node:crypto")
const [source, dest] = process.argv.slice(2)
if (!source || !dest) {
  console.error("Usage: node scripts/repros/issue2868-isolate-ground.cjs <original-srj.json> <destination.json>")
  process.exit(2)
}
const originalBytes = fs.readFileSync(source)
const sha = crypto.createHash("sha256").update(originalBytes).digest("hex")
if (sha !== "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca") {
  throw new Error(`Unexpected original board SHA256: ${sha}`)
}
const original = JSON.parse(originalBytes.toString("utf8"))
const only = original.connections.filter((c) => c.name === "source_net_144")
if (only.length !== 1 || only[0].pointsToConnect.length !== 730) {
  throw new Error("Expected exactly one GND source net with 730 endpoints")
}
const reduced = { ...original, connections: only, differentialPairs: [] }
const bytes = JSON.stringify(reduced)
const outputSha256 = crypto.createHash("sha256").update(bytes).digest("hex")
if (outputSha256 !== "70edb615c99d85baa914206e01c190da46bb0dc1686dd12b5d9cf046fee37cb9") {
  throw new Error(`Isolated fixture changed unexpectedly: ${outputSha256}`)
}
fs.writeFileSync(dest, bytes)
console.log(JSON.stringify({
  source: "source_net_144", endpoints: 730, obstacles: reduced.obstacles.length,
  layers: reduced.layerCount, outputSha256, bytes: bytes.length, dest,
}))
