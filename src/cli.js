#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { buildSnapshot, fetchAccounts } from './index.js'
const allowed=new Set(['--mint','--exclusions','--slot','--top','--out','--fixture','--save-fixture'])
async function main() {
 const options={}
 const args=process.argv.slice(2)
 while(args.length) {
  const flag=args.shift()
  if(!allowed.has(flag) || options[flag]!==undefined || !args.length || args[0].startsWith('--')) throw new Error('Unknown, repeated or missing option value')
  options[flag]=args.shift()
 }
 if(!options['--mint']) throw new Error('--mint is required')
 if(!options['--exclusions']) throw new Error('--exclusions is required')
 const number=(flag)=>{
  if(options[flag]===undefined) return undefined
  if(!/^\d+$/.test(options[flag]) || !Number.isSafeInteger(Number(options[flag]))) throw new Error(`${flag} must be a nonnegative integer`)
  return Number(options[flag])
 }
 const slot=number('--slot')
 const top=number('--top')
 const load=async(path)=>{
  try {return JSON.parse(await readFile(path,'utf8'))} catch {throw new Error('Could not read JSON input file')}
 }
 const exclusions=await load(options['--exclusions'])
 const fixture=options['--fixture']?await load(options['--fixture']):await fetchAccounts({rpcUrl:process.env.SOLANA_RPC_URL,mint:options['--mint'],minContextSlot:slot})
 if(slot!==undefined && fixture.slot<slot) throw new Error('Fixture slot is below requested minimum')
 const result=buildSnapshot({...fixture,mint:options['--mint'],exclusions,top})
 if(options['--save-fixture']) {
  try {await writeFile(options['--save-fixture'],JSON.stringify({slot:fixture.slot,accounts:fixture.accounts},null,2)+'\n')} catch {throw new Error('Could not write fixture file')}
 }
 const output=JSON.stringify(result,null,2)+'\n'
 if(options['--out']) {
  try {await writeFile(options['--out'],output)} catch {throw new Error('Could not write output file')}
 } else process.stdout.write(output)
}
main().catch(error=>{process.stderr.write(`${error.message}\n`)
 process.exitCode=1})
