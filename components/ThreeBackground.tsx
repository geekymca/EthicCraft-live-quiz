import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface ThreeBackgroundProps {
  variant?: 'cosmic' | 'minimal' | 'arena';
  className?: string;
  interactive?: boolean;
}

export const ThreeBackground: React.FC<ThreeBackgroundProps> = ({
  variant = 'cosmic',
  className = 'absolute inset-0 pointer-events-none z-0',
  interactive = true,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 80;

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Particle field creation
    const particleCount = variant === 'minimal' ? 600 : 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const scales = new Float32Array(particleCount);

    const colorA = new THREE.Color('#6366f1'); // Indigo
    const colorB = new THREE.Color('#38bdf8'); // Sky blue
    const colorC = new THREE.Color('#f59e0b'); // Gold / Amber
    const tempColor = new THREE.Color();

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread across a cylindrical wave field
      const radius = 25 + Math.random() * 65;
      const theta = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 120;

      positions[i3] = Math.cos(theta) * radius;
      positions[i3 + 1] = y;
      positions[i3 + 2] = Math.sin(theta) * radius;

      // Color gradient
      const ratio = Math.random();
      if (ratio < 0.6) {
        tempColor.copy(colorA).lerp(colorB, Math.random());
      } else {
        tempColor.copy(colorB).lerp(colorC, Math.random() * 0.8);
      }
      colors[i3] = tempColor.r;
      colors[i3 + 1] = tempColor.g;
      colors[i3 + 2] = tempColor.b;

      scales[i] = Math.random() * 2.5 + 0.5;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle texture (circle gradient)
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255,255,255,1)');
      gradient.addColorStop(0.3, 'rgba(255,255,255,0.8)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
    }
    const particleTexture = new THREE.CanvasTexture(canvas);

    const material = new THREE.PointsMaterial({
      size: 2.2,
      vertexColors: true,
      map: particleTexture,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Sacred geometric rings / Torus rings for depth
    const ringGroup = new THREE.Group();
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0x818cf8,
      wireframe: true,
      transparent: true,
      opacity: 0.12,
    });

    const torusGeo1 = new THREE.TorusGeometry(32, 0.4, 8, 48);
    const torus1 = new THREE.Mesh(torusGeo1, ringMaterial);
    torus1.rotation.x = Math.PI / 3;
    ringGroup.add(torus1);

    const torusGeo2 = new THREE.TorusGeometry(48, 0.3, 8, 64);
    const torus2 = new THREE.Mesh(
      torusGeo2,
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        wireframe: true,
        transparent: true,
        opacity: 0.08
      })
    );
    torus2.rotation.y = Math.PI / 4;
    ringGroup.add(torus2);

    scene.add(ringGroup);

    // Animation state
    let targetMouseX = 0;
    let targetMouseY = 0;
    let currentMouseX = 0;
    let currentMouseY = 0;
    let scrollY = 0;
    let targetScrollY = 0;

    // Intro opening animation zoom
    let introProgress = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      targetMouseX = x * 15;
      targetMouseY = y * 15;
    };

    const handleScroll = () => {
      targetScrollY = window.scrollY || document.documentElement.scrollTop;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = (performance.now() - startTime) * 0.001;

      // Smooth opening camera zoom
      if (introProgress < 1) {
        introProgress += 0.02;
        camera.position.z = THREE.MathUtils.lerp(120, 75, Math.min(1, introProgress));
      }

      // Smooth mouse follow
      currentMouseX += (targetMouseX - currentMouseX) * 0.05;
      currentMouseY += (targetMouseY - currentMouseY) * 0.05;

      // Smooth scroll reaction
      scrollY += (targetScrollY - scrollY) * 0.08;

      // Rotate particle cloud & rings
      particles.rotation.y = elapsedTime * 0.05 + currentMouseX * 0.02 + scrollY * 0.001;
      particles.rotation.x = currentMouseY * 0.02 + Math.sin(elapsedTime * 0.3) * 0.05;

      ringGroup.rotation.z = elapsedTime * 0.03;
      ringGroup.rotation.x = Math.PI / 3 + Math.sin(elapsedTime * 0.2) * 0.1;
      ringGroup.rotation.y = elapsedTime * 0.02 + scrollY * 0.002;

      // Scroll changes camera height and particle wave
      camera.position.y = -scrollY * 0.04 + currentMouseY * 0.4;
      camera.position.x = currentMouseX * 0.4;
      camera.lookAt(0, 0, 0);

      // Subtle pulse in particle wave
      const posArray = geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < particleCount; i += 8) {
        const i3 = i * 3;
        posArray[i3 + 1] += Math.sin(elapsedTime * 2 + posArray[i3] * 0.05) * 0.03;
      }
      geometry.attributes.position.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);

      // Clean up geometries and materials
      geometry.dispose();
      material.dispose();
      torusGeo1.dispose();
      torusGeo2.dispose();
      ringMaterial.dispose();
      particleTexture.dispose();
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [variant, interactive]);

  return <div ref={mountRef} className={className} />;
};
export default ThreeBackground;
