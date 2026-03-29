import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    let renderer: any;
    let controls: any;
    let handleResize: () => void;
    let handleMouseMove: (e: MouseEvent) => void;

    const initScene = async () => {
      try {
        renderer = new WebGPURenderer({ antialias: true, alpha: true });
        await renderer.init();
      } catch (e) {
        console.warn("WebGPU not supported, falling back to WebGLRenderer", e);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      }

      if (!isMounted) return;

      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.2;
      containerRef.current!.appendChild(renderer.domElement);

      const scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 6);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.04;
      controls.minDistance = 2;
      controls.maxDistance = 15;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;

      // High-quality HDRI Environment Map
      const rgbeLoader = new RGBELoader();
      try {
        const envTexture = await rgbeLoader.loadAsync('https://raw.githubusercontent.com/mrdoob/three.js/r150/examples/textures/equirectangular/royal_esplanade_1k.hdr');
        envTexture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = envTexture;
        scene.environment = envTexture;
      } catch (err) {
        console.error("Failed to load HDRI", err);
        scene.background = new THREE.Color(0x020202);
      }

      // --- 1. PHOTOREALISTIC AMBER ---
      // Create a subtle noise texture for the surface bump
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 512;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#808080';
      context.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 5000; i++) {
        const v = Math.random() * 255;
        context.fillStyle = `rgba(${v}, ${v}, ${v}, ${Math.random() * 0.05})`;
        context.beginPath();
        context.arc(Math.random() * 512, Math.random() * 512, Math.random() * 10, 0, Math.PI * 2);
        context.fill();
      }
      const bumpTexture = new THREE.CanvasTexture(canvas);
      bumpTexture.wrapS = THREE.RepeatWrapping;
      bumpTexture.wrapT = THREE.RepeatWrapping;

      const amberGeometry = new THREE.SphereGeometry(1.2, 128, 128);
      const pos = amberGeometry.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        v.normalize();
        // Organic deformation
        const n1 = Math.sin(v.x * 3) * Math.cos(v.y * 3) * Math.sin(v.z * 3);
        const n2 = Math.sin(v.x * 8) * Math.cos(v.y * 7) * Math.sin(v.z * 9);
        const radius = 1.2 + n1 * 0.15 + n2 * 0.03;
        v.multiplyScalar(radius);
        // Flatten into a pendant shape
        v.z *= 0.5;
        v.y *= 1.1;
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      amberGeometry.computeVertexNormals();

      // Store original positions for morphing
      const originalPositions = new Float32Array(pos.array);
      const currentPositions = new Float32Array(pos.array);
      const velocities = new Float32Array(pos.count * 3);

      const amberMaterial = new THREE.MeshPhysicalMaterial({
        color: 0xff8800,
        emissive: 0x2a0a00,
        emissiveIntensity: 0.1,
        metalness: 0.05,
        roughness: 0.1,
        ior: 1.54,
        transmission: 1.0,
        thickness: 2.8,
        attenuationColor: new THREE.Color(0xcc3300),
        attenuationDistance: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        dispersion: 2.5,
        envMapIntensity: 2.0,
        bumpMap: bumpTexture,
        bumpScale: 0.002,
        transparent: true,
        side: THREE.DoubleSide,
      });

      const amber = new THREE.Mesh(amberGeometry, amberMaterial);
      scene.add(amber);

      // --- 2. INTERNAL BUBBLES & IMPERFECTIONS ---
      const bubbleGeo = new THREE.SphereGeometry(0.015, 16, 16);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        transmission: 1.0,
        ior: 1.0, // Air IOR
        roughness: 0.05,
        thickness: 0.1,
        dispersion: 1.5,
        envMapIntensity: 1.0,
      });
      const bubbleGroup = new THREE.Group();
      for(let i=0; i<80; i++) {
        const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
        const r = 0.9 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        bubble.position.set(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta) * 1.1,
          r * Math.cos(phi) * 0.5
        );
        const scale = Math.random() * 1.5 + 0.2;
        bubble.scale.set(scale, scale, scale);
        bubbleGroup.add(bubble);
      }
      amber.add(bubbleGroup);

      // --- 3. PHOTOREALISTIC FLY ---
      const flyGroup = new THREE.Group();
      
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a0a0a,
        roughness: 0.6,
        metalness: 0.2,
        clearcoat: 0.3,
        clearcoatRoughness: 0.4,
        iridescence: 0.2,
      });

      const eyeMat = new THREE.MeshPhysicalMaterial({
        color: 0x2a0000,
        roughness: 0.2,
        metalness: 0.1,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
      });

      const wingMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transmission: 0.95,
        transparent: true,
        roughness: 0.1,
        ior: 1.5,
        thickness: 0.01,
        iridescence: 1.0,
        iridescenceIOR: 1.3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      // Thorax
      const thoraxGeo = new THREE.CapsuleGeometry(0.12, 0.15, 16, 16);
      const thorax = new THREE.Mesh(thoraxGeo, bodyMat);
      thorax.rotation.x = Math.PI / 2;
      flyGroup.add(thorax);

      // Abdomen
      const abdomenGeo = new THREE.CapsuleGeometry(0.1, 0.25, 16, 16);
      const abdomen = new THREE.Mesh(abdomenGeo, bodyMat);
      abdomen.position.set(0, 0, 0.25);
      abdomen.rotation.x = Math.PI / 2;
      flyGroup.add(abdomen);

      // Head
      const headGeo = new THREE.SphereGeometry(0.08, 16, 16);
      const head = new THREE.Mesh(headGeo, bodyMat);
      head.position.set(0, -0.02, -0.18);
      flyGroup.add(head);

      // Eyes
      const eyeGeo = new THREE.SphereGeometry(0.05, 16, 16);
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(0.05, 0.02, -0.18);
      flyGroup.add(leftEye);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.position.set(-0.05, 0.02, -0.18);
      flyGroup.add(rightEye);

      // Wings
      const wingGeo = new THREE.PlaneGeometry(0.15, 0.4);
      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.set(0.1, 0.1, 0.05);
      leftWing.rotation.x = Math.PI / 2;
      leftWing.rotation.y = Math.PI / 8;
      leftWing.rotation.z = -Math.PI / 8;
      flyGroup.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.set(-0.1, 0.1, 0.05);
      rightWing.rotation.x = Math.PI / 2;
      rightWing.rotation.y = -Math.PI / 8;
      rightWing.rotation.z = Math.PI / 8;
      flyGroup.add(rightWing);

      // Legs
      const legGeo = new THREE.CylinderGeometry(0.006, 0.002, 0.25, 8);
      const legPositions = [
        [0.12, -0.1, -0.05, 0, 0, -Math.PI / 3],
        [-0.12, -0.1, -0.05, 0, 0, Math.PI / 3],
        [0.15, -0.1, 0.05, 0, 0, -Math.PI / 4],
        [-0.15, -0.1, 0.05, 0, 0, Math.PI / 4],
        [0.12, -0.1, 0.2, 0, 0, -Math.PI / 5],
        [-0.12, -0.1, 0.2, 0, 0, Math.PI / 5],
      ];
      legPositions.forEach((pos) => {
        const leg = new THREE.Mesh(legGeo, bodyMat);
        leg.position.set(pos[0], pos[1], pos[2]);
        leg.rotation.set(pos[3], pos[4], pos[5]);
        flyGroup.add(leg);
      });

      // Position fly inside amber
      flyGroup.scale.set(0.8, 0.8, 0.8);
      flyGroup.rotation.x = Math.PI / 4;
      flyGroup.rotation.y = Math.PI / 6;
      amber.add(flyGroup);

      // --- 4. CINEMATIC LIGHTING ---
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
      scene.add(ambientLight);

      // Main spotlight for caustics and highlights
      const spotLight = new THREE.SpotLight(0xffeedd, 50);
      spotLight.position.set(5, 5, 5);
      spotLight.angle = Math.PI / 6;
      spotLight.penumbra = 0.5;
      spotLight.decay = 1.5;
      scene.add(spotLight);

      // Strong warm backlight to make the amber glow from within (simulating caustics/scattering)
      const backLight = new THREE.PointLight(0xff5500, 80);
      backLight.position.set(-3, -2, -4);
      backLight.decay = 1.8;
      scene.add(backLight);

      // Cool fill light for contrast
      const fillLight = new THREE.PointLight(0x4488ff, 15);
      fillLight.position.set(4, -2, 2);
      fillLight.decay = 2;
      scene.add(fillLight);

      // Raycaster for hover effect
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2(-1000, -1000);
      const targetMouse = new THREE.Vector2(-1000, -1000);

      handleMouseMove = (event: MouseEvent) => {
        targetMouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        targetMouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
      };
      window.addEventListener('mousemove', handleMouseMove);

      // Animation Loop
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const time = clock.getElapsedTime();
        
        // Subtle floating animation
        amber.position.y = Math.sin(time * 0.5) * 0.1;
        amber.rotation.y = time * 0.1;
        amber.rotation.z = Math.sin(time * 0.2) * 0.05;
        
        // --- Topology Morphing ---
        mouse.lerp(targetMouse, 0.2);
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObject(amber);
        
        let hitPointLocal: THREE.Vector3 | null = null;
        if (intersects.length > 0) {
          hitPointLocal = amber.worldToLocal(intersects[0].point.clone());
        }

        const posAttribute = amberGeometry.attributes.position;
        const vOrig = new THREE.Vector3();
        const vCurr = new THREE.Vector3();

        for (let i = 0; i < posAttribute.count; i++) {
          vOrig.fromArray(originalPositions, i * 3);
          vCurr.fromArray(currentPositions, i * 3);

          // Spring force towards original position
          const springX = (vOrig.x - vCurr.x) * 0.1;
          const springY = (vOrig.y - vCurr.y) * 0.1;
          const springZ = (vOrig.z - vCurr.z) * 0.1;

          let repelX = 0, repelY = 0, repelZ = 0;

          if (hitPointLocal) {
            const dx = vCurr.x - hitPointLocal.x;
            const dy = vCurr.y - hitPointLocal.y;
            const dz = vCurr.z - hitPointLocal.z;
            const distSq = dx*dx + dy*dy + dz*dz;
            
            const radius = 0.6; // Influence radius
            if (distSq < radius * radius && distSq > 0.0001) {
              const dist = Math.sqrt(distSq);
              const force = Math.pow((radius - dist) / radius, 2) * 0.1; // Ease out
              
              // Push inward (towards center of amber) or just away from cursor?
              // Pushing away from cursor creates a dent
              repelX = (dx / dist) * force;
              repelY = (dy / dist) * force;
              repelZ = (dz / dist) * force;
            }
          }

          velocities[i*3] = (velocities[i*3] + springX + repelX) * 0.75; // Damping
          velocities[i*3+1] = (velocities[i*3+1] + springY + repelY) * 0.75;
          velocities[i*3+2] = (velocities[i*3+2] + springZ + repelZ) * 0.75;

          currentPositions[i*3] += velocities[i*3];
          currentPositions[i*3+1] += velocities[i*3+1];
          currentPositions[i*3+2] += velocities[i*3+2];

          posAttribute.setXYZ(i, currentPositions[i*3], currentPositions[i*3+1], currentPositions[i*3+2]);
        }

        posAttribute.needsUpdate = true;
        amberGeometry.computeVertexNormals();

        controls.update();
        renderer.render(scene, camera);
      });

      // Handle Resize
      handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);
    };

    initScene();

    // Cleanup
    return () => {
      isMounted = false;
      if (handleResize) window.removeEventListener('resize', handleResize);
      if (handleMouseMove) window.removeEventListener('mousemove', handleMouseMove);
      if (renderer) {
        renderer.setAnimationLoop(null);
        if (containerRef.current && renderer.domElement) {
          containerRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
      }
    };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
        <h1 className="text-white/90 font-sans text-sm tracking-[0.2em] uppercase font-light">
          Photorealistic Amber
        </h1>
        <p className="text-white/40 font-sans text-xs mt-2 tracking-wider">
          Drag to rotate &bull; Scroll to zoom
        </p>
      </div>
    </div>
  );
}
