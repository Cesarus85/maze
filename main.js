import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';

let renderer, scene, camera, refSpaceType = 'local-floor';
let xrHitSource = null, viewerSpace = null;
let reticle, placed = false, mazeRoot = null;
const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 30);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  // Emulator-Fix: fallback auf 'local', wenn 'local-floor' nicht unterstützt wird
  try { renderer.xr.setReferenceSpaceType(refSpaceType); }
  catch { renderer.xr.setReferenceSpaceType('local'); }

  document.body.appendChild(renderer.domElement);

  // Licht
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  // Reticle (Ring)
  const ringGeo = new THREE.RingGeometry(0.09, 0.1, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff99, side: THREE.DoubleSide });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.rotation.x = -Math.PI / 2;
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller für „select“ (Trigger)
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

  // ARButton mit Hit-Test
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

  // Fallback-RefSpace sicherstellen
  try { await session.requestReferenceSpace('local-floor'); }
  catch { refSpaceType = 'local'; }

  viewerSpace = await session.requestReferenceSpace('viewer');
  const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  xrHitSource = hitTestSource;

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
  if (mazeRoot) {
    scene.remove(mazeRoot);
    mazeRoot = null;
  }
}

function onSelect() {
  if (!reticle.visible) return;
  if (placed) return;

  // Maze-Root an Reticle-Pose
  mazeRoot = new THREE.Group();
  mazeRoot.matrix.copy(reticle.matrix);
  mazeRoot.matrix.decompose(mazeRoot.position, mazeRoot.quaternion, mazeRoot.scale);
  scene.add(mazeRoot);

  // 3×3 m Rahmen + Grid (nur visuell, noch kein echtes Maze)
  const size = 3.0;
  const gridDivs = 15;
  const grid = new THREE.GridHelper(size, gridDivs);
  grid.rotation.x = Math.PI / 2;      // GridHelper liegt standardmäßig in XZ; unser Root ist bereits am Boden ausgerichtet
  grid.position.y = 0.001;
  mazeRoot.add(grid);

  // Rahmen (dünne Linien)
  const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size, 1, 1));
  const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const frame = new THREE.LineSegments(frameGeo, frameMat);
  frame.rotation.x = -Math.PI / 2;
  frame.position.y = 0.002;
  mazeRoot.add(frame);

  // ROTE ZIELKUGEL (Dummy) – vorerst hinten rechts
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0x440000 })
  );
  ball.position.set(+size/2 - 0.15, 0.08, +size/2 - 0.15); // Ecke
  // kleine Stütze, damit klar ist "am Boden"
  const peg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x770000 })
  );
  peg.position.copy(ball.position).setY(0.04);
  mazeRoot.add(ball, peg);

  placed = true;
  statusEl.textContent = 'Platziert! (Schritt 1). Nächster Schritt: Maze-Daten & Backend.';
  resetBtn.hidden = false;
}

function resetPlacement() {
  if (mazeRoot) scene.remove(mazeRoot);
  mazeRoot = null;
  placed = false;
  statusEl.textContent = 'Tippe erneut, um das 3×3 m Feld zu platzieren.';
  resetBtn.hidden = true;
}

function animate() {
  renderer.setAnimationLoop(render);
}

function render(_, frame) {
  if (frame && !placed && xrHitSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hitTestResults = frame.getHitTestResults(xrHitSource);
    if (hitTestResults.length > 0) {
      const pose = hitTestResults[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
}
