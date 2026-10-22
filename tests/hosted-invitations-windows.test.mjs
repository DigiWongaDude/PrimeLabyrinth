import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {rm,link,mkdir,symlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {openWindowsStore} from '../tools/hosted-invitations/windows-store.mjs';
import {prepare,issue,reconcile,load} from '../tools/hosted-invitations/core.mjs';

const windows=process.platform==='win32';
const powershell=join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
const roots=[];
function root(){const p=join(process.env.LOCALAPPDATA,'Temp',`between-hosted-test-${randomUUID()}`);roots.push(p);return p;}
function ps(script,args=[]){
  const env={};
  for(const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA'])env[key]=process.env[key];
  return execFileSync(powershell,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';"+script,...args],
    {env,windowsHide:true,encoding:'utf8',stdio:['ignore','pipe','pipe']});
}
test.after(async()=>{
  for(const path of roots){
    assert.match(path,/\\Temp\\between-hosted-test-[0-9a-f-]{36}$/);
    await rm(path,{recursive:true,force:true});
  }
});

test('native NTFS: owner-only files, flushed readback, exclusive process lock and reopening', {skip:!windows}, async()=>{
  const path=root(),id=randomUUID(),name=`${id}.token`;
  const s=await openWindowsStore(path,process.cwd());
  try {
    await s.create(name,'disposable-not-a-real-invitation');
    assert.equal(await s.read(name),'disposable-not-a-real-invitation');
    const acl=JSON.parse(ps(`$a=Get-Acl -LiteralPath '${join(path,name)}'; @{protected=$a.AreAccessRulesProtected;count=@($a.Access).Count;sid=$a.Access[0].IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value}|ConvertTo-Json -Compress`));
    assert.equal(acl.protected,true);assert.equal(acl.count,1);assert.equal(acl.sid,acl.owner);
    await assert.rejects(openWindowsStore(path,process.cwd()),/private_store/);
    await assert.rejects(s.create(name,'overwrite'),/private_store/);
  }finally{await s.close();}
  const again=await openWindowsStore(path,process.cwd());
  try{assert.equal(await again.read(name),'disposable-not-a-real-invitation');await again.deleteToken(name);assert.deepEqual(await again.list(),[]);}
  finally{await again.close();}
});

test('native NTFS: rejects inherited and unrelated ACL grants before accepting store', {skip:!windows}, async()=>{
  const inherited=root();await mkdir(inherited);
  await assert.rejects(openWindowsStore(inherited,process.cwd()),/private_store/);
  const path=root(),s=await openWindowsStore(path,process.cwd());await s.close();
  ps(`$p='${path}'; $a=[System.IO.Directory]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]::Access); $r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.SecurityIdentifier]::new('S-1-1-0'),'Read','Allow'); $a.AddAccessRule($r); [System.IO.Directory]::SetAccessControl($p,$a)`);
  await assert.rejects(openWindowsStore(path,process.cwd()),/private_store/);
});

test('native NTFS: rejects repository, ADS, traversal, non-local and synchronised paths', {skip:!windows}, async()=>{
  for(const path of [process.cwd(),root()+':stream',root()+'\\..\\escaped','\\\\server\\share\\private',join(process.env.USERPROFILE,'OneDrive','private')]){
    await assert.rejects(openWindowsStore(path,process.cwd()),/private_store/);
  }
});

test('native NTFS: rejects hardlinked token and ACL changes on existing file', {skip:!windows}, async()=>{
  const path=root(),s=await openWindowsStore(path,process.cwd()),name=`${randomUUID()}.token`;
  try {
    await s.create(name,'disposable');
    const alias=join(path,`${randomUUID()}.token`);await link(join(path,name),alias);
    await assert.rejects(s.read(name),/private_store/);
    await rm(alias);
    ps(`$p='${join(path,name)}';$a=[System.IO.File]::GetAccessControl($p,[System.Security.AccessControl.AccessControlSections]::Access);$a.SetAccessRuleProtection($false,$true);[System.IO.File]::SetAccessControl($p,$a)`);
    await assert.rejects(s.read(name),/private_store/);
  }finally{await s.close();}
});

test('native NTFS: rejects a junction and canonical repository boundary', {skip:!windows}, async()=>{
  const path=root(),s=await openWindowsStore(path,process.cwd());await s.close();
  const alias=root();await symlink(path,alias,'junction');
  await assert.rejects(openWindowsStore(alias,process.cwd()),/private_store/);
  await assert.rejects(openWindowsStore(path,alias),/private_store/);
});

test('native NTFS: persisted WRITE_UNKNOWN survives process restart and reconciles without reinserting', {skip:!windows}, async()=>{
  const path=root();let s=await openWindowsStore(path,process.cwd());
  let row=null,inserts=0;
  const api={verify:async()=>{},read:async()=>row,insert:async r=>{
    inserts++;row={id:r.id,token_hash:r.digest,operator_reference:null,created_at:100,expires_at:100+r.ttl,
      server_now:101,revoked_at:null,redeemed:0};throw new Error('simulated_lost_reply');
  }};
  let id;
  try{
    ({id}=await prepare(s,{source:'a'.repeat(40)}));
    await assert.rejects(issue(s,api,id,{preflight:async()=>true,approve:async()=>true}));
    assert.equal((await load(s,id)).state,'WRITE_UNKNOWN');
  }finally{await s.close();}
  s=await openWindowsStore(path,process.cwd());
  try{
    assert.equal((await reconcile(s,api,id)).state,'ISSUED');assert.equal(inserts,1);
  }finally{await s.close();}
});
