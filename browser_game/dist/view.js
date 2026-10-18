// Camera transforms never alter room coordinates, door IDs or path identity.
export function turnPoint([x,y],turns=0,size=12){
  for(let i=0;i<((turns%4)+4)%4;i++)[x,y]=[size-y,x];
  return [x,y];
}
export function turnVector([x,y],turns=0){return turnPoint([x,y],turns,0)}
export function viewDepth(point,turns=0){const [x,y]=turnPoint(point,turns);return x+y}

// Only the outside rear edges can remain tall without hiding another arm.
// Re-entrant and front edges become low cutaway sills in every camera view.
export function boundaryWalls(cells,turns=0){
  const walls=[];
  for(const cell of cells){
    const [x,y]=cell.split(',').map(Number);
    const edges=[[[x,y],[x+1,y],[x,y-1]],[[x+1,y],[x+1,y+1],[x+1,y]],[[x+1,y+1],[x,y+1],[x,y+1]],[[x,y+1],[x,y],[x-1,y]]];
    for(const [a,b,neighbor] of edges){
      if(cells.has(neighbor.join(',')))continue;
      const av=turnPoint(a,turns),bv=turnPoint(b,turns);
      const rear=(av[0]===0&&bv[0]===0)||(av[1]===0&&bv[1]===0);
      walls.push({a,b,height:rear?4.6:.18,shade:av[0]===bv[0]?.22:.3});
    }
  }
  return walls;
}
