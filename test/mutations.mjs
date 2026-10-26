import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const mutants=[
 ['wrong ranking','x>y?-1:1','x>y?1:-1'],
 ['wrong ties','a<b?-1:a>b?1:0','a<b?1:a>b?-1:0'],
 ['owner exclusion bypass','excludedOwners.has(info.owner)','false'],
 ['account exclusion bypass','excludedAccounts.has(item.pubkey)','false'],
 ['trailing hash newline',".update(lines,'utf8')",".update(lines+'\\n','utf8')"],
 ['top ignored','ranked.slice(0,top)','ranked'],
 ['maximum slot','Math.min(...results.map','Math.max(...results.map'],
 ['skip token-2022','TOKEN_PROGRAMS.map','TOKEN_PROGRAMS.slice(0,1).map'],
 ['foreign program accepted','!TOKEN_PROGRAMS.includes(item?.account?.owner)','false']
]
const source=readFileSync('src/index.js','utf8')
for(const [name,from,to] of mutants) {
 if(!source.includes(from)) throw new Error(`Mutation missing: ${name}`)
 const dir=mkdtempSync(join(tmpdir(),'kog-mutant-'))
 try {
  for(const path of ['src','test','fixtures','package.json']) cpSync(path,join(dir,path),{recursive:true})
  writeFileSync(join(dir,'src/index.js'),source.replace(from,to))
  const syntax=spawnSync(process.execPath,['--check',join(dir,'src/index.js')],{encoding:'utf8'})
  if(syntax.status!==0) throw new Error('Mutation is invalid JavaScript')
  const r=spawnSync(process.execPath,['--test','test/snapshot.test.js'],{cwd:dir,encoding:'utf8',timeout:30000})
  if(r.status===0 || r.error) throw new Error(`Mutation survived or did not run: ${name}`)
  if(!/AssertionError|ERR_ASSERTION/.test(r.stdout)||/SyntaxError|ERR_MODULE_NOT_FOUND/.test(r.stdout+r.stderr)) throw new Error(`Mutation did not reach assertions: ${name}`)
  console.log(`Caught: ${name}`)
 } finally {rmSync(dir,{recursive:true,force:true})}
}
