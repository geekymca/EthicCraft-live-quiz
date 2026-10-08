import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';

export interface ThreeAnswerEffectHandle {
  triggerBurst: (x?: number, y?: number, colorHex?: number) => void;
}

interface ThreeAnswerEffectProps {
  className?: string;
}

export const ThreeAnswerEffect = forwardRef<ThreeAnswerEffectHandle, ThreeAnswerEffectProps>(
  ({ className = 'fixed inset-0 pointer-events-none z-40' }, ref) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const triggerBurstRef = useRef<((x?: number, y?: number, colorHex?: number) => void) | null>(null);

    useImperativeHandle(ref, () => ({
      triggerBurst: (x, y, colorHex) => {
        if (triggerBurstRef.current) {
          triggerBurstRef.current(x, y, colorHex);
        }
      }
    }));

    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.z = 100;

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
      });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      interface SparkleParticle {
        x: number;
        y: number;
        z: number;
        vx: number;
        vy: number;
        vz: number;
        life: number;
        maxLife: number;
        size: number;
        color: THREE.Color;
      }

      const activeParticles: SparkleParticle[] = [];
      const MAX_ACTIVE = 400;

      const pGeo = new THREE.BufferGeometry();
      const positions = new Float32Array(MAX_ACTIVE * 3);
      const colors = new Float32Array(MAX_ACTIVE * 3);
      const sizes = new Float32Array(MAX_ACTIVE);

      pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      pGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      // Circular canvas texture
      const canvas = document.createElement('canvas');
      canvas.width = 32;
      canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,220,100,0.9)');
        gradient.addColorStop(1, 'rgba(255,180,50,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
      }
      const sparkTexture = new THREE.CanvasTexture(canvas);

      const pMat = new THREE.PointsMaterial({
        size: 3.5,
        vertexColors: true,
        map: sparkTexture,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const pMesh = new THREE.Points(pGeo, pMat);
      scene.add(pMesh);

      // Trigger burst function
      triggerBurstRef.current = (screenX?: number, screenY?: number, colorHex = 0x6366f1) => {
        const burstCount = 60;
        const baseColor = new THREE.Color(colorHex);
        const goldColor = new THREE.Color(0xf59e0b);

        // Convert screen coordinates to world coordinates
        const x = screenX !== undefined ? screenX : window.innerWidth / 2;
        const y = screenY !== undefined ? screenY : window.innerHeight / 2;

        const normX = (x / window.innerWidth) * 2 - 1;
        const normY = -(y / window.innerHeight) * 2 + 1;

        // Project to z = 0 plane
        const worldX = normX * (window.innerWidth / 15);
        const worldY = normY * (window.innerHeight / 15);

        for (let i = 0; i < burstCount; i++) {
          if (activeParticles.length >= MAX_ACTIVE) {
            activeParticles.shift();
          }

          const angle = Math.random() * Math.PI * 2;
          const speed = 0.8 + Math.random() * 2.2;
          const pColor = Math.random() > 0.4 ? baseColor.clone() : goldColor.clone();

          activeParticles.push({
            x: worldX + (Math.random() - 0.5) * 4,
            y: worldY + (Math.random() - 0.5) * 4,
            z: (Math.random() - 0.5) * 5,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed + (Math.random() * 0.5),
            vz: (Math.random() - 0.5) * 1.5,
            life: 1.0,
            maxLife: 0.6 + Math.random() * 0.5,
            size: 2.5 + Math.random() * 3,
            color: pColor
          });
        }
      };

      let animationFrameId: number;
      const animate = () => {
        animationFrameId = requestAnimationFrame(animate);

        // Update active particles
        for (let i = activeParticles.length - 1; i >= 0; i--) {
          const p = activeParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.z += p.vz;
          p.vx *= 0.94;
          p.vy *= 0.94;
          p.vy -= 0.015; // subtle gravity
          p.life -= 0.025;

          if (p.life <= 0) {
            activeParticles.splice(i, 1);
          }
        }

        // Update geometry buffers
        const posAttr = pGeo.attributes.position.array as Float32Array;
        const colAttr = pGeo.attributes.color.array as Float32Array;

        for (let i = 0; i < MAX_ACTIVE; i++) {
          const i3 = i * 3;
          if (i < activeParticles.length) {
            const p = activeParticles[i];
            posAttr[i3] = p.x;
            posAttr[i3 + 1] = p.y;
            posAttr[i3 + 2] = p.z;

            const alpha = Math.max(0, p.life / p.maxLife);
            colAttr[i3] = p.color.r * alpha;
            colAttr[i3 + 1] = p.color.g * alpha;
            colAttr[i3 + 2] = p.color.b * alpha;
          } else {
            posAttr[i3] = 999999;
            posAttr[i3 + 1] = 999999;
            posAttr[i3 + 2] = 999999;
          }
        }

        pGeo.attributes.position.needsUpdate = true;
        pGeo.attributes.color.needsUpdate = true;

        renderer.render(scene, camera);
      };

      animate();

      const handleResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        cancelAnimationFrame(animationFrameId);
        pGeo.dispose();
        pMat.dispose();
        sparkTexture.dispose();
        renderer.dispose();
        if (renderer.domElement && container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    return <div ref={mountRef} className={className} />;
  }
);

ThreeAnswerEffect.displayName = 'ThreeAnswerEffect';
export default ThreeAnswerEffect;
