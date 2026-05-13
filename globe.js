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

const MIN_Z = 1.3;
const MAX_Z = 5;

function zoomCamera(factor) {
  camera.position.z = THREE.MathUtils.clamp(camera.position.z * factor, MIN_Z, MAX_Z);
}

document.getElementById('zoom-in')?.addEventListener('click', () => zoomCamera(1 / 1.25));
document.getElementById('zoom-out')?.addEventListener('click', () => zoomCamera(1.25));

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
const HEAD_RADIUS = 0.0165;
const STEM_RADIUS = 0.0026;
const STEM_HEIGHT = 0.0375;
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

let dragging = false;
let didDrag = false;
let pointerStart = null;
let prevX = 0;
let prevY = 0;
let velX = 0;
let velY = 0;

const activePointers = new Map();
let pinching = false;
let pinchStartDist = 0;
let pinchStartZ = 0;

function pinchDistance() {
  const pts = [...activePointers.values()];
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

function applyRotation(dx, dy) {
  const speed = 0.005;
  const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), dx * speed);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), dy * speed);
  globe.quaternion.premultiply(qYaw).premultiply(qPitch);
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
    pinchStartDist = pinchDistance();
    pinchStartZ = camera.position.z;
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
    if (pinchStartDist > 0 && d > 0) {
      camera.position.z = THREE.MathUtils.clamp(pinchStartZ * (pinchStartDist / d), MIN_Z, MAX_Z);
    }
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
      pinchStartDist = 0;
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
    if (e.ctrlKey) return;
    if (!pointerOnSphere(e.clientX, e.clientY)) return;
    e.preventDefault();
    applyRotation(-e.deltaX, -e.deltaY);
  },
  { passive: false },
);

function tick() {
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
