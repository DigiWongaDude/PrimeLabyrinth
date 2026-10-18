import test from "node:test";
import assert from "node:assert/strict";
import {accentFor,doorPattern,encodePath,decodePath,makeDoors,makeTerrain,replay,targets,visitSeed,walkRoute} from "./dist/engine.js";

const fixtures=[
  {path:[],room:[2,2,3],previous:null,accent:[202,230,122],targets:[[3,3,5]],entrance:["SOUTH",6.5,0],doors:[[0,"NORTH",6.5,0,[3,3,5]]]},
  {path:[0],room:[3,3,5],previous:[2,2,3],accent:[122,193,230],targets:[[3,3,7],[3,5,5]],entrance:["SOUTH",6.5,0],doors:[[0,"NORTH",6.5,0,[3,3,7]],[1,"WEST",6.5,0,[3,5,5]]]},
  {path:[0,0],room:[3,3,7],previous:[3,3,5],accent:[122,230,158],targets:[[3,3,11],[5,5,7]],entrance:["SOUTH",6.5,0],doors:[[0,"NORTH",6.5,1.5,[3,3,11]],[1,"WEST",6.5,.75,[5,5,7]]]},
  {path:[0,0,1],room:[5,5,7],previous:[3,3,7],accent:[122,140,230],targets:[[3,5,11],[5,7,7]],entrance:["EAST",6.5,.75],doors:[[0,"WEST",6.5,.75,[3,5,11]],[1,"SOUTH",6.5,0,[5,7,7]]]},
  {path:[0,0,1,0,1,0],room:[5,7,17],previous:[5,5,13],accent:[227,230,122],targets:[[3,11,17],[5,7,19],[7,7,17],[7,11,13]],entrance:["NORTH",6.5,1.5],doors:[[0,"SOUTH",4.5,.75,[3,11,17]],[1,"EAST",6.5,0,[5,7,19]],[2,"WEST",6.5,0,[7,7,17]],[3,"SOUTH",8.5,.75,[7,11,13]]]},
];

for(const fixture of fixtures)test(`Python parity at ${encodePath(fixture.path)}`,()=>{
  const {rooms,frames}=replay(fixture.path),room=rooms.at(-1),previous=rooms.length>1?rooms.at(-2):null,entrance=frames.at(-1),doors=makeDoors(room,entrance,previous);
  assert.deepEqual(room,fixture.room); assert.deepEqual(previous,fixture.previous);
  assert.deepEqual(accentFor(room,previous),fixture.accent); assert.deepEqual(targets(room),fixture.targets);
  assert.deepEqual([entrance.wall,entrance.position,entrance.level],fixture.entrance);
  assert.deepEqual(doors.map(d=>[d.index,d.wall,d.position,d.level,d.target]),fixture.doors);
  const terrain=makeTerrain([...doors,entrance]);
  for(const door of doors) assert.ok(walkRoute(entrance.approach,door.approach,terrain),`door ${door.index} is reachable`);
});

test("path IDs survive links",()=>{for(const path of [[],[0,1,2,15],[16,26,1]])assert.deepEqual(decodePath(encodePath(path)),path)});
test("invalid transitions are rejected",()=>assert.throws(()=>replay([1]),/does not exist/));
test("generation 1 retains the original OLR distribution",()=>assert.deepEqual(doorPattern([5,7,17],[5,5,13],[0,0,1,0,1,0],0,1),[0,1,2]));
test("the complete path contributes to the versioned visit identity",()=>{
  const room=[5,7,17],previous=[5,5,13];
  assert.notEqual(visitSeed(room,previous,[0,0,1,0,1,0]),visitSeed(room,previous,[0,1,0,0,1,0]));
});
