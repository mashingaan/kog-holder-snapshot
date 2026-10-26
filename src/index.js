import { createHash } from 'node:crypto'
export const TOKEN_PROGRAMS = Object.freeze(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'])
const integer = (n, name) => {
 if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${name} must be a nonnegative safe integer`)
 return n
}
const text = (s,name) => {
 if (typeof s !== 'string' || !s.trim()) throw new Error(`${name} is required`)
 return s
}
export function buildSnapshot({mint,slot,accounts,exclusions={owners:[],token_accounts:[]},top=100}) {
 text(mint,'mint')
 integer(slot,'slot')
 integer(top,'top')
 if (!Array.isArray(accounts)) throw new Error('accounts must be an array')
 if (!exclusions || !Array.isArray(exclusions.owners) || !Array.isArray(exclusions.token_accounts) || ![...exclusions.owners,...exclusions.token_accounts].every(s=>typeof s==='string')) throw new Error('Invalid exclusions')
 const excludedOwners=new Set(exclusions.owners)
 const excludedAccounts=new Set(exclusions.token_accounts)
 const balances=new Map()
 for(const item of accounts) {
  const parsed=item?.account?.data?.parsed
  const info=parsed?.info
  if(parsed?.type!=='account' || info?.mint!==mint || typeof info.owner!=='string' || !info.owner || excludedOwners.has(info.owner) || excludedAccounts.has(item.pubkey)) continue
  const raw=info.tokenAmount?.amount
  if(typeof raw!=='string' || !/^\d+$/.test(raw)) continue
  const amount=BigInt(raw)
  if(amount<=0n) continue
  balances.set(info.owner,(balances.get(info.owner)??0n)+amount)
 }
 const ranked=[...balances.entries()].sort(([a,x],[b,y])=>x===y?(a<b?-1:a>b?1:0):x>y?-1:1)
 const total=ranked.reduce((sum,[,amount])=>sum+amount,0n).toString()
 const holders=ranked.slice(0,top).map(([owner,amount],index)=>({rank:index+1,owner,amount:amount.toString()}))
 const lines=holders.map(h=>`${h.rank},${h.owner},${h.amount}`).join('\n')
 return {mint,slot,total,holders,hash:createHash('sha256').update(lines,'utf8').digest('hex')}
}

export async function fetchAccounts({rpcUrl,mint,fetch:fetcher=globalThis.fetch,minContextSlot,timeoutMs=15000}) {
 text(mint,'mint')
 try {
  const url=new URL(rpcUrl)
  if(!['http:','https:'].includes(url.protocol)) throw new Error()
 } catch { throw new Error('A valid SOLANA_RPC_URL is required') }
 if(minContextSlot!==undefined) integer(minContextSlot,'minContextSlot')
 if(!Number.isFinite(timeoutMs) || timeoutMs<=0 || timeoutMs>2147483647) throw new Error('Invalid RPC timeout')
 const results=await Promise.all(TOKEN_PROGRAMS.map(async(program,index)=>{
  const controller=new AbortController()
  let timer
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{reject(new Error('RPC timed out'))
   controller.abort()},timeoutMs)})
  try {
   return await Promise.race([expired,(async()=>{
    const response=await fetcher(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal,body:JSON.stringify({jsonrpc:'2.0',id:index+1,method:'getProgramAccounts',params:[program,{encoding:'jsonParsed',withContext:true,filters:[{memcmp:{offset:0,bytes:mint}}],...(minContextSlot===undefined?{}:{minContextSlot})}]})})
    if(!response.ok) throw new Error('RPC HTTP failure')
    const data=await response.json()
    if(data.error || !data.result || !Array.isArray(data.result.value)) throw new Error('RPC response failure')
    const slot=integer(data.result.context?.slot,'RPC slot')
    if(minContextSlot!==undefined && slot<minContextSlot) throw new Error('RPC slot is below requested minimum')
    return {slot,accounts:data.result.value}
   })()])
  } catch {throw new Error('RPC request failed or returned invalid data')}
  finally {clearTimeout(timer)}
 }))
 return {slot:Math.min(...results.map(r=>r.slot)),accounts:results.flatMap(r=>r.accounts)}
}
