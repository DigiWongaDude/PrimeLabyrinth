import http from "node:http";
import {readFile} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
const root=new URL("./dist/",import.meta.url).pathname.replace(/^\/(.:)/,"$1");
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);const relative=pathname==="/"?"index.html":pathname.slice(1);const file=normalize(join(root,relative));if(!file.startsWith(normalize(root)))throw Error("outside root");const body=await readFile(file);res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream","Cache-Control":"no-store"});res.end(body)}catch{res.writeHead(404);res.end("Not found")}}).listen(4173,"127.0.0.1",()=>console.log("The Between: http://127.0.0.1:4173"));
