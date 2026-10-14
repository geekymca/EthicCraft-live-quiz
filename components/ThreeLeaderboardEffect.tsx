import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';

interface ThreeLeaderboardEffectProps {
  className?: string;
  isGrandFinale?: boolean;
}

export const ThreeLeaderboardEffect: React.FC<ThreeLeaderboardEffectProps> = ({
  className = 'w-full h-28 relative flex items-center justify-center',
  isGrandFinale = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Launch celebratory confetti burst
    try {
      confetti({
        particleCount: isGrandFinale ? 120 : 60,
        spread: 80,
        origin: { y: 0.6 },
        colors: ['#6366f1', '#eab308', '#38bdf8', '#10b981', '#f43f5e'],
      });
      if (isGrandFinale) {
        setTimeout(() => {
          confetti({
            particleCount: 80,
            angle: 60,
            spread: 60,
            origin: { x: 0 },
            colors: ['#ffd700', '#6366f1']
          });
          confetti({
            particleCount: 80,
            angle: 120,
            spread: 60,
            origin: { x: 1 },
            colors: ['#ffd700', '#38bdf8']
          });
        }, 500);
      }
    } catch (e) {
      // Ignore in non-browser environments
    }

    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 320;
    const height = container.clientHeight || 160;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 13);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0xffd700, 3.5, 50);
    pointLight1.position.set(10, 10, 10);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x6366f1, 2.5, 50);
    pointLight2.position.set(-10, -5, 10);
    scene.add(pointLight2);

    // 3D Trophy / Sacred Emblem Group
    const trophyGroup = new THREE.Group();

    // Golden materials
    const goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xffb703,
      metalness: 0.85,
      roughness: 0.25,
      wireframe: false,
    });

    const gemMaterial = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      metalness: 0.4,
      roughness: 0.1,
      transparent: true,
      opacity: 0.9,
    });

    // Trophy cup body (cylinder/lathe)
    const cupGeo = new THREE.CylinderGeometry(2.4, 1.2, 3.2, 32, 1, true);
    const cupMesh = new THREE.Mesh(cupGeo, goldMaterial);
    cupMesh.position.y = 1.2;
    trophyGroup.add(cupMesh);

    // Trophy base ring
    const baseGeo1 = new THREE.CylinderGeometry(1.6, 2.2, 0.6, 32);
    const baseMesh1 = new THREE.Mesh(baseGeo1, goldMaterial);
    baseMesh1.position.y = -2;
    trophyGroup.add(baseMesh1);

    const baseGeo2 = new THREE.CylinderGeometry(0.8, 0.8, 1.2, 16);
    const baseMesh2 = new THREE.Mesh(baseGeo2, goldMaterial);
    baseMesh2.position.y = -1.1;
    trophyGroup.add(baseMesh2);

    // Inner glowing sacred jewel (Icosahedron)
    const gemGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const gemMesh = new THREE.Mesh(gemGeo, gemMaterial);
    gemMesh.position.y = 1.4;
    trophyGroup.add(gemMesh);

    // Halo Rings around the trophy
    const haloGeo = new THREE.TorusGeometry(3.6, 0.08, 16, 64);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe066, transparent: true, opacity: 0.6 });
    const halo1 = new THREE.Mesh(haloGeo, haloMat);
    halo1.rotation.x = Math.PI / 2.5;
    trophyGroup.add(halo1);

    const haloGeo2 = new THREE.TorusGeometry(4.2, 0.06, 16, 64);
    const haloMat2 = new THREE.MeshBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.4 });
    const halo2 = new THREE.Mesh(haloGeo2, haloMat2);
    halo2.rotation.y = Math.PI / 3;
    trophyGroup.add(halo2);

    // Floating sparkle particles orbiting trophy
    const sparkleCount = 60;
    const sparkleGeo = new THREE.BufferGeometry();
    const sparklePos = new Float32Array(sparkleCount * 3);
    for (let i = 0; i < sparkleCount; i++) {
      const radius = 3 + Math.random() * 3.5;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 5;
      sparklePos[i * 3] = Math.cos(angle) * radius;
      sparklePos[i * 3 + 1] = y;
      sparklePos[i * 3 + 2] = Math.sin(angle) * radius;
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xfff3b0,
      size: 0.35,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
    trophyGroup.add(sparkles);

    scene.add(trophyGroup);

    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startTime) * 0.001;

      // Smooth floating bob
      trophyGroup.position.y = Math.sin(elapsed * 2) * 0.35;
      trophyGroup.rotation.y = elapsed * 0.8;

      // Inner gem counter-rotates
      gemMesh.rotation.y = -elapsed * 1.5;
      gemMesh.rotation.x = Math.sin(elapsed) * 0.5;

      // Halo rotations
      halo1.rotation.z = elapsed * 0.6;
      halo2.rotation.x = elapsed * 0.4;
      sparkles.rotation.y = -elapsed * 0.5;

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      cupGeo.dispose();
      baseGeo1.dispose();
      baseGeo2.dispose();
      gemGeo.dispose();
      haloGeo.dispose();
      haloGeo2.dispose();
      sparkleGeo.dispose();
      goldMaterial.dispose();
      gemMaterial.dispose();
      haloMat.dispose();
      haloMat2.dispose();
      sparkleMat.dispose();
      renderer.dispose();
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isGrandFinale]);

  return (
    <div className={className}>
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
};
export default ThreeLeaderboardEffect;
