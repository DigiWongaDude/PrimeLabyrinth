import './style.css';
import {
  ACESFilmicToneMapping,
  Clock,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { buildScene } from './scene';

const mount = document.getElementById('app');

const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

if (mount) {
  mount.appendChild(renderer.domElement);
}

const camera = new PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 320);

const { scene, doors, pulsingMaterials, cameraStopZ, corridorHeight, lookTarget } = buildScene(camera);

const clock = new Clock();
const viewTarget = new Vector3().copy(lookTarget);

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', resize);

const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.innerHTML = `<strong>Prime Labyrinth</strong>Neon approach. Camera fly-through; doors stay sealed.`;
document.body.appendChild(overlay);

function updateCamera(delta: number) {
  const remaining = cameraStopZ - camera.position.z;
  const maxSpeed = 14;
  const slowDistance = 16;

  if (remaining > 0.01) {
    const t = Math.min(1, remaining / slowDistance);
    const eased = t * t * (3 - 2 * t);
    const speed = Math.max(0.6, eased * maxSpeed);
    camera.position.z += Math.min(speed * delta, remaining);
  }

  viewTarget.set(0, corridorHeight * 0.45, camera.position.z + 28);
  camera.lookAt(viewTarget);
}

function animate() {
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  updateCamera(delta);

  doors.forEach((door) => door.update(elapsed));

  pulsingMaterials.forEach((material, index) => {
    const pulse = 1.35 + Math.sin(elapsed * 1.2 + index * 1.2) * 0.35;
    material.emissiveIntensity = pulse;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
