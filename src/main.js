import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';
import { gameState as S } from './gameState.js';
import { generateMazeLocally, buildMazeThree } from './mazeLocal.js';
import { fetchMazeFromBackend } from './openaiClient.js';

let scene, camera, renderer, light;
let hitSpace = null;

const $ = (id)=> document.getElementById(id);
const ui = {
  btnPlace: $('btnPlace'),
  btnStart: $('btnStart'),
  btnReset: $('btnReset'),
  timer:   $('timer'),
  status:  $('status'),
  overlay: $('overlay'),
};

init();
function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera( 70, window.innerWidth/window.innerHeight, 0.01, 20 );

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio( window.devicePixelRatio );
  renderer.setSize( window.innerWidth, window.innerHeight );
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');
  document.getElementById('ar-root').appendChild( renderer.domElement );

  // Lighting
  light = new THREE.HemisphereLight(0xffffff, 0x222244, 1.0);
  scene.add(light);

  // Reticle
  S.reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.08, 0.10, 32).rotateX(-Math.PI/2),
    new THREE.MeshBasicMaterial({ color: 0x00ff88 })
  );
  S.reticle.matrixAutoUpdate = false;
  S.reticle.visible = false;
  scene.add(S.reticle);

  // AR Button with options
  const button = ARButton.createButton(renderer, {
    requiredFeatures: ['hit-test'],
    optionalFeatures: ['dom-overlay', 'anchors'],
    domOverlay: { root: ui.overlay }
  });
  document.body.appendChild(button);

  // UI handlers
  ui.btnPlace.addEventListener('click', onPlace);
  ui.btnStart.addEventListener('click', onStart);
  ui.btnReset.addEventListener('click', onReset);

  window.addEventListener('resize', onResize);

  renderer.setAnimationLoop(onXRFrame);
  renderer.xr.addEventListener('sessionstart', onSessionStart);
  renderer.xr.addEventListener('sessionend', onSessionEnd);
}

function onResize(){
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function onSessionStart() {
  const session = renderer.xr.getSession();

  // Reference spaces
  S.referenceSpace = await session.requestReferenceSpace('local-floor');
  const viewerSpace = await session.requestReferenceSpace('viewer');
  hitSpace = viewerSpace;

  // Hit test source
  const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  S.hitTestSource = hitTestSource;

  ui.status.textContent = 'Suche Boden…';
  ui.btnPlace.disabled = false;
}

function onSessionEnd() {
  S.hitTestSource = null;
  S.referenceSpace = null;
  S.placed = false;
  clearMaze();
  ui.btnStart.disabled = true;
  ui.btnReset.disabled = true;
  ui.status.textContent = 'Session beendet';
}

function onXRFrame( time, frame ) {
  if (!frame) return;
  const session = renderer.xr.getSession();
  const refSpace = S.referenceSpace || renderer.xr.getReferenceSpace();
  const pose = frame.getViewerPose(refSpace);

  // Hit test reticle
  if (S.hitTestSource && !S.placed) {
    const hits = frame.getHitTestResults(S.hitTestSource);
    if (hits.length > 0) {
      const hit = hits[0];
      const hitPose = hit.getPose(refSpace);
      S.reticle.visible = true;
      S.reticle.matrix.fromArray(hitPose.transform.matrix);
      ui.status.textContent = 'Fläche gefunden – platziere!';
    } else {
      S.reticle.visible = false;
      ui.status.textContent = 'Suche Boden…';
    }
  }

  // Check goal touch if running
  if (S.running && S.goalSphere) {
    const right = getRightGripPose(frame, refSpace);
    if (right) {
      const gp = new THREE.Vector3().setFromMatrixPosition(S.goalSphere.matrixWorld);
      const rp = new THREE.Vector3().setFromMatrixPosition(right);
      const dist = gp.distanceTo(rp);
      if (dist < 0.12) {
        onWin();
      }
    }
  }

  renderer.render(scene, camera);
}

function getRightGripPose(frame, refSpace) {
  const session = renderer.xr.getSession();
  for (const src of session.inputSources) {
    if (src && src.handedness === 'right' && src.gripSpace) {
      const pose = frame.getPose(src.gripSpace, refSpace);
      if (pose) {
        const m = new THREE.Matrix4();
        m.fromArray(pose.transform.matrix);
        return m;
      }
    }
  }
  return null;
}

async function onPlace() {
  if (S.placed || !S.reticle.visible) return;
  // Create root group at reticle pose
  const group = new THREE.Group();
  group.name = 'MazeRoot';
  group.matrixAutoUpdate = false;
  group.matrix.copy(S.reticle.matrix);
  group.updateMatrixWorld(true);
  scene.add(group);
  S.group = group;

  // Fetch maze (backend later), fallback local
  ui.status.textContent = 'Erzeuge Labyrinth…';
  const backendMaze = await fetchMazeFromBackend({
    cols: S.cellCols, rows: S.cellRows, cellSizeMeters: S.cellSize
  });
  const maze = backendMaze || generateMazeLocally(S.cellCols, S.cellRows, S.cellSize);

  // Center maze so that group origin is floor center
  const goal = buildMazeThree(group, maze, { wallHeight: S.wallHeight, wallThickness: S.wallThickness });
  S.goalSphere = goal;

  // Simple ambient directional light near camera
  const dir = new THREE.DirectionalLight(0xffffff, 0.4);
  dir.position.set(0.5, 1.2, 0.3);
  group.add(dir);

  S.placed = true;
  ui.btnStart.disabled = false;
  ui.btnReset.disabled = false;
  ui.status.textContent = 'Platziert – bereit zu starten';
}

function clearMaze() {
  if (S.group) {
    scene.remove(S.group);
    S.group.traverse(o=>{
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m=>m.dispose());
        else o.material.dispose();
      }
    });
    S.group = null;
  }
  S.goalSphere = null;
}

function onStart() {
  if (!S.placed || S.running) return;
  S.running = true;
  S.timeLeft = 20.0;
  ui.status.textContent = 'Lauf!';
  ui.btnStart.disabled = true;

  updateTimerUI();
  S.intervalId = setInterval(()=>{
    S.timeLeft = Math.max(0, S.timeLeft - 0.1);
    updateTimerUI();
    if (S.timeLeft <= 0) {
      onFail();
    }
  }, 100);
}

function onReset() {
  // Stop any run
  if (S.intervalId) clearInterval(S.intervalId);
  S.intervalId = null;
  S.running = false;
  ui.timer.textContent = '—';
  ui.status.textContent = 'Neu platzieren oder starten';
  ui.btnStart.disabled = !S.placed;
}

function onWin() {
  if (!S.running) return;
  S.running = false;
  if (S.intervalId) clearInterval(S.intervalId);
  ui.status.textContent = '🎉 Gewonnen!';
  ui.btnStart.disabled = false;
}

function onFail() {
  if (!S.running) return;
  S.running = false;
  if (S.intervalId) clearInterval(S.intervalId);
  ui.status.textContent = '⏱️ Zeit abgelaufen';
  ui.btnStart.disabled = false;
}

function updateTimerUI() {
  ui.timer.textContent = S.timeLeft.toFixed(1) + 's';
}
