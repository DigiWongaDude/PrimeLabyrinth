import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {realpath} from 'node:fs/promises';

// Only pipe transport to the native ACL helper, never shell interpolation.
export async function openWindowsStore(root, repository) {
  if (process.platform !== 'win32') throw new Error('windows_required');
  const childEnv = {};
  // Deliberately do not inherit Cloudflare, Node debugging or arbitrary credentials.
  for (const name of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA'])
    if (process.env[name]) childEnv[name]=process.env[name];
  const child=spawn(join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),
    ['-NoLogo','-NoProfile','-NonInteractive','-File',fileURLToPath(new URL('./private-store.ps1',import.meta.url))],
    {env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
  let pending=null, closed=false;
  const fail=()=>{closed=true;if(pending){pending.reject(new Error('private_store_unavailable'));pending=null;}};
  child.on('error',fail); child.on('exit',fail);
  child.stderr.on('data',()=>{}); // Never forward PowerShell diagnostics or data.
  child.stdin.on('error',fail);
  const lines=createInterface({input:child.stdout});
  lines.on('line',line=>{
    if(!pending)return;
    const request=pending;pending=null;
    try {
      const result=JSON.parse(line);
      if(result.ok!==true)throw new Error();
      request.resolve(result.value);
    }catch{request.reject(new Error('private_store_rejected'));}
  });
  async function call(action, data={}) {
    if(closed||pending)throw new Error('private_store_unavailable');
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{fail();child.kill();},15000);
      pending={resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}};
      child.stdin.write(JSON.stringify({action,...data})+'\n');
    });
  }
  const store={
    check:()=>call('check'), create:(name,text)=>call('create',{name,text}),
    read:name=>call('read',{name}), list:()=>call('list'),
    deleteToken:name=>call('deleteToken',{name}),
    close:()=>new Promise(resolve=>{
      if(closed)return resolve();
      child.once('exit',resolve);child.stdin.end();
    }),
  };
  try {await call('open',{root,repository:await realpath(repository)});return store;}
  catch(error){child.stdin.end();child.kill();throw error;}
}
