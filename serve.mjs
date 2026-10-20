// Local-only static preview. Never exposes backend files, credentials or .git.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const files=new Set(['index.html','style.css','app.js','engine.js','view.js','journey-client.js','account-client.js','g5-config.js','invitation-request.html','invitation-request.js','invitation-request-config.js']);
const types={html:'text/html',css:'text/css',js:'text/javascript'};
createServer(async(req,res)=>{
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(!files.has(name)){res.writeHead(404);res.end('Not found');return}
  try{
    const data=name==='g5-config.js'?"export const G5_API_URL='http://localhost:8787';":await readFile(new URL(name,import.meta.url));
    res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(500);res.end('Preview file unavailable')}
}).listen(4175,'127.0.0.1',()=>console.log('Local G5 preview: http://localhost:4175/#g=5'));
