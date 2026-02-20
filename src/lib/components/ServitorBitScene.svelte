<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import {
    PerspectiveCamera,
    MeshStandardMaterial,
    IcosahedronGeometry,
    Color,
    Quaternion
  } from 'three';
  import type { Mesh } from 'three';
  import { EffectComposer, EffectPass, RenderPass, BloomEffect } from 'postprocessing';

  let { pulse = 0, busy = false }: { pulse?: number; busy?: boolean } = $props();

  const { renderer, scene, camera, autoRender } = useThrelte();

  // Take over rendering from Threlte so we can run post-processing
  autoRender.set(false);

  const cam = new PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 0, 9.0);
  camera.set(cam);

  // Post-processing: bloom
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  composer.addPass(
    new EffectPass(
      cam,
      new BloomEffect({
        luminanceThreshold: 0,
        luminanceSmoothing: 0.025,
        intensity: 0.8,
        mipmapBlur: true,
        radius: 0.5
      })
    )
  );

  // Flat-shaded geometry: toNonIndexed gives each face its own vertices
  const baseGeo = new IcosahedronGeometry(1, 0);
  const geometry = baseGeo.toNonIndexed();
  geometry.computeVertexNormals();

  // Color endpoints for idle ↔ active blend
  const idleColor = new Color(0x52525b); // zinc-600
  const activeColor = new Color(0xbe185d); // pink-700
  const tempColor = new Color();

  const material = new MeshStandardMaterial({
    color: idleColor,
    flatShading: true,
    roughness: 0.4,
    metalness: 0.35,
    emissive: new Color(0x000000),
    emissiveIntensity: 0
  });

  let mesh: Mesh | undefined = $state();
  let lastPulse = 0;
  let excitement = 0;
  let colorBlend = 0;
  let elapsed = 0;

  // Slerp-based rotation: pick random target orientations on excitement
  const currentQuat = new Quaternion();
  const targetQuat = new Quaternion();
  let slerpProgress = 1; // start fully arrived
  let slerpVelocity = 0; // for spring-based inertia

  function randomQuaternion(q: Quaternion) {
    q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    q.normalize();
  }

  useTask((delta) => {
    if (!mesh) return;

    elapsed += delta;

    // Detect new pulse → spike excitement + pick new orientation
    if (pulse !== lastPulse) {
      lastPulse = pulse;
      excitement = Math.min(excitement + 0.5, 1.0);

      // Pick a new random target orientation, keep current velocity for inertia
      currentQuat.copy(mesh.quaternion);
      randomQuaternion(targetQuat);
      slerpProgress = 0;
      // Don't reset slerpVelocity — carry momentum from previous motion
    }

    // Decay excitement
    excitement = Math.max(0, excitement - delta * 0.7);

    // Smooth color blend: target 1 when busy or excited, 0 when idle
    const colorTarget = Math.max(busy ? 1 : 0, excitement);
    colorBlend += (colorTarget - colorBlend) * Math.min(1, delta * 4);

    // Apply blended color + emissive (bloom picks up the emissive)
    tempColor.lerpColors(idleColor, activeColor, colorBlend);
    material.color.copy(tempColor);
    material.emissive.copy(tempColor);
    material.emissiveIntensity = colorBlend * 0.4 + excitement * 0.8;

    // Rotation: spring-driven slerp with inertia
    if (slerpProgress < 1) {
      // Damped spring: accelerate towards target, overshoot slightly, settle
      const stiffness = 6.0 + excitement * 10.0;
      const damping = 4.0;
      const springForce = (1 - slerpProgress) * stiffness;
      slerpVelocity += (springForce - slerpVelocity * damping) * delta;
      slerpProgress = Math.min(1, slerpProgress + slerpVelocity * delta);

      mesh.quaternion.slerpQuaternions(currentQuat, targetQuat, slerpProgress);
    } else {
      slerpVelocity = 0;
      // Gentle idle tumble
      const idleSpeed = 0.15 + (busy ? 0.5 : 0);
      const nx = Math.sin(elapsed * 1.3) * Math.cos(elapsed * 0.7);
      const ny = Math.cos(elapsed * 0.9) * Math.sin(elapsed * 1.1);
      mesh.rotation.x += delta * idleSpeed * nx;
      mesh.rotation.y += delta * idleSpeed * ny;
    }

    // Float: layered noise for organic wandering — more when busy/excited
    const baseAmp = 0.15;
    const busyAmp = busy ? 0.25 : 0;
    const excitedAmp = baseAmp + busyAmp + excitement * 0.3;
    mesh.position.x =
      Math.sin(elapsed * 0.7) * excitedAmp * 0.6 +
      Math.sin(elapsed * 1.9) * excitedAmp * 0.3 +
      Math.cos(elapsed * 3.1) * excitedAmp * 0.1;
    mesh.position.y =
      Math.cos(elapsed * 0.9) * excitedAmp * 0.6 +
      Math.cos(elapsed * 2.3) * excitedAmp * 0.3 +
      Math.sin(elapsed * 2.7) * excitedAmp * 0.1;

    // Scale: pulse on excitement
    const pulseScale = 1 + excitement * 0.25;
    mesh.scale.setScalar(pulseScale);

    // Render with post-processing
    composer.render(delta);
  });
</script>

<T.AmbientLight intensity={0.3} />
<T.DirectionalLight position={[3, 5, 4]} intensity={1.0} />

<T.Mesh bind:ref={mesh} {geometry} {material} />
