import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from './dist/engine.js';
import * as view from './dist/view.js';

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
function appHarness(){
  const noop=()=>{},context=new Proxy({}, {get:(o,k)=>o[k]??noop}),elements=new Map();
  const element=id=>{if(!elements.has(id))elements.set(id,{hidden:true,style:{},dataset:{},getContext:()=>context,addEventListener:noop,querySelectorAll:()=>[],getBoundingClientRect:()=>({left:0,top:0,width:1280,height:800})});return elements.get(id)};
  const sandbox={...engine,...view,console,URL,document:{querySelector:element,body:{dataset:{}},addEventListener:noop},localStorage:{getItem:()=>null,setItem:noop,removeItem:noop},history:{replaceState:noop},location:{hash:'#g=4&path=0'},devicePixelRatio:1,innerWidth:1280,innerHeight:800,addEventListener:noop,setInterval:noop,requestAnimationFrame:noop};
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('./dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,''),sandbox);
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
