// main.js
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
  try { renderer.xr.setReferenceSpaceType(refSpaceType); }
  catch { renderer.xr.setReferenceSpaceType('local'); }

  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  // --- Reticle als Gruppe: Pose kommt auf die Gruppe, Ring ist flach als Kind ---
  reticle = new THREE.Group();
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  {
    const ringGeo = new THREE.RingGeometry(0.09, 0.1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff99, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    // Ring liegt standardmäßig in XY. Wir kippen ihn einmalig flach (XY -> XZ).
    ring.rotation.x = -Math.PI / 2;
    reticle.add(ring);
  }
  scene.add(reticle);

  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', onSelect);
  scene.add(controller);

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
  if (mazeRoot) {
    scene.remove(mazeRoot);
    mazeRoot = null;
  }
}

function onSelect() {
  if (!reticle.visible || placed) return;

  // Root auf Reticle-Pose
  mazeRoot = new THREE.Group();
  mazeRoot.matrix.copy(reticle.matrix);
  mazeRoot.matrix.decompose(mazeRoot.position, mazeRoot.quaternion, mazeRoot.scale);
  scene.add(mazeRoot);

  const size = 3.0;
  const gridDivs = 15;

  // GridHelper liegt bereits in XZ (flach) → KEINE Rotation mehr!
  const grid = new THREE.GridHelper(size, gridDivs);
  grid.position.y = 0.001;
  mazeRoot.add(grid);

  // Rahmen (flach)
  const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size, 1, 1));
  const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const frame = new THREE.LineSegments(frameGeo, frameMat);
  frame.rotation.x = -Math.PI / 2;   // Plane liegt in XY → einmalig kippen
  frame.position.y = 0.002;
  mazeRoot.add(frame);

  // Rote Zielkugel (Dummy)
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 24, 24),
    new THREE.MeshStandardMaterial({ color: 0xff0033, emissive: 0x440000 })
  );
  ball.position.set(+size/2 - 0.15, 0.08, +size/2 - 0.15);
  const peg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.08, 16),
    new THREE.MeshStandardMaterial({ color: 0x770000 })
  );
  peg.position.copy(ball.position).setY(0.04);
  mazeRoot.add(ball, peg);

  placed = true;
  statusEl.textContent = 'Platziert! (Schritt 1 gefixt). Nächster Schritt: Maze-JSON & Backend.';
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
    const hits = frame.getHitTestResults(xrHitSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      // Pose direkt auf die Gruppe schreiben → Kind (Ring) bleibt flach
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }
  renderer.render(scene, camera);
}
