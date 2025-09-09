// main.js — Client-only Maze-Lader & -Renderer
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';

let renderer, scene, camera, refSpaceType = 'local-floor';
let xrHitSource = null, viewerSpace = null;
let reticle, placed = false, mazeRoot = null;
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');

init();
animate();

/* =========================
   BOOTSTRAP / AR SESSION
========================= */
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  try { renderer.xr.setReferenceSpaceType(refSpaceType); }
  catch { renderer.xr.setReferenceSpaceType('local'); }

  document.body.appendChild(renderer.domElement);

  // Licht
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  // Reticle als Gruppe (Pose auf Gruppe, Kind bleibt flach)
  reticle = new THREE.Group();
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  {
    const ringGeo = new THREE.RingGeometry(0.09, 0.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff99, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; // flach
    reticle.add(ring);
  }
  scene.add(reticle);

  // Controller
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // AR-Button
  const sessionInit = {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['local-floor', 'anchors', 'dom-overlay'],
    domOverlay: { root: document.body }
  };
  const arBtn = ARButton.createButton(renderer, sessionInit);
  document.body.appendChild(arBtn);

  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);

  window.addEventListener('resize', onWindowResize);
  resetBtn.addEventListener('click', () => resetPlacement());
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function onSessionStart() {
  statusEl.textContent = 'Bewege das Reticle auf eine ebene Fläche und tippe zum Platzieren.';
  const session = renderer.xr.getSession();
  try { await session.requestReferenceSpace('local-floor'); }
  catch { refSpaceType = 'local'; }

  viewerSpace = await session.requestReferenceSpace('viewer');
  xrHitSource = await session.requestHitTestSource({ space: viewerSpace });

  session.addEventListener('end', () => {
    xrHitSource = null;
    viewerSpace = null;
  });

  resetBtn.hidden = true;
  placed = false;
}

function onSessionEnd() {
  statusEl.textContent = 'AR beendet.';
  resetBtn.hidden = true;
  placed = false;
  if (mazeRoot) { scene.remove(mazeRoot); mazeRoot = null; }
}

/* =========================
   INTERACTION
========================= */
async function onSelect() {
  if (!reticle.visible || placed) return;

  // Root an Reticle-Pose
  mazeRoot = new THREE.Group();
  mazeRoot.matrix.copy(reticle.matrix);
  mazeRoot.matrix.decompose(mazeRoot.position, mazeRoot.quaternion, mazeRoot.scale);
  scene.add(mazeRoot);

  statusEl.textContent = 'Lade Maze von /maze/api/maze …';

  // Maze laden & bauen
  try {
    const params = new URLSearchParams({
      size: '15',           // fürs Erste fix (Schwierigkeitsgrade später)
      difficulty: 'medium',
      seed: Date.now().toString(36)
    });
    const res = await fetch(`/maze/api/maze?${params.toString()}`, { cache: 'no-store' });
    const data = await res.json();

    const maze = validateMazeJSON(data);
    buildMaze(mazeRoot, maze);

    placed = true;
    statusEl.textContent = 'Maze platziert! (Client-only).';
    resetBtn.hidden = false;
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Fehler beim Laden/Bauen des Maze.';
  }
}

function resetPlacement() {
  if (mazeRoot) scene.remove(mazeRoot);
  mazeRoot = null;
  placed = false;
  statusEl.textContent = 'Tippe erneut, um das 3×3 m Feld zu platzieren.';
  resetBtn.hidden = true;
}

/* =========================
   RENDER LOOP
========================= */
function animate() {
  renderer.setAnimationLoop(render);
}

function render(_, frame) {
  if (frame && !placed && xrHitSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(xrHitSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
}

/* =========================
   MAZE: VALIDATION & BUILD
========================= */
function validateMazeJSON(json) {
  // Minimalprüfung + sanfte Defaults
  if (!json || typeof json !== 'object') throw new Error('Invalid JSON');
  const gridSize = clampInt(json.gridSize, 5, 101) ?? 15;
  const cells = Array.isArray(json.cells) ? json.cells : [];
  if (cells.length !== gridSize * gridSize) {
    throw new Error(`cells length mismatch: got ${cells.length}, expected ${gridSize * gridSize}`);
  }
  const start = Array.isArray(json.start) ? json.start : [0, 0];
  const goal  = Array.isArray(json.goal)  ? json.goal  : [gridSize - 1, gridSize - 1];

  const inBounds = ([x, y]) => Number.isInteger(x) && Number.isInteger(y) && x>=0 && y>=0 && x<gridSize && y<gridSize;
  if (!inBounds(start)) throw new Error('start out of bounds');
  if (!inBounds(goal))  throw new Error('goal out of bounds');

  // Normiere Cell-Flags
  for (const c of cells) {
    c.N = !!c.N; c.E = !!c.E; c.S = !!c.S; c.W = !!c.W;
  }
  return { gridSize, cells, start, goal, seed: json.seed || '' };
}

function clampInt(v, min, max) {
  if (typeof v !== 'number') return undefined;
  v = Math.round(v);
  return Math.max(min, Math.min(max, v));
}

/**
 * Baut das Maze:
 * - skaliert auf exakt 3.0 m Kantenlänge
 * - Wände als InstancedMesh (horizontal vs. vertikal)
 * - Zielkugel an goal
 */
function buildMaze(root, maze) {
  const { gridSize, cells, goal } = maze;
  const size = 3.0;
  const cell = 3.0 / gridSize;
  const wallH = 0.25;        // 25 cm Höhe
  const wallT = Math.min(0.06, cell * 0.18); // Dicke (schmal, skaliert mit Raster)

  // Hilfsfunktionen
  const idx = (x, y) => y * gridSize + x;
  const cellCenter = (x, y) => new THREE.Vector3(
    (x + 0.5 - gridSize / 2) * cell,
    0,
    (y + 0.5 - gridSize / 2) * cell
  );

  // Boden-Grid + Rahmen (optional, nur zur Orientierung)
  {
    const grid = new THREE.GridHelper(size, gridSize);
    grid.position.y = 0.001;
    root.add(grid);

    const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size, 1, 1));
    const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    const frame = new THREE.LineSegments(frameGeo, frameMat);
    frame.rotation.x = -Math.PI / 2;
    frame.position.y = 0.002;
    root.add(frame);
  }

  // Geometrien/Materialien für Instanzen
  const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0, roughness: 0.9 });

  // Horizontal: Breite=cell, Tiefe=wallT
  const hGeo = new THREE.BoxGeometry(cell, wallH, wallT);
  // Vertikal:   Breite=wallT, Höhe=wallH, Tiefe=cell
  const vGeo = new THREE.BoxGeometry(wallT, wallH, cell);

  const hMatrices = [];
  const vMatrices = [];

  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3(1,1,1);

  // Kanten-Existenz sauber bestimmen (konsolidiert):
  // Für die Nordkante einer Zelle gilt eine Wand, wenn cell.N ODER (Nachbar oben existiert UND neighbor.S)
  // Für die Westkante: cell.W ODER (Nachbar links existiert UND neighbor.E)
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      const c = cells[idx(x, y)];

      // NORTH edge (horizontal)
      const hasN = c.N || (y > 0 && cells[idx(x, y - 1)].S);
      if (hasN) {
        const center = cellCenter(x, y);
        tmpPos.set(center.x, wallH / 2, center.z - cell / 2);
        tmpMat.compose(tmpPos, tmpQuat.set(0, 0, 0, 1), tmpScale);
        hMatrices.push(tmpMat.clone());
      }

      // WEST edge (vertical)
      const hasW = c.W || (x > 0 && cells[idx(x - 1, y)].E);
      if (hasW) {
        const center = cellCenter(x, y);
        tmpPos.set(center.x - cell / 2, wallH / 2, center.z);
        tmpMat.compose(tmpPos, tmpQuat.set(0, 0, 0, 1), tmpScale);
        vMatrices.push(tmpMat.clone());
      }
    }
  }
  // Äußere OSTRAND (letzte Spalte, vertikal)
  for (let y = 0; y < gridSize; y++) {
    const c = cells[idx(gridSize - 1, y)];
    const hasE = c.E; // rechter Außenrand nur aus dieser Zelle lesen
    if (hasE) {
      const center = cellCenter(gridSize - 1, y);
      tmpPos.set(center.x + cell / 2, wallH / 2, center.z);
      tmpMat.compose(tmpPos, tmpQuat.set(0, 0, 0, 1), tmpScale);
      vMatrices.push(tmpMat.clone());
    }
  }
  // Äußere SÜDRAND (letzte Zeile, horizontal)
  for (let x = 0; x < gridSize; x++) {
    const c = cells[idx(x, gridSize - 1)];
    const hasS = c.S; // Unterer Außenrand nur aus dieser Zelle lesen
    if (hasS) {
      const center = cellCenter(x, gridSize - 1);
      tmpPos.set(center.x, wallH / 2, center.z + cell / 2);
      tmpMat.compose(tmpPos, tmpQuat.set(0, 0, 0, 1), tmpScale);
      hMatrices.push(tmpMat.clone());
    }
  }

  // InstancedMeshes anlegen
  if (hMatrices.length > 0) {
    const hInst = new THREE.InstancedMesh(hGeo, mat, hMatrices.length);
    hInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    hMatrices.forEach((m, i) => hInst.setMatrixAt(i, m));
    hInst.instanceMatrix.needsUpdate = true;
    root.add(hInst);
  }
  if (vMatrices.length > 0) {
    const vInst = new THREE.InstancedMesh(vGeo, mat, vMatrices.length);
    vInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    vMatrices.forEach((m, i) => vInst.setMatrixAt(i, m));
    vInst.instanceMatrix.needsUpdate = true;
    root.add(vInst);
  }

  // Zielkugel an goal
  {
    const goalMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0x440000 })
    );
    const peg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: 0x770000 })
    );

    const gPos = cellCenter(goal[0], goal[1]);
    goalMesh.position.set(gPos.x, 0.08, gPos.z);
    peg.position.set(gPos.x, 0.04, gPos.z);

    root.add(goalMesh, peg);
  }
}
