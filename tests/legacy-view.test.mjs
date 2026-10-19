import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../engine.js';
import * as view from '../view.js';

test('all four views invert floor taps and complete a full turn',()=>{
  for(const point of [[0,0],[12,12],[.5,6.5],[3.125,9.75]]){
    for(let turn=0;turn<4;turn++)assert.deepEqual(view.turnPoint(view.turnPoint(point,turn),-turn),point);
    assert.deepEqual(view.turnPoint(point,4),point);
  }
});

test('the reported cross has no tall internal walls in any view',()=>{
  const state=engine.replay([0],4),room=state.rooms.at(-1),previous=state.rooms[0],entrance=state.frames.at(-1);
  const a=engine.roomArchitecture(room,previous,[0],4,entrance);
  assert.equal(a.shape,'cross');
  assert.deepEqual(a,engine.roomArchitecture(room,previous,[0],3,entrance));
  assert.deepEqual(state,engine.replay([0],3));
  for(let turn=0;turn<4;turn++){
    const walls=view.boundaryWalls(a.cells,turn);
    assert.ok(walls.some(w=>w.height<1));assert.ok(walls.some(w=>w.height>4));
    for(const wall of walls.filter(w=>w.height>1)){
      const p=view.turnPoint(wall.a,turn),q=view.turnPoint(wall.b,turn);
      assert.ok((p[0]===0&&q[0]===0)||(p[1]===0&&q[1]===0));
    }
  }
});

// Run the actual app handlers with a small DOM/canvas stub. No browser driver
// is needed to test tap coordinates, ongoing movement and doorway transitions.
function appHarness(api=''){
  const noop=()=>{},context=new Proxy({}, {get:(o,k)=>o[k]??noop}),elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},getContext:()=>context,addEventListener:noop,querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800})});return elements.get(id)};
  const saved=new Map();
  const sandbox={...engine,...view,G5_API_URL:api,console,URL,document:{querySelector:element,body:{dataset:{}},addEventListener:noop},localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},history:{replaceState:noop},location:{hash:'#g=4&path=0'},devicePixelRatio:1,innerWidth:1280,innerHeight:800,addEventListener:noop,setInterval:noop,requestAnimationFrame:noop};
  sandbox.URLSearchParams=URLSearchParams;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),sandbox);
  return code=>vm.runInContext(code,sandbox);
}

test('rotated taps travel through each cross exit and back to the same doorway',()=>{
  const run=appHarness();
  for(let turn=0;turn<4;turn++)for(let exit=0;exit<2;exit++){
    run(`game=new Game([0],4);rotateCamera(${turn});render(game);`);
    assert.equal(run('cameraTurns'),turn);
    run(`game.click(iso(6.5,6.5));for(let i=0;i<300;i++)game.update(1/40);`);
    assert.equal(run('game.x'),6.5);assert.equal(run('game.y'),6.5);
    run(`game.click(iso(...game.doors[${exit}].approach,game.doors[${exit}].level));for(let i=0;i<400;i++)game.update(1/40);render(game);`);
    assert.equal(run('encodePath(game.path)'),`0${exit}`);
    run(`game.click(iso(...game.entrance.approach,game.entrance.level));for(let i=0;i<400;i++)game.update(1/40);render(game);`);
    assert.equal(run('encodePath(game.path)'),'0');
    assert.equal(run('JSON.stringify([game.x,game.y])'),run(`JSON.stringify(game.doors[${exit}].approach)`));
  }
});

test('rotating during a walk preserves its destination and older editions cannot rotate',()=>{
  const run=appHarness();
  run('game.click(iso(6.5,6.5));game.update(.1);rotateCamera(1);for(let i=0;i<300;i++)game.update(1/40);');
  assert.equal(run('game.x'),6.5);assert.equal(run('game.y'),6.5);
  for(const gen of [1,2,3]){run(`game=new Game([0],${gen});rotateCamera(1);render(game);`);assert.equal(run('cameraTurns'),0)}
});

test('G5 retains G4 geometry and cannot overwrite the legacy save slot',()=>{
  const run=appHarness();
  const legacy=run('localStorage.getItem("prime-labyrinth-browser-v2")');
  for(const path of [[],[0],[0,0],[0,0,1,0,1,0]]){
    run(`game=new Game(${JSON.stringify(path)},4);`);
    const old=run('JSON.stringify({doors:game.doors,cells:[...game.architecture.cells]})');
    const save=run('localStorage.getItem("prime-labyrinth-browser-v2")');
    run(`game=new Game(${JSON.stringify(path)},5);render(game);`);
    assert.equal(run('JSON.stringify({doors:game.doors,cells:[...game.architecture.cells]})'),old);
    assert.equal(run('localStorage.getItem("prime-labyrinth-browser-v2")'),save);
  }
  assert.ok(legacy);
});

test('G5 UI waits for confirmation, restores doorway on return, and keeps path on failure',async()=>{
  const run=appHarness('http://api');
  run('game=new Game([],5);journeyClient={move:async()=>({snapshot:{activePath:"0",revision:1,historyCount:2},conflict:false})};');
  await run('saveG5Move(game,0)');
  assert.equal(run('encodePath(game.path)'),'0');
  assert.equal(run('JSON.stringify([game.x,game.y])'),run('JSON.stringify(game.entrance.approach)'));
  run('journeyClient={move:async()=>({snapshot:{activePath:"ROOT",revision:2,historyCount:2},conflict:false})};');
  await run('saveG5Move(game,"back")');
  assert.equal(run('encodePath(game.path)'),'ROOT');
  assert.equal(run('JSON.stringify([game.x,game.y])'),run('JSON.stringify(game.doors[0].approach)'));
  run('journeyClient={move:async()=>{throw new Error("offline")}};');
  await run('saveG5Move(game,0)');
  assert.equal(run('encodePath(game.path)'),'ROOT');
  assert.match(run('game.notice'),/not confirmed.*offline/);
  assert.equal(run('g5Busy'),false);
});

test('G5 displays shared counts separately from private history and distinguishes attribution',()=>{
  const run=appHarness('http://api');
  run('applyJourney({snapshot:{activePath:"0",revision:1,historyCount:2,exploration:{totalLocations:100,uniqueTriples:40},sharedDiscovery:{isFirstDiscoverer:true,travellerCount:3}},conflict:false});');
  assert.match(run('game.notice'),/2 historical visits/);
  assert.match(run('document.querySelector("#shared-exploration").textContent'),/100 path locations.*40 distinct prime triples/);
  assert.match(run('document.querySelector("#shared-discovery").textContent'),/You first mapped.*3 traveller/);
  run('showExploration({sharedDiscovery:{isFirstDiscoverer:false,travellerCount:4}})');
  assert.match(run('document.querySelector("#shared-discovery").textContent'),/Another traveller first mapped/);
  run('showExploration(null)');
  assert.equal(run('document.querySelector("#shared-discovery").textContent'),'');
});
