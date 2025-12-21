import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export default function SciFiCorridor() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 20, 60);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1.6, 28); // Much closer to the room!

    let yaw = Math.PI; // Start facing forward down corridor
    let pitch = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    containerRef.current.appendChild(renderer.domElement);

    // Lighting - Much brighter
    const ambientLight = new THREE.AmbientLight(0x8899aa, 2);
    scene.add(ambientLight);

    // Multiple lights along corridor
    for (let i = 0; i < 8; i += 1) {
      const light = new THREE.PointLight(0x00ddff, 2, 15);
      light.position.set(0, 3, i * 5);
      scene.add(light);
    }

    // Corridor
    const corridorGroup = new THREE.Group();

    // Floor
    const floorGeo = new THREE.PlaneGeometry(4, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x3a3a5e,
      metalness: 0.8,
      roughness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = 15;
    corridorGroup.add(floor);

    // Ceiling
    const ceiling = new THREE.Mesh(floorGeo, floorMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 4;
    ceiling.position.z = 15;
    corridorGroup.add(ceiling);

    // Walls with panels
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4a4a6e,
      metalness: 0.6,
      roughness: 0.4,
    });

    for (let i = 0; i < 6; i += 1) {
      const panelGeo = new THREE.BoxGeometry(0.1, 4, 4.5);
      const leftPanel = new THREE.Mesh(panelGeo, wallMat);
      leftPanel.position.set(-2, 2, i * 5 + 2);
      corridorGroup.add(leftPanel);

      const rightPanel = new THREE.Mesh(panelGeo, wallMat);
      rightPanel.position.set(2, 2, i * 5 + 2);
      corridorGroup.add(rightPanel);

      // Light strips
      const stripGeo = new THREE.BoxGeometry(0.05, 0.1, 4);
      const stripMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });

      const leftStrip = new THREE.Mesh(stripGeo, stripMat);
      leftStrip.position.set(-2, 3.5, i * 5 + 2);
      corridorGroup.add(leftStrip);

      const rightStrip = new THREE.Mesh(stripGeo, stripMat);
      rightStrip.position.set(2, 3.5, i * 5 + 2);
      corridorGroup.add(rightStrip);
    }

    scene.add(corridorGroup);

    // Octagonal room
    const octagonGroup = new THREE.Group();
    octagonGroup.position.z = 35;
    octagonGroup.rotation.y = Math.PI; // Flip 180 degrees

    const radius = 7;
    const height = 5;
    const segments = 8;
    const wallThickness = 0.3;

    // Create octagon walls
    for (let i = 0; i < segments; i += 1) {
      const angle = (i / segments) * Math.PI * 2;
      const wallNumber = i + 1; // Room numbers 1-8 instead of 0-7

      // Create wall: width(X), height(Y), thickness(Z)
      const wallWidth = 2 * radius * Math.sin(Math.PI / segments);

      // Walls 4, 5, 6 get doors (straight ahead when entering) - the rest are solid walls
      if (i === 3 || i === 4 || i === 5) {
        // Placeholder for future door implementation
      } else {
        // Solid wall
        const wallGeo = new THREE.BoxGeometry(wallWidth, height, wallThickness);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.rotation.y = -angle;
        wall.position.x = -Math.sin(angle) * radius;
        wall.position.y = height / 2;
        wall.position.z = Math.cos(angle) * radius;
        octagonGroup.add(wall);
      }

      // Add big fat number to every wall (inside)
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 300px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(wallNumber.toString(), 256, 256);

      const texture = new THREE.CanvasTexture(canvas);
      const numberMat = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide });

      // Inside number
      const numberGeoInside = new THREE.PlaneGeometry(2, 2);
      const numberPlaneInside = new THREE.Mesh(numberGeoInside, numberMat);
      numberPlaneInside.position.x = -Math.sin(angle) * (radius - wallThickness - 0.2);
      numberPlaneInside.position.y = height / 2;
      numberPlaneInside.position.z = Math.cos(angle) * (radius - wallThickness - 0.2);
      numberPlaneInside.rotation.y = -angle + Math.PI; // Add 180° rotation on Y axis
      octagonGroup.add(numberPlaneInside);
    }

    // Room floor
    const roomFloorGeo = new THREE.CylinderGeometry(radius, radius, 0.2, segments);
    const roomFloor = new THREE.Mesh(roomFloorGeo, floorMat);
    roomFloor.position.y = 0;
    roomFloor.rotation.y = Math.PI / 8;
    octagonGroup.add(roomFloor);

    // Room ceiling
    const roomCeiling = new THREE.Mesh(roomFloorGeo, floorMat);
    roomCeiling.position.y = height;
    roomCeiling.rotation.y = Math.PI / 8;
    octagonGroup.add(roomCeiling);

    // Central light in room
    const centerLight = new THREE.PointLight(0x00ffff, 3, 20);
    centerLight.position.set(0, 4, 35);
    scene.add(centerLight);

    // Additional room lights
    const roomLight1 = new THREE.PointLight(0xffffff, 2, 15);
    roomLight1.position.set(4, 3, 35);
    scene.add(roomLight1);

    const roomLight2 = new THREE.PointLight(0xffffff, 2, 15);
    roomLight2.position.set(-4, 3, 35);
    scene.add(roomLight2);

    scene.add(octagonGroup);

    // Red ball in center for reference
    const ballGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5,
      metalness: 0.8,
      roughness: 0.2,
    });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.set(0, height / 2, 35);
    scene.add(ball);

    // Controls
    const keys = new Set<string>();
    const moveSpeed = 0.1;
    const turnSpeed = 0.03;

    const handleKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
    const handleKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let isPointerLocked = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!isPointerLocked) return;
      const sensitivity = 0.002;
      yaw -= e.movementX * sensitivity;
      pitch -= e.movementY * sensitivity;
      pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
    };

    const onPointerLockChange = () => {
      isPointerLocked = document.pointerLockElement === renderer.domElement;
    };

    const requestLock = () => renderer.domElement.requestPointerLock();

    renderer.domElement.addEventListener('click', requestLock);

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);

    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();
    let animationFrame = 0;

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    // Animation
    const animate = () => {
      animationFrame = requestAnimationFrame(animate);

      // Keyboard turning
      if (keys.has('q') || keys.has('arrowleft')) {
        yaw += turnSpeed;
      }
      if (keys.has('e') || keys.has('arrowright')) {
        yaw -= turnSpeed;
      }

      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Movement
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();

      right.crossVectors(direction, camera.up).normalize();

      if (keys.has('w')) {
        camera.position.addScaledVector(direction, moveSpeed);
      }
      if (keys.has('s')) {
        camera.position.addScaledVector(direction, -moveSpeed);
      }
      if (keys.has('a')) {
        camera.position.addScaledVector(right, -moveSpeed);
      }
      if (keys.has('d')) {
        camera.position.addScaledVector(right, moveSpeed);
      }

      // Keep camera at eye level
      camera.position.y = 1.6;

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('click', requestLock);
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          color: '#00ffff',
          fontFamily: 'monospace',
          fontSize: '14px',
          background: 'rgba(0,0,0,0.7)',
          padding: '15px',
          borderRadius: '5px',
          border: '1px solid #00ffff',
        }}
      >
        <div>WASD - Move</div>
        <div>Q/E or Arrow Keys - Turn</div>
        <div>Mouse - Look Around</div>
        <div>Click to capture mouse</div>
      </div>
    </div>
  );
}
