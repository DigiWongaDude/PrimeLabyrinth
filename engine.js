export const START = [2, 2, 3];
export const ROOM_SIZE = 12;
export const STEP_HEIGHT = 0.375;
export const OPPOSITE = { NORTH: "SOUTH", SOUTH: "NORTH", WEST: "EAST", EAST: "WEST" };
export const RELATIVE_WALLS = {
  SOUTH: ["NORTH", "WEST", "EAST"], NORTH: ["SOUTH", "EAST", "WEST"],
  WEST: ["EAST", "NORTH", "SOUTH"], EAST: ["WEST", "SOUTH", "NORTH"],
};
export const INWARD = { NORTH: [0, 1], SOUTH: [0, -1], WEST: [1, 0], EAST: [-1, 0] };

function primesUpTo(limit) {
  const sieve = Array(limit + 1).fill(true); sieve[0] = sieve[1] = false;
  for (let p = 2; p * p <= limit; p++) if (sieve[p]) for (let n = p * p; n <= limit; n += p) sieve[n] = false;
  return sieve.flatMap((prime, n) => prime ? [n] : []);
}
export const PRIMES = primesUpTo(10000);
const PRIME_INDEX = new Map(PRIMES.map((p, i) => [p, i]));
const sum = values => values.reduce((a, b) => a + b, 0);
const key = (x, y) => `${x},${y}`;

function adjacent(prime) {
  const i = PRIME_INDEX.get(prime), result = [i === 0 ? prime : PRIMES[i - 1], prime];
  if (i + 1 < PRIMES.length) result.push(PRIMES[i + 1]);
  return result;
}

export function targets(room) {
  const i = PRIME_INDEX.get(sum(room));
  if (i === undefined || i + 1 >= PRIMES.length) return [];
  const wanted = PRIMES[i + 1], found = new Map();
  for (const a of adjacent(room[0])) for (const b of adjacent(room[1])) for (const c of adjacent(room[2])) {
    const candidate = [a, b, c].sort((x, y) => x - y);
    if (sum(candidate) === wanted) found.set(candidate.join(","), candidate);
  }
  return [...found.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
}

// Compact synchronous SHA-256, used only to reproduce Python's deterministic seeds.
function sha256(bytes) {
  const K = [1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  const H = [1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
  const data = [...bytes, 128], bitLength = bytes.length * 8;
  while (data.length % 64 !== 56) data.push(0);
  for (let i = 7; i >= 0; i--) data.push(Math.floor(bitLength / 2 ** (i * 8)) & 255);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < data.length; offset += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = ((data[offset+i*4]<<24)|(data[offset+i*4+1]<<16)|(data[offset+i*4+2]<<8)|data[offset+i*4+3]) >>> 0;
    for (let i = 16; i < 64; i++) { const a=w[i-15], b=w[i-2]; w[i]=(w[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+w[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10)))>>>0; }
    let [a,b,c,d,e,f,g,h]=H;
    for (let i=0;i<64;i++) { const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+w[i])>>>0; const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))>>>0; h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H;
}

export function stableSeed(...values) {
  const words = sha256(new TextEncoder().encode(JSON.stringify(values)));
  return (BigInt(words[0]) << 32n) | BigInt(words[1]);
}
export function halfDiamond([a,b,c]) { const diffs=[Math.abs(b-a),Math.abs(c-b)]; return [Math.abs(diffs[1]-diffs[0]),diffs,[a,b,c]]; }
export function diamondRows(room, previous=null) {
  const [apex,diffs,current]=halfDiamond(room), rows=[[apex],diffs,current];
  if (previous) { const [pa,pd,pr]=halfDiamond(previous); rows.push(pr,pd,[pa]); }
  return rows;
}
export function accentFor(room, previous=null) {
  const h=Number(stableSeed("prime-room-fundamentals",1,diamondRows(room,previous))%3600n)/3600;
  const i=Math.floor(h*6), f=h*6-i, v=.9, p=v*(1-.47), q=v*(1-f*.47), t=v*(1-(1-f)*.47);
  const rgb=[[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]; return rgb.map(x=>Math.round(x*255));
}

export function door(index, wall, position, level, target) { return { index, wall, position, level, target, get approach(){ return this.wall==="NORTH"?[this.position,.5]:this.wall==="SOUTH"?[this.position,11.5]:this.wall==="WEST"?[.5,this.position]:[11.5,this.position]; } }; }
export const rootEntrance = () => door(-1,"SOUTH",6.5,0,null);
export const arrivalFrom = (exit, previous) => door(-1,OPPOSITE[exit.wall],exit.position,exit.level,[...previous]);
const cellOf = p => p.map(v=>Math.max(0,Math.min(11,Math.trunc(v))));
export { cellOf };

export function makeTerrain(doors) {
  const heights=new Map();
  for (const d of doors) { const [x,y]=d.approach,[dx,dy]=INWARD[d.wall]; for(let step=0;step<Math.round(d.level/STEP_HEIGHT);step++){const k=key(Math.trunc(x+dx*step),Math.trunc(y+dy*step));heights.set(k,Math.max(heights.get(k)||0,d.level-step*STEP_HEIGHT));} }
  return heights;
}
function neighbours(cell, terrain) { const [x,y]=cell,h=terrain.get(key(x,y))||0; return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].filter(([a,b])=>a>=0&&a<12&&b>=0&&b<12&&Math.abs((terrain.get(key(a,b))||0)-h)<=STEP_HEIGHT+.001); }
function reachable(start,terrain){const first=cellOf(start), seen=new Set([key(...first)]),todo=[first];while(todo.length){for(const n of neighbours(todo.pop(),terrain)){const k=key(...n);if(!seen.has(k)){seen.add(k);todo.push(n);}}}return seen;}

export function makeDoors(room, entrance=rootEntrance(), previous=null) {
  const choices=targets(room), walls=RELATIVE_WALLS[entrance.wall], assignments=choices.map((_,i)=>walls[i%3]);
  const totals=Object.fromEntries(walls.map(w=>[w,assignments.filter(x=>x===w).length])), counts=Object.fromEntries(walls.map(w=>[w,0]));
  const result=choices.map((target,index)=>{const wall=assignments[index],rank=counts[wall]++;let position=Math.max(1.5,Math.min(10.5,Math.floor(ROOM_SIZE*(rank+1)/(totals[wall]+1))+.5));if(wall===walls[0]&&totals[wall]===1)position=entrance.position;const seed=stableSeed("wayfarer-levels-v2",diamondRows(room,previous),index);let level=sum(room)<=11?0:.75*Number(seed%3n);if(rank)level=Math.max(.75,level);return door(index,wall,position,level,target);});
  const raised=[...result].reverse().filter(d=>d.level);
  while(true){const terrain=makeTerrain([...result,entrance]),seen=reachable(entrance.approach,terrain);if(result.every(d=>seen.has(key(...cellOf(d.approach)))))break;if(!raised.length)throw Error("Cannot construct reachable room");raised.shift().level=0;}
  return result;
}

export function walkRoute(start, goal, terrain) {
  const first=cellOf(start),last=cellOf(goal),open=[first],cost=new Map([[key(...first),0]]),parent=new Map();
  while(open.length){open.sort((a,b)=>(cost.get(key(...a))+Math.abs(a[0]-last[0])+Math.abs(a[1]-last[1]))-(cost.get(key(...b))+Math.abs(b[0]-last[0])+Math.abs(b[1]-last[1])));const cur=open.shift(),ck=key(...cur);if(ck===key(...last)){const cells=[cur];let k=ck;while(k!==key(...first)){const p=parent.get(k);cells.push(p);k=key(...p);}cells.reverse();return [...cells.map(([x,y])=>[x+.5,y+.5,terrain.get(key(x,y))||0]),[...goal,terrain.get(key(...last))||0]];}for(const n of neighbours(cur,terrain)){const nk=key(...n),next=cost.get(ck)+1;if(next<(cost.get(nk)??Infinity)){cost.set(nk,next);parent.set(nk,cur);if(!open.some(x=>key(...x)===nk))open.push(n);}}}return null;
}

export function encodePath(path){return path.length?path.map(i=>i<16?i.toString(16).toUpperCase():`[${i.toString(16).toUpperCase()}]`).join(""):"ROOT";}
export function decodePath(code){if(!code||code.toUpperCase()==="ROOT")return[];const out=[];for(let i=0;i<code.length;){if(code[i]==="["){const end=code.indexOf("]",i);if(end<0)throw Error("Bad path");out.push(parseInt(code.slice(i+1,end),16));i=end+1;}else{const n=parseInt(code[i],16);if(Number.isNaN(n))throw Error("Bad path");out.push(n);i++;}}return out;}
export function replay(path){const rooms=[[...START]],frames=[rootEntrance()];for(const index of path){const current=rooms.at(-1),previous=rooms.length>1?rooms.at(-2):null,doors=makeDoors(current,frames.at(-1),previous);if(index<0||index>=doors.length)throw Error(`Door ${index} does not exist at P${sum(current)}`);frames.push(arrivalFrom(doors[index],current));rooms.push([...doors[index].target]);}return {rooms,frames};}
