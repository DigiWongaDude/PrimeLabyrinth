import {START,ROOM_SIZE,INWARD,accentFor,arrivalFrom,cellOf,diamondRows,encodePath,decodePath,makeDoors,makeTerrain,replay,roomArchitecture,stableSeed,walkRoute} from "./engine.js";
import {turnPoint,turnVector,viewDepth,boundaryWalls} from "./view.js";
import {JourneyClient} from "./journey-client.js";
import {AccountClient} from "./account-client.js";
import {G5_API_URL} from "./g5-config.js";

const canvas=document.querySelector("#game"),ctx=canvas.getContext("2d");
const info=document.querySelector("#room-info"),status=document.querySelector("#status");
const W=1280,H=800,OX=640,OY=340,TX=38,TY=15,LH=50,WALL_HEIGHT=4.6,INK=[9,13,20],TEXT=[238,239,224];
const sum=a=>a.reduce((x,y)=>x+y,0), terrainAt=(m,p)=>m.get(`${p[0]},${p[1]}`)||0;
const css=c=>`rgb(${c.map(Math.round).join(" ")})`,blend=(a,b,t)=>a.map((x,i)=>Math.round(x+(b[i]-x)*t));
let cameraTurns=0;
let journeyClient=null,accountClient=null,g5Busy=false;
const iso=(x,y,z=0)=>{[x,y]=turnPoint([x,y],cameraTurns);return[Math.round(OX+(x-y)*TX),Math.round(OY+(x+y)*TY-z*LH)]};
const depth=point=>viewDepth(point,cameraTurns);
const polygon=(points,fill,stroke=null,width=1)=>{ctx.beginPath();ctx.moveTo(...points[0]);for(const p of points.slice(1))ctx.lineTo(...p);ctx.closePath();if(fill){ctx.fillStyle=css(fill);ctx.fill()}if(stroke){ctx.strokeStyle=css(stroke);ctx.lineWidth=width;ctx.stroke()}};
const line=(a,b,c,w=1)=>{ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=css(c);ctx.lineWidth=w;ctx.stroke()};
const portalPolygon=(d,half=.8,height=1.25)=>{const p=d.position,z=d.level;let a,b;if(d.wall==="NORTH"||d.wall==="SOUTH"){const y=d.wall==="NORTH"?0:12;a=[p-half,y];b=[p+half,y]}else{const x=d.wall==="WEST"?0:12;a=[x,p-half];b=[x,p+half]}return [iso(...a,z),iso(...b,z),iso(...b,z+height),iso(...a,z+height)]};
const inside=(p,poly)=>{const crosses=poly.map((a,i)=>{const b=poly[(i+1)%poly.length];return(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])});return crosses.every(x=>x>=0)||crosses.every(x=>x<=0)};

class Game{
  constructor(path=[],generation=4){cameraTurns=0;this.path=[...path];this.generation=[1,2,3,4,5].includes(generation)?generation:4;const state=replay(this.path,this.geometryGeneration);this.rooms=state.rooms;this.frames=state.frames;this.time=0;this.stride=0;this.facing=[1,1];this.load();}
  get geometryGeneration(){return this.generation===5?4:this.generation}
  get room(){return this.rooms.at(-1)} get previous(){return this.rooms.length>1?this.rooms.at(-2):null}
  get address(){return `2,2,3:${encodePath(this.path)}`}
  load(returning=null){this.entrance=this.frames.at(-1);this.architecture=roomArchitecture(this.room,this.previous,this.path,this.geometryGeneration,this.entrance);this.doors=makeDoors(this.room,this.entrance,this.previous,this.path,this.geometryGeneration,this.architecture);this.accent=accentFor(this.room,this.previous);this.terrain=makeTerrain([...this.doors,this.entrance]);for(const k of [...this.terrain.keys()])if(!this.architecture.cells.has(k))this.terrain.delete(k);const spawn=returning===null?this.entrance:this.doors[returning];[this.x,this.y]=spawn.approach;this.z=spawn.level;this.facing=INWARD[spawn.wall];this.destination=null;this.route=[];this.pending=null;this.walking=false;this.notice=`Entered from ${spawn.wall.toLowerCase()} · tap a door to travel`;this.sync();}
  sync(){const shape=this.generation>=3?` · ${this.architecture.shape.toUpperCase()} R${this.architecture.rotation*90}`:"";info.textContent=`P${sum(this.room)} (${this.room.join(",")}) · visit ${this.address} · G${this.generation}${shape}${this.generation===5?' · World floor: not assigned':''}`;status.textContent=this.notice;document.querySelector("#camera-controls").hidden=this.generation<4;document.querySelector("#camera-angle").textContent=`View ${cameraTurns*90}°`;document.querySelector("#back").disabled=!this.path.length;document.querySelector("#journey-manage").hidden=this.generation!==5;document.body.dataset.room=this.room.join(",");document.body.dataset.path=encodePath(this.path);document.body.dataset.generation=this.generation;if(this.generation<5)localStorage.setItem("prime-labyrinth-browser-v2",JSON.stringify({path:this.path,generation:this.generation}));const route=`g=${this.generation}&path=${encodeURIComponent(encodePath(this.path))}`;history.replaceState(null,"",`#${route}`);}
  setDestination(point,action=null){if(this.generation===5&&g5Busy)return;const route=walkRoute([this.x,this.y],point,this.terrain,this.architecture.cells);if(!route){this.notice="That landing cannot be reached from here";this.sync();return}this.destination=point;this.pending=action;this.route=route;}
  click(point){if(this.generation===5&&g5Busy)return;const portals=[...this.doors,...(this.path.length?[this.entrance]:[])].sort((a,b)=>depth(b.approach)-depth(a.approach));for(const d of portals){const rune=iso(...d.approach,d.level),dist=Math.hypot(point[0]-rune[0],point[1]-rune[1]);if(inside(point,portalPolygon(d))||dist<=24){this.setDestination(d.approach,d.index===-1?"back":d.index);this.notice=d.index===-1?"Returning through the entrance":`Walking to door ${d.index.toString(16).toUpperCase()} · P${sum(d.target)}`;this.sync();return}}
    for(const [k,height] of [...this.terrain.entries()].sort((a,b)=>depth(b[0].split(",").map(Number))-depth(a[0].split(",").map(Number)))){const [x,y]=k.split(",").map(Number),top=[iso(x,y,height),iso(x+1,y,height),iso(x+1,y+1,height),iso(x,y+1,height)];if(inside(point,top)){this.setDestination([x+.5,y+.5]);return}}
    const u=(point[0]-OX)/TX,v=(point[1]-OY)/TY,[x,y]=turnPoint([(v+u)/2,(v-u)/2],-cameraTurns),target=[Math.max(.5,Math.min(11.5,x)),Math.max(.5,Math.min(11.5,y))];if(x>=0&&x<=12&&y>=0&&y<=12&&this.architecture.cells.has(cellOf(target).join(","))){this.setDestination(target);this.notice="Tap another spot to change course";this.sync()}}
  update(dt){this.time+=dt;this.walking=false;if(!this.destination||!this.route.length)return;const w=this.route[0],dx=w[0]-this.x,dy=w[1]-this.y,d=Math.hypot(dx,dy),step=Math.min(d,3.5*dt);if(d>.001){this.facing=[dx/d,dy/d];this.x+=this.facing[0]*step;this.y+=this.facing[1]*step;this.stride+=step*5;this.walking=true}this.z+=(w[2]-this.z)*(d>.001?Math.min(1,step/d):1);if(d>3.5*dt+.001)return;[this.x,this.y,this.z]=w;this.route.shift();if(this.route.length)return;const action=this.pending;this.destination=this.pending=null;this.travel(action)}
  travel(action){if(this.generation===5&&(action==="back"||Number.isInteger(action))){void saveG5Move(this,action);return}if(action==="back"){const index=this.path.pop();this.rooms.pop();this.frames.pop();this.load(index)}else if(Number.isInteger(action)){const exit=this.doors[action];this.frames.push(arrivalFrom(exit,this.room));this.path.push(action);this.rooms.push([...exit.target]);this.load()}}
}

function drawDoor(g,d){const points=portalPolygon(d),outer=portalPolygon(d,1,1.45),colour=blend(g.accent,TEXT,.32);polygon(outer,blend(INK,g.accent,.6));polygon(points,blend(INK,g.accent,.06),colour,2);const top=[(points[2][0]+points[3][0])/2,(points[2][1]+points[3][1])/2],rune=iso(...d.approach,d.level);ctx.beginPath();ctx.arc(...rune,10+Math.round(3*Math.sin(g.time*3+d.index)),0,Math.PI*2);ctx.strokeStyle=css(colour);ctx.lineWidth=2;ctx.stroke();const label=d.index===-1?(g.path.length?"RETURN":"ENTRANCE"):`${d.index.toString(16).toUpperCase()}  P${sum(d.target)}`;ctx.fillStyle=css(TEXT);ctx.font="600 18px ui-monospace,monospace";ctx.textAlign="center";ctx.fillText(label,top[0],Math.min(...outer.map(p=>p[1]))-12)}
function drawCrate(g,cell,height){if(g.generation>=4){drawRotatedCrate(g,cell,height);return}const [x,y]=cell,seed=stableSeed("crate-grain-v2",diamondRows(g.room,g.previous),cell),wood=[112+Number(seed%25n),76+Number(seed%17n),43+Number(seed%11n)],top=[iso(x,y,height),iso(x+1,y,height),iso(x+1,y+1,height),iso(x,y+1,height)],faces=[[[iso(x+1,y),iso(x+1,y+1),top[2],top[1]],.65],[[iso(x,y+1),iso(x+1,y+1),top[2],top[3]],.85]];for(const [face,shade] of faces){polygon(face,blend(INK,wood,shade),[38,31,27],2);line(face[0],face[2],blend(wood,TEXT,.15),2);line(face[1],face[3],blend(wood,TEXT,.15),2)}polygon(top,wood,blend(wood,TEXT,.25));for(const t of [.25,.5,.75])line(iso(x+t,y,height),iso(x+t,y+1,height),blend(INK,wood,.7))}
function drawCharacter(g){let [px,py]=iso(g.x,g.y,g.z);ctx.fillStyle="#0c1219";ctx.beginPath();ctx.ellipse(px,py,20,8,0,0,Math.PI*2);ctx.fill();const gait=g.walking?Math.sin(g.stride):0;py-=Math.round(Math.abs(gait)*2);const facingVector=turnVector(g.facing,cameraTurns),facing=facingVector[0]-facingVector[1]>=0?1:-1,back=sum(facingVector)<0;ctx.lineCap="round";for(const sign of[-1,1]){const foot=Math.round(py-3+gait*sign*5);line([px+sign*7,py-24],[px+sign*8,foot-4],[38,39,48],7);ctx.fillStyle="#482f25";ctx.beginPath();ctx.ellipse(px+sign*8+1,foot-2,7,4,0,0,Math.PI*2);ctx.fill()}polygon([[px-13,py-48],[px+12,py-48],[px+19+Math.round(gait*2),py-17],[px-19,py-15]],[21,30,42]);polygon([[px-10,py-46],[px+9,py-45],[px+13,py-22],[px-12,py-20]],[42,91,102]);ctx.fillStyle="#162430";ctx.beginPath();ctx.arc(px,py-53,15,0,Math.PI*2);ctx.fill();if(!back){ctx.fillStyle="#daaA7c";ctx.beginPath();ctx.ellipse(px+facing*2,py-51,8.5,8.5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#161b22";ctx.beginPath();ctx.arc(px+facing*5,py-52,2,0,Math.PI*2);ctx.fill()}line([px-10,py-40],[px+10,py-38],[213,164,78],4);const lx=px+facing*22,ly=py-26+Math.round(gait*2);line([px+facing*11,py-39],[lx,ly-5],[49,79,86],6);ctx.fillStyle="#4a3628";ctx.fillRect(lx-6,ly,12,15);ctx.fillStyle="#ffd477";ctx.fillRect(lx-3,ly+3,6,9);ctx.lineCap="butt"}
function drawClassicRoom(a){const floor=[iso(0,0),iso(12,0),iso(12,12),iso(0,12)],walls=[[[iso(0,0),iso(12,0),iso(12,0,WALL_HEIGHT),iso(0,0,WALL_HEIGHT)],.3],[[iso(0,0),iso(0,12),iso(0,12,WALL_HEIGHT),iso(0,0,WALL_HEIGHT)],.22]];for(const[w,s]of walls)polygon(w,blend(INK,a,s),blend(INK,a,.55),2);for(const z of[1.5,3,4.5]){line(iso(0,0,z),iso(12,0,z),blend(INK,a,.38));line(iso(0,0,z),iso(0,12,z),blend(INK,a,.3))}polygon(floor,blend(INK,a,.38));for(let n=0;n<=12;n++){line(iso(n,0),iso(n,12),blend(INK,a,.48));line(iso(0,n),iso(12,n),blend(INK,a,.48))}line(iso(12,0),iso(12,12),blend(INK,a,.6),2);line(iso(0,12),iso(12,12),blend(INK,a,.6),2)}
function drawShapedRoom(g){const a=g.accent,cells=g.architecture.cells,has=(x,y)=>cells.has(`${x},${y}`),ordered=[...cells].map(k=>k.split(",").map(Number)).sort((p,q)=>sum(p)-sum(q));for(const[x,y]of ordered){polygon([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],blend(INK,a,.38),blend(INK,a,.48));if(!has(x,y-1)){const face=[iso(x,y),iso(x+1,y),iso(x+1,y,WALL_HEIGHT),iso(x,y,WALL_HEIGHT)];polygon(face,blend(INK,a,.3),blend(INK,a,.55));for(const z of[1.5,3,4.5])line(iso(x,y,z),iso(x+1,y,z),blend(INK,a,.38))}if(!has(x-1,y)){const face=[iso(x,y),iso(x,y+1),iso(x,y+1,WALL_HEIGHT),iso(x,y,WALL_HEIGHT)];polygon(face,blend(INK,a,.22),blend(INK,a,.5));for(const z of[1.5,3,4.5])line(iso(x,y,z),iso(x,y+1,z),blend(INK,a,.3))}if(!has(x+1,y))line(iso(x+1,y),iso(x+1,y+1),blend(INK,a,.68),2);if(!has(x,y+1))line(iso(x,y+1),iso(x+1,y+1),blend(INK,a,.68),2)}}
function drawRotatedCrate(g,cell,height){
  const [x,y]=cell,seed=stableSeed("crate-grain-v2",diamondRows(g.room,g.previous),cell),wood=[112+Number(seed%25n),76+Number(seed%17n),43+Number(seed%11n)];
  const corners=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  const center=depth([x+.5,y+.5]);
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4];
    if((depth(a)+depth(b))/2<=center)continue;
    const face=[iso(...a),iso(...b),iso(...b,height),iso(...a,height)];
    polygon(face,blend(INK,wood,i%2?.65:.85),[38,31,27],2);
    line(face[0],face[2],blend(wood,TEXT,.15),2);line(face[1],face[3],blend(wood,TEXT,.15),2);
  }
  polygon(corners.map(p=>iso(...p,height)),wood,blend(wood,TEXT,.25));
  for(const t of [.25,.5,.75])line(iso(x+t,y,height),iso(x+t,y+1,height),blend(INK,wood,.7));
}
function drawCutawayRoom(g){
  const a=g.accent;
  for(const cell of g.architecture.cells){
    const [x,y]=cell.split(",").map(Number);
    polygon([iso(x,y),iso(x+1,y),iso(x+1,y+1),iso(x,y+1)],blend(INK,a,.38),blend(INK,a,.48));
  }
  for(const wall of boundaryWalls(g.architecture.cells,cameraTurns)){
    const {a:p,b:q,height,shade}=wall;
    polygon([iso(...p),iso(...q),iso(...q,height),iso(...p,height)],blend(INK,a,shade),blend(INK,a,.55));
    if(height>1)for(const z of[1.5,3,4.5])line(iso(...p,z),iso(...q,z),blend(INK,a,.38));
    else line(iso(...p,height),iso(...q,height),blend(a,TEXT,.12),2);
  }
}

function render(g){const a=g.accent;ctx.fillStyle=css(blend(INK,a,.08));ctx.fillRect(0,0,W,H);if(g.generation>=4)drawCutawayRoom(g);else if(g.generation>=3)drawShapedRoom(g);else drawClassicRoom(a);if(g.destination){const marker=iso(...g.destination,terrainAt(g.terrain,cellOf(g.destination)));ctx.beginPath();ctx.ellipse(marker[0],marker[1],15,7,0,0,Math.PI*2);ctx.strokeStyle="#eec77e";ctx.lineWidth=2;ctx.stroke();for(const w of g.route){ctx.fillStyle=css(blend(INK,a,.8));ctx.beginPath();ctx.arc(...iso(...w),2,0,Math.PI*2);ctx.fill()}}const actors=[...g.doors,...[g.entrance]].map(d=>[depth(d.approach),"door",d]);for(const[k,height]of g.terrain){const cell=k.split(",").map(Number);actors.push([depth([cell[0]+.5,cell[1]+.5]),"crate",[cell,height]])}actors.push([depth([g.x,g.y])+.01,"player",null]);actors.sort((x,y)=>x[0]-y[0]||x[1].localeCompare(y[1]));for(const[,kind,item]of actors){if(kind==="door")drawDoor(g,item);else if(kind==="crate")drawCrate(g,...item);else drawCharacter(g)}}

function validGeneration(value,fallback=4){const generation=Number(value);return generation===12?2:[1,2,3,4].includes(generation)?generation:fallback}
function initialState(){try{const match=location.hash.match(/(?:^#|&)path=([^&]+)/),gen=location.hash.match(/(?:^#|&)g=(\d+)/);if(gen?.[1]==='5')return{path:[],generation:5};if(match)return{path:decodePath(decodeURIComponent(match[1])),generation:validGeneration(gen?.[1],gen?4:1)};const saved=JSON.parse(localStorage.getItem("prime-labyrinth-browser-v2")||"null");if(Array.isArray(saved?.path))return{path:saved.path,generation:validGeneration(saved.generation)};const legacy=JSON.parse(localStorage.getItem("prime-labyrinth-browser-v1")||"null");if(Array.isArray(legacy?.path))return{path:legacy.path,generation:1};return{path:[],generation:4}}catch{return{path:[],generation:4}}}
const initial=initialState();let game;try{game=new Game(initial.path,initial.generation)}catch(error){console.warn(error);game=new Game();status.textContent="That path was invalid; a new journey has begun."}
function fit(){const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);canvas.style.aspectRatio=`${W}/${H}`;const sw=innerWidth,sh=innerHeight,scale=Math.min(sw/W,sh/H);canvas.style.width=`${W*scale}px`;canvas.style.height=`${H*scale}px`;canvas.style.left=`${(sw-W*scale)/2}px`;canvas.style.top=`${(sh-H*scale)/2}px`}
addEventListener("resize",fit);fit();canvas.addEventListener("pointerdown",e=>{const r=canvas.getBoundingClientRect();game.click([(e.clientX-r.left)*W/r.width,(e.clientY-r.top)*H/r.height])});
document.querySelector("#back").onclick=()=>{if(game.path.length)game.setDestination(game.entrance.approach,"back")};
document.querySelector("#share").onclick=async()=>{const url=new URL(location.href);url.search='';url.hash=`g=${game.geometryGeneration}&path=${encodePath(game.path)}`;try{await navigator.clipboard.writeText(url.href);game.notice=game.generation===5?"G4 geometry link copied. Sign in to resume your private G5 journey.":"Path link copied — this exact visit can be shared"}catch{prompt("Copy this path link",url.href);game.notice="Path link ready to copy"}game.sync()};
const generationToggle=document.querySelector("#generation-toggle"),generationMenu=document.querySelector("#generation-menu");
generationToggle.onclick=event=>{event.stopPropagation();generationMenu.hidden=!generationMenu.hidden};
for(const button of generationMenu.querySelectorAll("[data-generation]"))button.onclick=()=>{if(g5Busy)return;generationMenu.hidden=true;if(button.dataset.generation==='5'){openJourney();return}localStorage.removeItem("prime-labyrinth-browser-v1");localStorage.removeItem("prime-labyrinth-browser-v2");game=new Game([],Number(button.dataset.generation))};
document.addEventListener("pointerdown",event=>{if(!event.target.closest(".generation-picker"))generationMenu.hidden=true});
function rotateCamera(delta){if(game.generation<4)return;cameraTurns=(cameraTurns+delta+4)%4;game.notice="View rotated · tap a door or floor to walk";game.sync()}
document.querySelector("#rotate-left").onclick=()=>rotateCamera(-1);
document.querySelector("#rotate-right").onclick=()=>rotateCamera(1);
document.querySelector("#full").onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();

const journeyDialog=document.querySelector('#journey-dialog'),journeyMessage=document.querySelector('#journey-message');
function getJourneyClient(){
  if(!G5_API_URL)throw new Error('G5 backend is not configured yet. G1–G4 still work normally.');
  if(!journeyClient)journeyClient=new JourneyClient(G5_API_URL);
  return journeyClient;
}
function openJourney(){
  journeyDialog.showModal();
  journeyMessage.textContent=journeyClient?.snapshot?`Saved revision ${journeyClient.snapshot.revision} · ${journeyClient.snapshot.historyCount} historical visits. Retry / resume refreshes from the server.`:'Connect to create or resume your G5 traveller. The URL path cannot overwrite a saved journey.';
  showExploration(journeyClient?.snapshot);
}
function showExploration(snapshot){
  const totals=snapshot?.exploration,discovery=snapshot?.sharedDiscovery;
  document.querySelector('#shared-exploration').textContent=totals
    ?`Shared G5 exploration at last sync: ${totals.totalLocations} path locations · ${totals.uniqueTriples} distinct prime triples.`
    :'Every connected G5 traveller contributes to the same shared exploration archive.';
  document.querySelector('#shared-discovery').textContent=discovery
    ?`${discovery.isFirstDiscoverer?'You first mapped this location.':`${discovery.discoverer?.displayName||'Another traveller'} first mapped this location.`} ${discovery.travellerCount} traveller(s) have reached this exact path. This is a mapped location, not an AI image.`
    :'';
}
function applyJourney(result,source=null,action=null){
  const oldPath=source?.path??[],snapshot=result.snapshot,newPath=decodePath(snapshot.activePath);
  game=new Game(newPath,5);
  // A confirmed retrace lands at the doorway just used, as in legacy G4.
  if(!result.conflict&&action==='back'&&oldPath.length===newPath.length+1&&encodePath(oldPath.slice(0,-1))===snapshot.activePath)game.load(oldPath.at(-1));
  game.notice=result.conflict?'Another session changed this journey, or the move was rejected. Loaded the saved route; no move was replayed.':`Saved · revision ${snapshot.revision} · ${snapshot.historyCount} historical visits`;
  game.sync();journeyMessage.textContent=game.notice;
  showExploration(snapshot);
}
async function connectJourney(){
  if(g5Busy)return;g5Busy=true;
  journeyMessage.textContent='Connecting to the saved journey…';
  try{
    const client=getJourneyClient(),input=document.querySelector('#recovery-code'),token=input.value.trim();
    input.value='';applyJourney(await client.connect(token||null));journeyDialog.close();
  }catch(error){journeyMessage.textContent=`Not connected: ${error.message}. Your existing saved journey has not been reset.`;}
  finally{g5Busy=false;}
}
async function saveG5Move(source,action){
  if(g5Busy)return;g5Busy=true;source.notice='Saving this move…';source.sync();
  try{applyJourney(await getJourneyClient().move(action),source,action);}
  catch(error){source.notice=`Move not confirmed: ${error.message}. Open Saved journey → Connect / retry. G1–G4 remain available offline.`;source.sync();}
  finally{g5Busy=false;}
}
document.querySelector('#journey-manage').onclick=openJourney;
document.querySelector('#journey-connect').onclick=connectJourney;
document.querySelector('#journey-close').onclick=()=>journeyDialog.close();
journeyDialog.addEventListener('close',()=>{document.querySelector('#account-key-output').textContent='';document.querySelector('#account-key-notice').hidden=true;for(const field of journeyDialog.querySelectorAll('input[type=password]'))field.value='';});
document.querySelector('#journey-export').onclick=async()=>{
  try{
    const token=getJourneyClient().record?.token;
    if(journeyClient===accountClient?.journey)throw new Error('Use Account settings to create a recovery key. Session tokens are not recovery codes.');
    if(!token)throw new Error('Connect first');
    try{await navigator.clipboard.writeText(token);journeyMessage.textContent='Private recovery code copied. Store it securely; do not share it in a public path link.';}
    catch{prompt('PRIVATE traveller recovery code — treat like a password',token);}
  }catch(error){journeyMessage.textContent=error.message;}
};
function getAccountClient(){
  if(!G5_API_URL)throw new Error('Accounts are not enabled yet. G1–G4 remain available.');
  if(!accountClient)accountClient=new AccountClient(G5_API_URL);
  return accountClient;
}
function accountIdentity(profile){
  document.querySelector('#account-identity').textContent=profile?`${profile.displayName} · Public traveller ID: ${profile.publicId}`:'Sign in on any device to resume the same traveller.';
  if(profile){document.querySelector('#account-public-id').value=profile.publicId;document.querySelector('#account-name').value=profile.displayName;document.querySelector('#account-username').value=profile.username||'';}
  else{
    for(const id of ['account-public-id','account-name','account-username'])document.querySelector(`#${id}`).value='';
    document.querySelector('#account-key-output').textContent='';document.querySelector('#account-key-notice').hidden=true;
  }
}
async function accountAction(action){
  if(g5Busy)return;g5Busy=true;journeyMessage.textContent='Working…';
  try{
    const client=getAccountClient(),result=await action(client);
    if(result?.journey){journeyClient=client.journey;applyJourney(result.journey);accountIdentity(result.profile);}
    else if(result?.publicId){accountIdentity(result);journeyMessage.textContent='Display name saved.';}
    else if(result===null){journeyClient=null;accountIdentity(null);game=new Game([],4);journeyMessage.textContent='Signed out. Your discoveries remain in the shared archive.';}
    if(result?.recoveryKey){document.querySelector('#account-key-output').textContent=result.recoveryKey;document.querySelector('#account-key-notice').hidden=false;document.querySelector('#account-key-output').closest('details').open=true;journeyMessage.textContent='Connected. Save the private recovery key shown below before closing.';}
  }catch(error){journeyMessage.textContent=`Account: ${error.message.replaceAll('_',' ')}. Your saved journey has not been reset.`;}
  finally{for(const field of journeyDialog.querySelectorAll('input[type=password]'))field.value='';g5Busy=false;}
}
const inputValue=id=>document.querySelector(`#${id}`).value;
document.querySelector('#account-form').onsubmit=event=>{event.preventDefault();void accountAction(c=>c.login(inputValue('account-username'),inputValue('account-password')))};
document.querySelector('#account-signup').onclick=()=>accountAction(c=>c.signup(inputValue('account-username'),inputValue('account-password'),inputValue('account-name'),null,inputValue('account-invitation').trim()));
document.querySelector('#account-upgrade').onclick=()=>accountAction(c=>{const legacy=getJourneyClient();if(!legacy.record?.registered||legacy===c.journey)throw new Error('Connect your earlier traveller first.');if(legacy.record.pending)throw new Error('Retry your pending move before upgrading your traveller.');return c.signup(inputValue('account-username'),inputValue('account-password'),inputValue('account-name'),legacy.record.token)});
document.querySelector('#account-resume').onclick=()=>accountAction(c=>c.resume());
document.querySelector('#account-logout').onclick=()=>accountAction(async c=>{await c.logout();return null});
document.querySelector('#account-rename').onclick=()=>accountAction(c=>c.name(inputValue('account-name')));
document.querySelector('#account-password-save').onclick=()=>accountAction(c=>c.changePassword(inputValue('account-password'),inputValue('account-username'),inputValue('account-new-password')));
document.querySelector('#account-key').onclick=()=>accountAction(c=>c.recoveryKey());
document.querySelector('#account-recover').onclick=()=>accountAction(c=>c.recover(inputValue('account-public-id'),inputValue('account-recovery'),inputValue('account-username'),inputValue('account-new-password')));
document.querySelector('#account-delete').onclick=()=>accountAction(async c=>{await c.anonymise(inputValue('account-delete-confirmation'));return null});
for(const [id,mode] of [['account-google','login'],['account-link','link'],['account-google-upgrade','migrate']])document.querySelector(`#${id}`).onclick=()=>accountAction(async c=>{
  if(journeyClient?.record?.pending)throw new Error('Retry your pending move first.');
  const invitation=mode==='login'?(inputValue('account-invitation').trim()||undefined):undefined;
  const url=await c.startGoogle(mode,inputValue('account-name'),mode==='migrate'?getJourneyClient().record?.token:null,invitation);
  document.querySelector('#account-invitation').value='';
  location.assign(url);
});
const oauthParams=new URLSearchParams(location.search),hasOAuth=oauthParams.has('state')&&(oauthParams.has('code')||oauthParams.has('error'));
if(hasOAuth){
  // Remove authorization data before any share action or further navigation.
  history.replaceState(null,'',location.pathname+location.hash);openJourney();
  void accountAction(c=>c.completeGoogle(oauthParams));
}else if(initial.generation===5){
  openJourney();
  if(G5_API_URL){
    try{const snapshot=getJourneyClient().snapshot;if(snapshot){applyJourney({snapshot,conflict:false});game.notice='Last confirmed saved room · reconnecting…';game.sync();}}
    catch(error){journeyMessage.textContent=error.message;}
    if(getAccountClient().session)void accountAction(c=>c.resume());
    else journeyMessage.textContent='Sign in or use an earlier recovery code to resume your saved journey.';
  }
}
// Keep simulation timing independent from painting. Some mobile browsers reduce
// requestAnimationFrame while their navigation chrome is moving; walking still
// completes correctly and the next paint catches up.
setInterval(()=>game.update(1/40),25);
function frame(){render(game);requestAnimationFrame(frame)}requestAnimationFrame(frame);
addEventListener("error",event=>{status.textContent=`Browser error: ${event.message}`;console.error(event.error||event.message)});
