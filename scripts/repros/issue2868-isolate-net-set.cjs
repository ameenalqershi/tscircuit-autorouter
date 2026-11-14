#!/usr/bin/env node
// Deterministic differential-reduction of the original six-layer fixture.
// Usage: node issue2868-isolate-net-set.cjs original.json output.json --only source_net_144,source_net_0
//        node issue2868-isolate-net-set.cjs original.json output.json --exclude source_net_0
const fs=require('node:fs')
const crypto=require('node:crypto')
const [source,dest,mode,arg]=process.argv.slice(2)
if(!source||!dest||!['--only','--exclude'].includes(mode)||!arg)throw Error('Expected <original.json> <out.json> --only|--exclude <net1,net2>')
const raw=fs.readFileSync(source)
const inputSha=crypto.createHash('sha256').update(raw).digest('hex')
if(inputSha!=='471334fad7b86e550ad1e5b9aae796665957512c78d6cc58f58fd2f8f11d28ca')throw Error('Original input checksum differs: '+inputSha)
const j=JSON.parse(raw.toString('utf8'))
const nets=new Set(arg.split(',').filter(Boolean))
if(nets.size===0)throw Error('No nets specified')
for(const net of nets)if(!j.connections.some(c=>c.name===net))throw Error('Unknown net '+net)
const connections=j.connections.filter(c=>mode==='--only'?nets.has(c.name):!nets.has(c.name))
const out={...j,connections,differentialPairs:[]}
const bytes=JSON.stringify(out)
fs.writeFileSync(dest,bytes)
console.log(JSON.stringify({tag:'derived-fixture',sourceInputSha256:inputSha,mode,selection:[...nets],connectionCount:connections.length,totalTerminalPoints:connections.reduce((n,c)=>n+c.pointsToConnect.length,0),obstacles:out.obstacles.length,layers:out.layerCount,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,dest}))
