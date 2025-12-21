import {
  AmbientLight,
  BoxGeometry,
  Color,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  Vector3,
} from 'three';
import { SlidingDoor, createHazardTexture } from './door';

export interface SceneContents {
  scene: Scene;
  doors: SlidingDoor[];
  pulsingMaterials: MeshStandardMaterial[];
  cameraStartZ: number;
  cameraStopZ: number;
  corridorHeight: number;
  lookTarget: Vector3;
}

export function buildScene(camera: PerspectiveCamera): SceneContents {
  const scene = new Scene();
  scene.background = new Color(0x04060b);
  scene.fog = new FogExp2(0x05060a, 0.022);

  const ambient = new AmbientLight(0x0f1624, 0.2);
  scene.add(ambient);

  const corridorWidth = 16;
  const corridorHeight = 8;
  const segmentDepth = 10;
  const segments = 14;
  const corridorLength = segmentDepth * segments;
  const startZ = -24;

  const steel = new MeshStandardMaterial({
    color: 0x0e1220,
    metalness: 0.85,
    roughness: 0.45,
  });

  const trim = new MeshStandardMaterial({
    color: 0x11192d,
    metalness: 0.65,
    roughness: 0.35,
  });

  const neonColors = [0x8a4fff, 0x35a6ff, 0xff5fd1];
  const pulsingMaterials = neonColors.map(
    (color) =>
      new MeshStandardMaterial({
        color,
        emissive: new Color(color),
        emissiveIntensity: 1.6,
        metalness: 0.35,
        roughness: 0.15,
      }),
  );

  const corridor = new Group();

  for (let i = 0; i < segments; i += 1) {
    const baseZ = i * segmentDepth;
    const wallDepth = segmentDepth;
    const wallZ = baseZ + wallDepth / 2;

    const leftWall = new Mesh(new BoxGeometry(0.6, corridorHeight, wallDepth), steel);
    leftWall.position.set(-corridorWidth / 2, corridorHeight / 2, wallZ);

    const rightWall = new Mesh(new BoxGeometry(0.6, corridorHeight, wallDepth), steel);
    rightWall.position.set(corridorWidth / 2, corridorHeight / 2, wallZ);

    const ceiling = new Mesh(new BoxGeometry(corridorWidth, 0.45, wallDepth), steel);
    ceiling.position.set(0, corridorHeight, wallZ);

    const baseTrim = new Mesh(new BoxGeometry(corridorWidth, 0.25, wallDepth), trim);
    baseTrim.position.set(0, 0.12, wallZ);

    corridor.add(leftWall, rightWall, ceiling, baseTrim);

    const stripeHeights = [1.4, 3.2, 5.0];
    stripeHeights.forEach((height, index) => {
      const neon = pulsingMaterials[index % pulsingMaterials.length];
      const leftStrip = new Mesh(new BoxGeometry(0.18, 0.22, wallDepth), neon);
      leftStrip.position.set(-corridorWidth / 2 + 0.38, height, wallZ);
      corridor.add(leftStrip);
      const rightStrip = leftStrip.clone();
      rightStrip.position.x = corridorWidth / 2 - 0.38;
      rightStrip.material = neon;
      corridor.add(rightStrip);
    });

    const ceilingStrip = new Mesh(new BoxGeometry(corridorWidth * 0.8, 0.1, wallDepth * 0.9), pulsingMaterials[(i + 1) % pulsingMaterials.length]);
    ceilingStrip.position.set(0, corridorHeight - 0.4, wallZ);
    corridor.add(ceilingStrip);

    const braceThickness = 0.2;
    const brace = new Mesh(new BoxGeometry(corridorWidth + 0.8, corridorHeight + 0.4, braceThickness), trim);
    brace.position.set(0, corridorHeight / 2, baseZ + 0.4);
    corridor.add(brace);
  }

  scene.add(corridor);

  const floor = new Mesh(
    new PlaneGeometry(corridorWidth, corridorLength + 22),
    new MeshStandardMaterial({
      color: 0x0b0f18,
      metalness: 0.88,
      roughness: 0.18,
      emissive: new Color(0x05070f),
      emissiveIntensity: 0.1,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = corridorLength / 2;
  scene.add(floor);

  const hazardTexture = createHazardTexture();
  const doors: SlidingDoor[] = [];
  const doorZ = corridorLength + 6;
  const doorDepth = 1.6;
  const doorHeight = 6;
  const doorWidth = 4.5;
  const stopZ = doorZ - 8;

  const endWall = new Mesh(new BoxGeometry(corridorWidth + 2, corridorHeight + 1, 1.4), trim);
  endWall.position.set(0, corridorHeight / 2, doorZ + 0.5);
  scene.add(endWall);

  for (let i = 0; i < 3; i += 1) {
    const door = new SlidingDoor(doorWidth, doorHeight, doorDepth, hazardTexture.clone());
    const offsetX = (i - 1) * (doorWidth + 1.2);
    door.group.position.set(offsetX, 1, doorZ);
    scene.add(door.group);
    doors.push(door);

    const accentLight = new PointLight(neonColors[i % neonColors.length], 14, 24, 2.2);
    accentLight.position.set(offsetX, doorHeight, doorZ + 2.2);
    scene.add(accentLight);
  }

  const washLight = new PointLight(0x4de2ff, 1.6, 120, 1.5);
  washLight.position.set(0, corridorHeight * 0.8, corridorLength * 0.6);
  scene.add(washLight);

  const guidanceLight = new PointLight(0x66d6ff, 0.9, corridorLength + 32, 1.2);
  guidanceLight.position.set(0, corridorHeight * 0.55, corridorLength * 0.35);
  scene.add(guidanceLight);

  const endFill = new PointLight(0x9ddcff, 6.4, 64, 1.3);
  endFill.position.set(0, corridorHeight * 0.9, doorZ - 4);
  scene.add(endFill);

  const lookTarget = new Vector3(0, corridorHeight * 0.45, doorZ + 8);
  camera.position.set(0, corridorHeight * 0.42, startZ);
  camera.lookAt(lookTarget);

  return {
    scene,
    doors,
    pulsingMaterials,
    cameraStartZ: startZ,
    cameraStopZ: stopZ,
    corridorHeight,
    lookTarget,
  };
}
