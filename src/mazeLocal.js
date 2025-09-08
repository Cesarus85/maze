// Simple recursive backtracker perfect-maze generator -> JSON compatible with our format
export function generateMazeLocally(cols, rows, cellSizeMeters) {
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
    cells.push({ c, r, visited:false, walls:{N:true,E:true,S:true,W:true} });

  const idx = (c,r)=> r*cols + c;
  const stack = [];
  let current = cells[0];
  current.visited = true;
  const rnd = (n)=> Math.floor(Math.random()*n);

  function neighbors(cel) {
    const list = [];
    const {c, r} = cel;
    if (r>0) list.push(['N', cells[idx(c, r-1)]]);
    if (c<cols-1) list.push(['E', cells[idx(c+1, r)]]);
    if (r<rows-1) list.push(['S', cells[idx(c, r+1)]]);
    if (c>0) list.push(['W', cells[idx(c-1, r)]]);
    return list.filter(([_, n]) => !n.visited);
  }

  do {
    const nbs = neighbors(current);
    if (nbs.length) {
      const [dir, next] = nbs[rnd(nbs.length)];
      // knock down walls both sides
      current.walls[dir] = false;
      const rev = {N:'S',S:'N',E:'W',W:'E'}[dir];
      next.walls[rev] = false;
      stack.push(current);
      next.visited = true;
      current = next;
    } else {
      current = stack.pop();
    }
  } while (current);

  // export format (strip visited)
  const outCells = cells.map(({c,r,walls})=>({c,r,walls}));
  return {
    cellCols: cols,
    cellRows: rows,
    cellSizeMeters,
    start: { c:0, r:0 },
    end: { c:cols-1, r:rows-1 },
    cells: outCells
  };
}

// Build Three.js walls and goal
export function buildMazeThree(sceneGroup, maze, opts) {
  const { wallHeight=1.2, wallThickness=0.05 } = opts||{};
  const { cellCols, cellRows, cellSizeMeters } = maze;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x335577, metalness: 0.1, roughness: 0.8 });
  const walls = new THREE.Group();
  walls.name = 'Walls';
  sceneGroup.add(walls);

  const w = cellCols * cellSizeMeters;
  const h = cellRows * cellSizeMeters;

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0x224, transparent:true, opacity:0.35, side: THREE.DoubleSide })
  );
  floor.rotateX(-Math.PI/2);
  floor.receiveShadow = true;
  floor.name = 'MazeFloor';
  sceneGroup.add(floor);

  // Per-cell walls (N & W to avoid duplicates, plus outer border)
  const wt = wallThickness, ch = wallHeight, cs = cellSizeMeters;

  const wallGeoH = new THREE.BoxGeometry(cs, ch, wt); // horizontal segment (along X)
  const wallGeoV = new THREE.BoxGeometry(wt, ch, cs); // vertical segment (along Z)

  function addWallH(x, z) {
    const m = new THREE.Mesh(wallGeoH, wallMat);
    m.position.set(x, ch/2, z);
    m.castShadow = true;
    walls.add(m);
  }
  function addWallV(x, z) {
    const m = new THREE.Mesh(wallGeoV, wallMat);
    m.position.set(x, ch/2, z);
    m.castShadow = true;
    walls.add(m);
  }

  // Outer border
  addWallH( w/2 - cs/2, -h/2, );            // North border split into segments below in loop
  addWallH( w/2 - cs/2,  h/2, );
  addWallV(-w/2, h/2 - cs/2);
  addWallV( w/2, h/2 - cs/2);

  // Iterate cells
  for (let r=0; r<cellRows; r++) {
    for (let c=0; c<cellCols; c++) {
      const cell = maze.cells[r*cellCols+c];
      const cx = -w/2 + c*cs + cs/2;
      const cz = -h/2 + r*cs + cs/2;
      if (cell.walls.N) addWallH(cx, cz - cs/2);
      if (cell.walls.W) addWallV(cx - cs/2, cz);
      // East walls: add for last column
      if (c===cellCols-1 && cell.walls.E) addWallV(cx + cs/2, cz);
      // South walls: add for last row
      if (r===cellRows-1 && cell.walls.S) addWallH(cx, cz + cs/2);
    }
  }

  // Goal sphere at end cell
  const end = maze.end;
  const gx = -w/2 + end.c*cs + cs/2;
  const gz = -h/2 + end.r*cs + cs/2;
  const goal = new THREE.Mesh(
    new THREE.SphereGeometry(Math.min(0.12, cs*0.35), 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xdd2233, emissive: 0x550000 })
  );
  goal.position.set(gx, 0.15, gz);
  goal.castShadow = true;
  goal.name = 'GoalSphere';
  sceneGroup.add(goal);
  return goal;
}
