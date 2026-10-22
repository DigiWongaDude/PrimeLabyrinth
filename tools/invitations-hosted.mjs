// Operator-only CLI; never imported by Worker or browser. No default network access.
import {createHash} from 'node:crypto';
import {readFile,realpath,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline/promises';
import ts from 'typescript';
import {openWindowsStore} from './hosted-invitations/windows-store.mjs';
import {TARGET,requireThat,safeError,prepare,status,issue,reconcile,revoke,delivered,d1Client} from './hosted-invitations/core.mjs';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const help=`Windows staging operator (no default network):
  node tools/invitations-hosted.mjs prepare [--ttl-seconds 172800] [--reference LABEL]
  node tools/invitations-hosted.mjs status --id UUID
Future Paul-approved remote operations ONLY:
  node tools/invitations-hosted.mjs issue --id UUID --remote --backup PATH --sha256 SHA256
  node tools/invitations-hosted.mjs retry --id UUID --remote --backup PATH --sha256 SHA256
  node tools/invitations-hosted.mjs reconcile --id UUID --remote
  node tools/invitations-hosted.mjs revoke --id UUID --remote
  node tools/invitations-hosted.mjs delivered --id UUID --remote
No secrets as arguments. See tools/hosted-invitations/README.md.`;
function parse(args){
  const command=args[0],options={};
  requireThat(['prepare','status','issue','retry','reconcile','revoke','delivered'].includes(command),'invalid_command');
  const allowed={prepare:['--ttl-seconds','--reference'],status:['--id'],
    issue:['--id','--remote','--backup','--sha256'],retry:['--id','--remote','--backup','--sha256'],
    reconcile:['--id','--remote'],revoke:['--id','--remote'],delivered:['--id','--remote']}[command];
  for(let i=1;i<args.length;i++){
    const key=args[i];requireThat(allowed.includes(key)&&!Object.hasOwn(options,key),'invalid_arguments');
    if(key==='--remote')options[key]=true;
    else {requireThat(i+1<args.length&&!args[i+1].startsWith('--'),'invalid_arguments');options[key]=args[++i];}
  }
  if(command!=='prepare')requireThat(options['--id']?.length===36&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(options['--id']),'invalid_id');
  if(!['prepare','status'].includes(command))requireThat(options['--remote']===true,'remote_gate_required');
  return {command,options};
}
export async function run(argv,{input=process.stdin,output=process.stdout}={}){
  if(argv.length===0||argv[0]==='--help'){output.write(help+'\n');return;}
  const {command,options}=parse(argv);
  requireThat(process.platform==='win32','windows_required');
  requireThat(!process.env.NODE_OPTIONS&&!process.env.NODE_DEBUG&&!process.env.NODE_DEBUG_NATIVE&&
    process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='0'&&!process.env.NODE_USE_ENV_PROXY,'unsafe_runtime_environment');
  // Remove before spawning anything. Never inspect Wrangler credentials.
  const credential=process.env.BETWEEN_D1_API_TOKEN;
  delete process.env.BETWEEN_D1_API_TOKEN;
  const childEnv={};
  for(const key of ['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA'])if(process.env[key])childEnv[key]=process.env[key];
  const git=args=>execFileSync('git',args,{cwd:repository,env:childEnv,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  requireThat(git(['branch','--show-current'])==='codex/g5-persistence'&&git(['status','--porcelain'])==='','reviewed_checkout_required');
  const source=git(['rev-parse','HEAD']);
  const config=ts.parseConfigFileTextToJson('wrangler.staging.jsonc',await readFile(join(repository,'wrangler.staging.jsonc'),'utf8'));
  requireThat(!config.error&&config.config.account_id===TARGET.account&&
    config.config.name==='between-g5-staging-api'&&config.config.d1_databases?.length===1&&
    config.config.d1_databases[0].database_id===TARGET.database&&config.config.d1_databases[0].database_name===TARGET.name,'wrong_target');
  requireThat(input.isTTY&&output.isTTY,'interactive_terminal_required');
  const terminal=createInterface({input,output});
  async function confirm(phrase){
    return (await terminal.question(`Type ${phrase} to confirm (otherwise stop): `)).trim()===phrase;
  }
  let store;
  try{
    // The native helper only receives its tiny allowlisted environment, no API token.
    store=await openWindowsStore(join(process.env.LOCALAPPDATA,'Between-Staging-Invitations'),repository);
    let result;
    if(command==='prepare'){
      requireThat(await confirm('PRIVATE LOCAL STORAGE NOT SYNCED'),'approval_required');
      result=await prepare(store,{source,ttl:options['--ttl-seconds']===undefined?172800:Number(options['--ttl-seconds']),
        reference:options['--reference']||''});
    }else if(command==='status')result=await status(store,options['--id']);
    else {
      requireThat(typeof credential==='string'&&credential.length>0,'credential_required');
      // Read-only API calls also need a conscious remote gate.
      requireThat(await confirm(`CONNECT ${TARGET.name} ${TARGET.database}`),'approval_required');
      const api=d1Client({fetcher:fetch,credential});
      const id=options['--id'];
      const approve=({verb,id})=>confirm(`${verb} ${id} ${TARGET.name}`);
      async function preflight(){
        requireThat(config.config.vars.ACCOUNTS_ENABLED==='false'&&config.config.vars.REGISTRATION_ENABLED==='false','closed_flags_required');
        requireThat(options['--backup']&&/^[0-9a-fA-F]{64}$/.test(options['--sha256']||''),'backup_required');
        const path=await realpath(options['--backup']),repo=await realpath(repository),rel=relative(repo,path);
        requireThat(rel!==''&&(rel.startsWith('..\\')||isAbsolute(rel)),'backup_outside_repo_required');
        const info=await stat(path);
        requireThat(info.isFile()&&info.size>0&&Date.now()-info.mtimeMs>=0&&Date.now()-info.mtimeMs<=86400000,'fresh_backup_required');
        const hash=createHash('sha256');
        for await(const chunk of createReadStream(path))hash.update(chunk);
        requireThat(hash.digest('hex')===options['--sha256'].toLowerCase(),'backup_checksum_mismatch');
        // D1-only credentials cannot inspect Worker settings. Do not claim otherwise.
        return confirm('PAUL VERIFIED LIVE FLAGS OFF AND BACKUP CURRENT');
      }
      if(command==='issue'||command==='retry')result=await issue(store,api,id,{approve,preflight,retry:command==='retry'});
      if(command==='reconcile')result=await reconcile(store,api,id);
      if(command==='revoke')result=await revoke(store,api,id,{approve});
      if(command==='delivered')result=await delivered(store,api,id,{approve});
    }
    output.write(JSON.stringify(result)+'\n');
  }finally{if(store)await store.close();terminal.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{await run(process.argv.slice(2));}
  catch(error){process.stderr.write(`${safeError(error)}; stopped. Reconcile uncertain operations; do not reissue blindly.\n`);process.exitCode=1;}
}
