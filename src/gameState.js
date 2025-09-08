export const gameState = {
  placed: false,
  running: false,
  timeLeft: 20.0,
  intervalId: null,
  group: null,           // THREE.Group of the maze root
  reticle: null,         // THREE.Mesh ring
  goalSphere: null,      // THREE.Mesh red ball
  referenceSpace: null,  // XRReferenceSpace
  hitTestSource: null,   // XRHitTestSource
  cellCols: 10,
  cellRows: 10,
  cellSize: 0.3,         // meters
  wallHeight: 1.2,       // meters
  wallThickness: 0.05,   // meters
  seed: null,            // for reproducible mazes (later)
  positions: {           // live XR input positions
    rightGrip: new Float32Array(16) // mat4 placeholder
  }
};
