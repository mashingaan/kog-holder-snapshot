import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildSnapshot, fetchAccounts, TOKEN_PROGRAMS } from '../src/index.js'
const mint='test-mint'
const account=(pubkey,owner,amount,extra={})=>({pubkey,account:{owner:TOKEN_PROGRAMS[0],data:{program:'spl-token',parsed:{type:'account',info:{mint,owner,state:'initialized',tokenAmount:{amount,decimals:9},...extra}}}}})
const options=accounts=>({mint,slot:123,accounts,exclusions:{owners:[],token_accounts:[]}})
test('A1 group both programs and ignore other mints, zero and nonaccounts',()=>{
 const second=account('b','Alice','9007199254740993')
 second.account.owner=TOKEN_PROGRAMS[1]
 const accounts=[account('a','Alice','7'),second,account('c','Bob','10'),account('d','Zero','0'),account('e','Other','99',{mint:'different'}),{account:{data:{parsed:{type:'mint'}}}},null]
 const result=buildSnapshot(options(accounts))
 assert.equal(result.total,'9007199254741010')
 assert.deepEqual(result.holders,[{rank:1,owner:'Alice',amount:'9007199254741000'},{rank:2,owner:'Bob',amount:'10'}])
})
test('A2 exclusions are applied before aggregation and total',()=>{
 const result=buildSnapshot({...options([account('a','Alice','5'),account('b','Alice','7'),account('c','Bob','20')]),exclusions:{owners:['Bob'],token_accounts:['a']}})
 assert.equal(result.total,'7')
 assert.deepEqual(result.holders,[{rank:1,owner:'Alice',amount:'7'}])
})
test('A3 amount descending, plain owner ties, top does not truncate total',()=>{
 const accounts=[account('a','a','10'),account('b','Z','10'),account('c','A','20')]
 const result=buildSnapshot({...options(accounts),top:2})
 assert.deepEqual(result.holders.map(h=>h.owner),['A','Z'])
 assert.equal(result.total,'40')
 assert.equal(buildSnapshot({...options(accounts),top:0}).holders.length,0)
 assert.equal(buildSnapshot({...options(accounts),top:0}).total,'40')
})
test('A4 exact UTF8 hash, no trailing newline, empty snapshot, input order and immutability',()=>{
 const accounts=[account('a','Bob','2'),account('b','Alice','3'),account('c','Bob','4')]
 const before=JSON.stringify(accounts)
 const result=buildSnapshot(options(accounts))
 const expected=createHash('sha256').update('1,Bob,6\n2,Alice,3').digest('hex')
 assert.equal(result.hash,expected)
 assert.equal(JSON.stringify(accounts),before)
 assert.deepEqual(buildSnapshot(options([...accounts].reverse())),result)
 assert.equal(buildSnapshot(options([])).hash,'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
})
test('A5 Token-2022 extensions, frozen and large exact amounts count',()=>{
 const a=account('a','Frozen','18446744073709551615',{state:'frozen',extensions:[{extension:'immutableOwner'},{extension:'transferFeeAmount',state:{withheldAmount:'9'}}]})
 a.account.owner=TOKEN_PROGRAMS[1]
 a.account.data.program='spl-token-2022'
 assert.equal(buildSnapshot(options([a])).total,'18446744073709551615')
})
test('A6 RPC sends two exact program requests, minContextSlot and minimum context',async()=>{
 const calls=[]
 const result=await fetchAccounts({rpcUrl:'https://example.com/private',mint,minContextSlot:50,fetch:async(url,init)=>{
  const body=JSON.parse(init.body)
  calls.push(body)
  return Response.json({result:{context:{slot:body.id===1?101:99},value:[account(String(body.id),'Alice','1')]}})
 }})
 assert.equal(calls.length,2)
 for(const [i,c] of calls.entries()) {
  assert.equal(c.method,'getProgramAccounts')
  assert.equal(c.params[0],TOKEN_PROGRAMS[i])
  assert.deepEqual(c.params[1],{encoding:'jsonParsed',withContext:true,filters:[{memcmp:{offset:0,bytes:mint}}],minContextSlot:50})
 }
 assert.equal(result.slot,99)
 assert.equal(result.accounts.length,2)
})
test('A6 RPC errors, malformed context and timeouts never leak the RPC URL',async()=>{
 for(const fetch of [async()=>{throw new Error('https://private/key')},async()=>Response.json({error:{message:'https://private/key'}}),async()=>Response.json({result:{context:{slot:-1},value:[]}}),()=>new Promise(()=>{})]) {
  await assert.rejects(fetchAccounts({rpcUrl:'https://private/key',mint,fetch,timeoutMs:5}),e=>!e.message.includes('private')&&e.message.includes('RPC'))
 }
})
test('A6 CLI fixture, save, top, output and bad inputs work offline',()=>{
 const dir=mkdtempSync(join(tmpdir(),'kog-snapshot-'))
 try {
  const fixture=join(dir,'fixture.json'), exclusions=join(dir,'exclusions.json'), output=join(dir,'out.json'), saved=join(dir,'saved.json')
  writeFileSync(fixture,JSON.stringify({slot:123,accounts:[account('a','Alice','12'),account('b','Bob','3')]}))
  writeFileSync(exclusions,JSON.stringify({owners:[],token_accounts:[]}))
  const args=['src/cli.js','--mint',mint,'--exclusions',exclusions,'--fixture',fixture]
  const result=JSON.parse(execFileSync(process.execPath,args,{encoding:'utf8',env:{...process.env,SOLANA_RPC_URL:'https://invalid/private/key'}}))
  assert.equal(result.total,'15')
  execFileSync(process.execPath,[...args,'--top','1','--out',output,'--save-fixture',saved])
  assert.equal(JSON.parse(readFileSync(output)).holders.length,1)
  assert.equal(JSON.parse(readFileSync(saved)).accounts.length,2)
  for(const bad of [[],['--mint'],[...args,'--slot','999'],[...args,'--top','NaN'],[...args,'--unknown','x'],[...args,'--top','-1'],['--mint',mint,'--exclusions','missing']]) {
   const r=spawnSync(process.execPath,['src/cli.js',...(bad[0]==='src/cli.js'?bad.slice(1):bad)],{encoding:'utf8'})
   assert.equal(r.status,1)
   assert.ok(r.stderr.trim())
   assert.doesNotMatch(r.stderr,/private\/key/)
  }
 } finally {rmSync(dir,{recursive:true,force:true})}
})
test('A7 genuine recorded Token-2022 accounts reproduce a fixed snapshot',()=>{
 const fixture=JSON.parse(readFileSync('fixtures/pyusd.json','utf8'))
 const expected=JSON.parse(readFileSync('fixtures/expected.json','utf8'))
 assert.ok(fixture.accounts.length>0)
 assert.ok(fixture.accounts.every(a=>a.account.owner===TOKEN_PROGRAMS[1]))
 assert.deepEqual(buildSnapshot({mint:fixture.mint,...fixture,exclusions:{owners:[],token_accounts:[]}}),expected)
})
test('Malformed amount rows ignored, invalid controls fail explicitly',()=>{
 const rows=['-1','1.2','NaN',9,''].map((n,i)=>account(String(i),'Invalid',n))
 assert.equal(buildSnapshot(options(rows)).total,'0')
 for(const override of [{top:-1},{top:1.5},{slot:Infinity},{accounts:{}},{exclusions:{}}]) assert.throws(()=>buildSnapshot({...options([]),...override}))
})

test('A1 foreign program lookalikes cannot contribute fake token balances',()=>{
 const foreign=account('fake','Attacker','99999999999999999')
 foreign.account.owner='NotATokenProgram'
 assert.equal(buildSnapshot(options([foreign,account('real','Alice','2')])).total,'2')
})
test('A4 deterministic generated permutations preserve exact totals and hashes',()=>{
 let seed=17
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0
  return seed}
 const accounts=Array.from({length:80},(_,i)=>account('account'+i,'owner'+(i%13),String(BigInt(random())*9007199254740993n)))
 const expected=buildSnapshot({...options(accounts),top:7})
 let round=0
 while(round++<30) {
  const copy=[...accounts]
  let i=copy.length-1
  while(i>0) {
   const j=random()%(i+1)
   const swap=copy[i]
   copy[i]=copy[j]
   copy[j]=swap
   i--
  }
  assert.deepEqual(buildSnapshot({...options(copy),top:7}),expected)
 }
})
