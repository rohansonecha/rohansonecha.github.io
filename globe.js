import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { locations } from './locations.js';
import * as lightbox from './lightbox.js';

const COASTLINE_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_coastline.geojson';
const BORDERS_URL =
  'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@master/geojson/ne_110m_admin_0_boundary_lines_land.geojson';

const canvas = document.getElementById('globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 2.6);

const MIN_Z = 1.05;
const MAX_Z = 5;

const RADIUS = 1;
const globe = new THREE.Group();
globe.scale.setScalar(0.875);
scene.add(globe);

const sphere = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS * 0.99, 96, 96),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
);
globe.add(sphere);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
keyLight.position.set(2, 3, 4);
scene.add(keyLight);

const pmremGen = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGen.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGen.dispose();

function latLngToVec3(lat, lng, radius) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function arcPoints(a, b, radius, steps = 6) {
  const v1 = latLngToVec3(a[1], a[0], radius);
  const v2 = latLngToVec3(b[1], b[0], radius);
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push(new THREE.Vector3().lerpVectors(v1, v2, t).normalize().multiplyScalar(radius));
  }
  return out;
}

async function loadLineFeatures(url, color, radiusOffset) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed for ${url}: ${res.status}`);
  const geo = await res.json();

  const material = new THREE.LineBasicMaterial({ color });
  const lineRadius = RADIUS * radiusOffset;

  for (const feature of geo.features) {
    const g = feature.geometry;
    if (!g) continue;
    const segments = g.type === 'MultiLineString' ? g.coordinates : [g.coordinates];
    for (const seg of segments) {
      const points = [];
      for (let i = 0; i < seg.length - 1; i++) {
        const arc = arcPoints(seg[i], seg[i + 1], lineRadius);
        if (i === 0) points.push(...arc);
        else points.push(...arc.slice(1));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      globe.add(new THREE.Line(geometry, material));
    }
  }
}

loadLineFeatures(COASTLINE_URL, 0x000000, 1.001).catch((err) => console.error(err));
loadLineFeatures(BORDERS_URL, 0x000000, 1.001).catch((err) => console.error(err));

const pinObjects = [];
const pinGroups = [];
const HEAD_RADIUS = 0.009;
const STEM_RADIUS = 0.0015;
const STEM_HEIGHT = 0.021;
const stemGeometry = new THREE.CylinderGeometry(STEM_RADIUS, STEM_RADIUS, STEM_HEIGHT, 12);
const headGeometry = new THREE.SphereGeometry(HEAD_RADIUS, 24, 24);
const upY = new THREE.Vector3(0, 1, 0);

function placePin(lat, lng, headMat, stemMat, location) {
  const surfacePoint = latLngToVec3(lat, lng, RADIUS);
  const group = new THREE.Group();
  group.position.copy(surfacePoint);
  group.quaternion.setFromUnitVectors(upY, surfacePoint.clone().normalize());

  const stem = new THREE.Mesh(stemGeometry, stemMat);
  stem.position.y = STEM_HEIGHT / 2;
  group.add(stem);

  const head = new THREE.Mesh(headGeometry, headMat);
  head.position.y = STEM_HEIGHT + HEAD_RADIUS * 0.85;
  group.add(head);

  if (location) {
    stem.userData.location = location;
    head.userData.location = location;
    pinObjects.push(stem, head);
    pinGroups.push(group);
  }
  globe.add(group);
}

const headMaterial = new THREE.MeshPhongMaterial({ color: 0xff1f1f, specular: 0xffffff, shininess: 80 });
const stemMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1.0, roughness: 0.08 });

for (const loc of locations) {
  placePin(loc.lat, loc.lng, headMaterial, stemMaterial, loc);
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

globe.quaternion.setFromEuler(new THREE.Euler(0.35, -0.6, 0));

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function setRayFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
}

function pointerOnSphere(clientX, clientY) {
  setRayFromClient(clientX, clientY);
  return raycaster.intersectObject(sphere).length > 0;
}

function pinAtClient(clientX, clientY) {
  setRayFromClient(clientX, clientY);
  const hits = raycaster.intersectObjects([sphere, ...pinObjects]);
  if (!hits.length) return null;
  return pinObjects.includes(hits[0].object) ? hits[0].object : null;
}

// Direction (from globe center) of the sphere point under a screen position, or null.
function sphereHitDir(clientX, clientY) {
  setRayFromClient(clientX, clientY);
  const hits = raycaster.intersectObject(sphere);
  return hits.length ? hits[0].point.clone().normalize() : null;
}

// Zoom by `factor`, keeping the geography under (clientX, clientY) pinned on screen —
// the area you pinch on stays put and spreads apart, like a map.
function zoomAt(clientX, clientY, factor) {
  const newZ = THREE.MathUtils.clamp(camera.position.z * factor, MIN_Z, MAX_Z);
  if (newZ === camera.position.z) return;
  const before = sphereHitDir(clientX, clientY);
  camera.position.z = newZ;
  camera.updateMatrixWorld();
  if (!before) return;
  const after = sphereHitDir(clientX, clientY);
  if (after) {
    globe.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(before, after));
  }
}

let dragging = false;
let didDrag = false;
let pointerStart = null;
let prevX = 0;
let prevY = 0;
let velX = 0;
let velY = 0;

const activePointers = new Map();
let pinching = false;
let pinchPrevDist = 0;
let pinchPrevAngle = 0;

function pinchDistance() {
  const pts = [...activePointers.values()];
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function pinchMidpoint() {
  const pts = [...activePointers.values()];
  return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
}

function pinchAngle() {
  const pts = [...activePointers.values()];
  return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
}

const ROTATE_SPEED = 0.005;
// Camera-to-surface distance at the default zoom (2.6). Drag/scroll rotation is
// scaled relative to this so the surface tracks the cursor at the same on-screen
// rate at any zoom — otherwise a fixed angle whips the view around when zoomed in.
const REF_SURFACE_DIST = 2.6 - RADIUS * globe.scale.x;

// How much pins grow as you zoom in: 0 = constant on-screen size, 1 = glued to the globe.
const PIN_ZOOM_GROWTH = 0.25;

function applyRotation(dx, dy) {
  const surfaceDist = Math.max(camera.position.z - RADIUS * globe.scale.x, 0.05);
  const speed = ROTATE_SPEED * (surfaceDist / REF_SURFACE_DIST);
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * speed);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * speed);
  globe.quaternion.premultiply(qYaw).premultiply(qPitch);
}

// Roll: spin the globe around the view axis (straight out of the screen), like turning
// a wheel — the third rotation axis alongside drag-yaw and drag-pitch.
function applyRoll(angle) {
  globe.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle));
}

const DRAG_THRESHOLD = 5;

function hoverCursor(clientX, clientY) {
  if (pinAtClient(clientX, clientY)) return 'pointer';
  if (pointerOnSphere(clientX, clientY)) return 'grab';
  return 'default';
}

canvas.addEventListener('pointerdown', (e) => {
  if (!pointerOnSphere(e.clientX, e.clientY) && !pinAtClient(e.clientX, e.clientY)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size >= 2) {
    pinching = true;
    dragging = false;
    pointerStart = null;
    velX = 0;
    velY = 0;
    pinchPrevDist = pinchDistance();
    pinchPrevAngle = pinchAngle();
    canvas.style.cursor = 'default';
    return;
  }

  dragging = true;
  didDrag = false;
  pointerStart = { x: e.clientX, y: e.clientY };
  prevX = e.clientX;
  prevY = e.clientY;
  velX = 0;
  velY = 0;
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = 'grabbing';
});

canvas.addEventListener('pointermove', (e) => {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (pinching && activePointers.size >= 2) {
    const d = pinchDistance();
    const ang = pinchAngle();
    if (pinchPrevDist > 0 && d > 0) {
      const mid = pinchMidpoint();
      zoomAt(mid.x, mid.y, pinchPrevDist / d);
    }
    let dAng = ang - pinchPrevAngle;
    if (dAng > Math.PI) dAng -= 2 * Math.PI;
    else if (dAng < -Math.PI) dAng += 2 * Math.PI;
    applyRoll(-dAng);
    pinchPrevDist = d;
    pinchPrevAngle = ang;
    return;
  }

  if (dragging) {
    if (pointerStart && Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > DRAG_THRESHOLD) {
      didDrag = true;
    }
    const dx = e.clientX - prevX;
    const dy = e.clientY - prevY;
    prevX = e.clientX;
    prevY = e.clientY;
    velX = dx;
    velY = dy;
    applyRotation(dx, dy);
    return;
  }
  canvas.style.cursor = hoverCursor(e.clientX, e.clientY);
});

function endDrag(e) {
  if (e) {
    activePointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  }

  if (pinching) {
    if (activePointers.size < 2) {
      pinching = false;
      pinchPrevDist = 0;
      // Don't fall through into a single-finger drag; require a fresh tap.
      dragging = false;
      pointerStart = null;
      canvas.style.cursor = e ? hoverCursor(e.clientX, e.clientY) : 'default';
    }
    return;
  }

  if (!dragging) return;
  dragging = false;
  if (e && !didDrag) {
    const pin = pinAtClient(e.clientX, e.clientY);
    if (pin) lightbox.open(pin.userData.location);
  }
  pointerStart = null;
  canvas.style.cursor = e ? hoverCursor(e.clientX, e.clientY) : 'default';
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', endDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) {
      // Trackpad pinch (and ctrl+scroll) arrive as wheel events — zoom the globe
      // toward the cursor instead of letting the browser page-zoom.
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY * 0.01));
      return;
    }
    if (!pointerOnSphere(e.clientX, e.clientY)) return;
    e.preventDefault();
    if (e.shiftKey) {
      // Shift + scroll rolls the globe (the cross-browser fallback for the twist).
      applyRoll((e.deltaX || e.deltaY) * 0.0015);
      return;
    }
    applyRotation(-e.deltaX, -e.deltaY);
  },
  { passive: false },
);

// Safari reports the trackpad two-finger twist as GestureEvents (Chrome/Firefox fire
// nothing for it — they use Shift+scroll above). Read only the rotation here; zoom
// still flows through the ctrl+wheel path so the two gestures don't fight.
let gesturePrevRotation = 0;
canvas.addEventListener('gesturestart', (e) => {
  e.preventDefault();
  gesturePrevRotation = e.rotation;
});
canvas.addEventListener('gesturechange', (e) => {
  e.preventDefault();
  applyRoll((-(e.rotation - gesturePrevRotation) * Math.PI) / 180);
  gesturePrevRotation = e.rotation;
});
canvas.addEventListener('gestureend', (e) => e.preventDefault());

function tick() {
  // Pins hold a constant on-screen size when zoomed out, then grow modestly once you
  // zoom past the default — enough to read each marker without fully re-clustering them.
  const cs = Math.max(camera.position.z - RADIUS * globe.scale.x, 0.01) / REF_SURFACE_DIST;
  const pinScale = THREE.MathUtils.clamp(cs < 1 ? Math.pow(cs, 1 - PIN_ZOOM_GROWTH) : cs, 0.05, 3);
  for (const g of pinGroups) g.scale.setScalar(pinScale);

  if (!dragging) {
    velX *= 0.94;
    velY *= 0.94;
    if (Math.abs(velX) > 0.02 || Math.abs(velY) > 0.02) {
      applyRotation(velX, velY);
    }
  }
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
