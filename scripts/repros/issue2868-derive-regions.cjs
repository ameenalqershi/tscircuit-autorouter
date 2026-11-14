#!/usr/bin/env node
/** Reproducible regional reductions of tscircuit-autorouter issue #2868. */
const fs = require("node:fs")
const path = require("node:path")
const { createHash } = require("node:crypto")
const [inputPath,outputDir=".tmp-issue2868-reduced"] = process.argv.slice(2)
if (!inputPath) {
  console.error("Usage: node scripts/repros/issue2868-derive-regions.cjs <original-issue-json> [output-dir]")
  process.exit(2)
}
const bytes = fs.readFileSync(inputPath)
const sha = createHash("sha256").update(bytes).digest("hex")
const expected = "471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca"
if (sha !== expected) throw new Error(`Expected original #2868 fixture SHA256 ${expected}, got ${sha}`)
const original = JSON.parse(bytes.toString("utf8"))
fs.mkdirSync(outputDir,{recursive:true})
const specs = [
  {name:"10mm",size:10},{name:"20mm",size:20},{name:"30mm",size:30},
  {name:"40mm",size:40},{name:"50mm",size:50},
]
for(const {name,size} of specs){
  const bounds={minX:-45-size/2,maxX:-45+size/2,minY:-5-size/2,maxY:-5+size/2}
  const obstacles=original.obstacles.filter(o=>o.center.x+o.width/2>=bounds.minX && o.center.x-o.width/2<=bounds.maxX && o.center.y+o.height/2>=bounds.minY && o.center.y-o.height/2<=bounds.maxY)
  const connections=original.connections.filter(c=>c.pointsToConnect.every(p=>p.x>=bounds.minX && p.x<=bounds.maxX && p.y>=bounds.minY && p.y<=bounds.maxY))
  const names=new Set(connections.map(c=>c.name))
  const differentialPairs=original.differentialPairs.filter(pair=>pair.connectionNames.every(n=>names.has(n)))
  const out={...original,bounds,obstacles,connections,differentialPairs}
  const outputFile=path.join(outputDir,`region-${name}.json`)
  fs.writeFileSync(outputFile,JSON.stringify(out))
  console.log(JSON.stringify({name,size,obstacles:obstacles.length,connections:connections.length,sha256:createHash("sha256").update(fs.readFileSync(outputFile)).digest("hex"),outputFile}))
}

// Isolate one real high-speed differential pair from the same original board.
const differentialPair = original.differentialPairs.find(p => p.connectionNames.includes("source_trace_4"))
if (!differentialPair) throw new Error("The original issue input is missing expected differential pair 4/5")
const pairNames = new Set(differentialPair.connectionNames)
const pairConnections = original.connections.filter(c => pairNames.has(c.name))
const pairPoints = pairConnections.flatMap(c => c.pointsToConnect)
const pairBounds = {
  minX: Math.min(...pairPoints.map(p=>p.x)) - 4,
  maxX: Math.max(...pairPoints.map(p=>p.x)) + 4,
  minY: Math.min(...pairPoints.map(p=>p.y)) - 4,
  maxY: Math.max(...pairPoints.map(p=>p.y)) + 4,
}
const pairObstacles = original.obstacles.filter(o => o.center.x+o.width/2>=pairBounds.minX && o.center.x-o.width/2<=pairBounds.maxX && o.center.y+o.height/2>=pairBounds.minY && o.center.y-o.height/2<=pairBounds.maxY)
const pairData = { ...original, bounds:pairBounds, obstacles:pairObstacles, connections:pairConnections, differentialPairs:[differentialPair] }
const pairFile = path.join(outputDir, "diffpair-4-5.json")
fs.writeFileSync(pairFile,JSON.stringify(pairData))
console.log(JSON.stringify({name:"diffpair-4-5",obstacles:pairObstacles.length,connections:pairConnections.length,differentialPairs:1,sha256:createHash("sha256").update(fs.readFileSync(pairFile)).digest("hex"),outputFile:pairFile}))
