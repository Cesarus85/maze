import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { ARButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/ARButton.js';

let renderer, scene, camera;
let xrHitSource = null, viewerSpace = null;
let reticle, placed = false, mazeRoot = null;
let refSpaceType = 'local-floor';

const statusEl = document.getElementById('status');
const resetBtn = document.getElementById('resetBtn');

init();
animate();

function init() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 30);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;

  // Falls 'local-floor' nicht geht (Emulator), auf 'local' zurückfallen
  try { renderer.xr.setReferenceSpaceType(refSpaceType); }
  catch { renderer.xr.setReferenceSpaceType('local'); }

  document.body.appendChild(renderer.domElement);

  // Licht
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.0));

  // Reticle
  const ringGeo = new THREE.RingGeometry(0.09, 0.1, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff99, side: THREE.DoubleSide });
  reticle = new THREE.Mesh(ringGeo, ringMat);
  reticle.rotation.x = -Math.PI / 2;
  reticle.matrixAutoUpdate = false;
  reticle.visible = false;
  scene.add(reticle);

  // Controller (wenn vorhanden)
  const controller = renderer.xr.getController(0);
  controller.addEventListener('select', tryPlaceFromInput);
  scene.add(controller);

  // Zusätzlich: Screen-Tap & Session-Select unterstützen
  renderer.domElement.addEventListener('pointerdown', (e) => {
    // nur in AR-Session sinnvoll
    if (renderer.xr.isPresenting) tryPlaceFromInput();
  });

  // AR-Button & Session-Setup
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

  setStatus('Schau auf den Boden und tippe, um das 3×3 m Feld zu platzieren.');
  resetBtn.hidden = true;
}

function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

async function onSessionStart() {
  const session = renderer.xr.getSession();

  // Auch Session-Select-Events hören (für Touch/Hand)
  session.addEventListener('select', tryPlaceFromInput);

  // Reference-Space mit Fallback
  try {
    await session.requestReferenceSpace('local-floor');
    refSpaceType = 'local-floor';
  } catch {
    refSpaceType = 'local';
  }

  // Hit-Test Quelle einrichten
  try {
    viewerSpace = await session.requestReferenceSpace('viewer');
    xrHitSource = await session.requestHitTestSource({ space: viewerSpace });
    setStatus('Bewege das Reticle auf eine ebene Fläche und tippe zum Platzieren.');
  } catch (e) {
    console.error('Hit-test setup failed:', e);
    setStatus('Hit-Test nicht verfügbar. Beende AR und versuche es erneut.');
  }

  placed = false;
  resetBtn.hidden = true;

  session.addEventListener('end', () => {
    xrHitSource = null;
    viewerSpace = null;
  });
}

function onSessionEnd() {
  setStatus('AR beendet.');
  resetBtn.hidden = true;
  placed = false;
  if (mazeRoot) {
    scene.remove(mazeRoot);
    mazeRoot = null;
  }
  reticle.visible = false;
}

function tryPlaceFromInput() {
  if (!renderer.xr.isPresenting) return;
  if (placed) return;
  if (!reticle.visible) {
    // Kein gültiger Hit – Nutzerhinweis
    setStatus('Keine geeignete Fläche erkannt. Bewege das Gerät, bis das Reticle erscheint.');
    return;
  }
  placeMazeAtReticle();
}

function placeMazeAtReticle() {
  // Root an Reticle-Pose
  mazeRoot = new THREE.Group();
  mazeRoot.matrix.copy(reticle.matrix);
  mazeRoot.matrix.decompose(mazeRoot.position, mazeRoot.quaternion, mazeRoot.scale);
  scene.add(mazeRoot);

  // 3×3 m Grid + Rahmen (Demo)
  const size = 3.0;
  const gridDivs = 15;

  const grid = new THREE.GridHelper(size, gridDivs);
  grid.rotation.x = Math.PI / 2;
  grid.position.y = 0.001;
  mazeRoot.add(grid);

  const frameGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(size, size, 1, 1));
  const frameMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const frame = new THREE.LineSegments(frameGeo, frameMat);
  frame.rotation.x = -Math.PI / 2;
  frame.position.y = 0.002;
  mazeRoot.add(frame);

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
  resetBtn.hidden = false;
  setStatus('Platziert! (Schritt 1). Nächster Schritt: Maze aus API laden & bauen.');
}

function resetPlacement() {
  if (mazeRoot) scene.remove(mazeRoot);
  mazeRoot = null;
  placed = false;
  setStatus('Schau auf den Boden und tippe, um das 3×3 m Feld zu platzieren.');
  resetBtn.hidden = true;
}

function animate() { renderer.setAnimationLoop(render); }

function render(_, frame) {
  if (frame && !placed && xrHitSource) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(xrHitSource);
    if (hits.length > 0) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
      // leichtes „Atmen“, damit sichtbar ist, dass es aktiv ist
      const s = 1.0 + 0.03 * Math.sin(performance.now() * 0.004);
      reticle.scale.set(s, s, s);
      setStatus('Tippe/Trigger, um hier zu platzieren.');
    } else {
      reticle.visible = false;
      setStatus('Bewege dich/Headset leicht, um eine Fläche zu finden…');
    }
  }
  renderer.render(scene, camera);
}
