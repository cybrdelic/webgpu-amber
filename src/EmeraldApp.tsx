import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export default function EmeraldApp() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;
    let renderer: any;
    let controls: any;
    let handleResize: () => void;

    const initScene = async () => {
      try {
        renderer = new WebGPURenderer({ antialias: true, alpha: true });
        await renderer.init();
      } catch (e) {
        console.warn('WebGPU not supported, falling back to WebGLRenderer', e);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      }

      if (!isMounted) return;

      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
      containerRef.current!.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020d06);

      const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 1.5, 7);

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.04;
      controls.minDistance = 2;
      controls.maxDistance = 15;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      controls.target.set(0, 0, 0);

      // --- EMERALD CRYSTAL GROUP ---
      const crystalGroup = new THREE.Group();

      // Faceted surface bump texture for the crystal prism faces
      const bumpCanvas = document.createElement('canvas');
      bumpCanvas.width = 256;
      bumpCanvas.height = 256;
      const bCtx = bumpCanvas.getContext('2d')!;
      bCtx.fillStyle = '#808080';
      bCtx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 800; i++) {
        const v = Math.floor(Math.random() * 60 + 100);
        bCtx.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.08})`;
        bCtx.beginPath();
        bCtx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 5 + 1, 0, Math.PI * 2);
        bCtx.fill();
      }
      const bumpTexture = new THREE.CanvasTexture(bumpCanvas);
      bumpTexture.wrapS = THREE.RepeatWrapping;
      bumpTexture.wrapT = THREE.RepeatWrapping;

      // Primary emerald material — deep refractive green, beryl IOR
      const emeraldMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a9e50,
        emissive: new THREE.Color(0x002810),
        emissiveIntensity: 0.2,
        metalness: 0.0,
        roughness: 0.04,
        ior: 1.566,
        transmission: 0.94,
        thickness: 2.8,
        attenuationColor: new THREE.Color(0x003c18),
        attenuationDistance: 1.6,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        dispersion: 0.6,
        envMapIntensity: 3.0,
        bumpMap: bumpTexture,
        bumpScale: 0.003,
        transparent: true,
        side: THREE.DoubleSide,
      });

      // --- Hexagonal prism body (natural crystal habit) ---
      const prismGeo = new THREE.CylinderGeometry(1.0, 1.0, 2.6, 6, 1, false);
      // Slight organic deformation to break perfect symmetry
      const prismPos = prismGeo.attributes.position;
      const pv = new THREE.Vector3();
      for (let i = 0; i < prismPos.count; i++) {
        pv.fromBufferAttribute(prismPos, i);
        const jitter = (Math.random() - 0.5) * 0.03;
        pv.x += jitter;
        pv.z += (Math.random() - 0.5) * 0.03;
        prismPos.setXYZ(i, pv.x, pv.y, pv.z);
      }
      prismGeo.computeVertexNormals();
      const prism = new THREE.Mesh(prismGeo, emeraldMat);
      crystalGroup.add(prism);

      // Top termination pyramid
      const topCapGeo = new THREE.ConeGeometry(1.02, 0.55, 6, 1, false);
      const topCap = new THREE.Mesh(topCapGeo, emeraldMat);
      topCap.position.y = 1.575;
      crystalGroup.add(topCap);

      // Bottom termination pyramid (slightly smaller — natural asymmetry)
      const botCapGeo = new THREE.ConeGeometry(1.02, 0.4, 6, 1, false);
      const botCap = new THREE.Mesh(botCapGeo, emeraldMat);
      botCap.position.y = -1.5;
      botCap.rotation.z = Math.PI;
      crystalGroup.add(botCap);

      // Tilt crystal slightly for a natural resting pose
      crystalGroup.rotation.x = 0.18;
      crystalGroup.rotation.z = 0.1;
      scene.add(crystalGroup);

      // --- INTERNAL INCLUSIONS ("JARDIN") ---

      // 1. Fracture veils — flat translucent planes inside
      const fractureMat = new THREE.MeshPhysicalMaterial({
        color: 0xc8ffe0,
        transparent: true,
        opacity: 0.07,
        roughness: 0.25,
        metalness: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      for (let i = 0; i < 14; i++) {
        const w = Math.random() * 0.45 + 0.1;
        const h = w * (Math.random() * 0.9 + 0.4);
        const fractureGeo = new THREE.PlaneGeometry(w, h);
        const fracture = new THREE.Mesh(fractureGeo, fractureMat);
        fracture.position.set(
          (Math.random() - 0.5) * 0.75,
          (Math.random() - 0.5) * 2.2,
          (Math.random() - 0.5) * 0.75
        );
        fracture.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        prism.add(fracture);
      }

      // 2. Needle inclusions (actinolite / tourmaline needles common in emerald)
      const needleMat = new THREE.MeshStandardMaterial({
        color: 0x0f0700,
        roughness: 0.7,
        metalness: 0.15,
        transparent: true,
        opacity: 0.55,
      });
      for (let i = 0; i < 22; i++) {
        const len = Math.random() * 0.35 + 0.06;
        const needleGeo = new THREE.CylinderGeometry(0.004, 0.001, len, 5);
        const needle = new THREE.Mesh(needleGeo, needleMat);
        needle.position.set(
          (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 2.2,
          (Math.random() - 0.5) * 0.7
        );
        needle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        prism.add(needle);
      }

      // 3. Fluid / three-phase inclusions (tiny droplets)
      const fluidMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ffcc,
        transmission: 0.9,
        roughness: 0.1,
        ior: 1.33,
        thickness: 0.04,
        transparent: true,
        envMapIntensity: 1.2,
      });
      for (let i = 0; i < 18; i++) {
        const radius = 0.012 * (Math.random() + 0.5);
        const fluidGeo = new THREE.SphereGeometry(radius, 8, 8);
        const fluid = new THREE.Mesh(fluidGeo, fluidMat);
        const r = 0.65 * Math.cbrt(Math.random());
        const theta = Math.random() * 2 * Math.PI;
        fluid.position.set(r * Math.cos(theta), (Math.random() - 0.5) * 2.0, r * Math.sin(theta) * 0.8);
        prism.add(fluid);
      }

      // --- CINEMATIC LIGHTING ---
      const ambientLight = new THREE.AmbientLight(0x0a2015, 0.8);
      scene.add(ambientLight);

      // Key: cool white overhead
      const keyLight = new THREE.SpotLight(0xffffff, 80);
      keyLight.position.set(3, 9, 4);
      keyLight.angle = Math.PI / 5;
      keyLight.penumbra = 0.45;
      keyLight.decay = 1.4;
      scene.add(keyLight);

      // Deep green backlight — makes crystal glow from within
      const backLight = new THREE.PointLight(0x00ff55, 70);
      backLight.position.set(-4, -2, -5);
      backLight.decay = 1.6;
      scene.add(backLight);

      // Violet/blue accent
      const fillLight = new THREE.PointLight(0x6633ff, 25);
      fillLight.position.set(5, -1, 3);
      fillLight.decay = 2;
      scene.add(fillLight);

      // Green rim
      const rimLight = new THREE.PointLight(0x00cc44, 40);
      rimLight.position.set(-3, 4, -2);
      rimLight.decay = 1.7;
      scene.add(rimLight);

      // Warm accent to pick up facet edges
      const edgeLight = new THREE.PointLight(0xffffff, 20);
      edgeLight.position.set(0, -5, 2);
      edgeLight.decay = 2;
      scene.add(edgeLight);

      // --- ANIMATION LOOP ---
      const clock = new THREE.Clock();
      renderer.setAnimationLoop(() => {
        const time = clock.getElapsedTime();

        // Gentle floating & slow rotation
        crystalGroup.position.y = Math.sin(time * 0.45) * 0.09;
        crystalGroup.rotation.y = time * 0.09;
        crystalGroup.rotation.x = 0.18 + Math.sin(time * 0.2) * 0.03;

        // Pulse backlight intensity for internal glow effect
        backLight.intensity = 65 + Math.sin(time * 1.2) * 12;
        rimLight.intensity = 35 + Math.sin(time * 0.8 + 1) * 10;

        controls.update();
        renderer.render(scene, camera);
      });

      handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', handleResize);
    };

    initScene();

    return () => {
      isMounted = false;
      if (handleResize) window.removeEventListener('resize', handleResize);
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
          Photorealistic Emerald
        </h1>
        <p className="text-white/40 font-sans text-xs mt-2 tracking-wider">
          Drag to rotate &bull; Scroll to zoom
        </p>
      </div>
    </div>
  );
}
