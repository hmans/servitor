<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import {
    PerspectiveCamera,
    MeshStandardMaterial,
    IcosahedronGeometry,
    Color
  } from 'three';
  import type { Mesh } from 'three';
  import { EffectComposer, EffectPass, RenderPass, BloomEffect } from 'postprocessing';

  let { pulse = 0, busy = false }: { pulse?: number; busy?: boolean } = $props();

  const { renderer, scene, camera, autoRender } = useThrelte();

  // Take over rendering from Threlte so we can run post-processing
  autoRender.set(false);

  const cam = new PerspectiveCamera(50, 1, 0.1, 100);
  cam.position.set(0, 0, 3.0);
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

  useTask((delta) => {
    if (!mesh) return;

    elapsed += delta;

    // Detect new pulse → spike excitement
    if (pulse !== lastPulse) {
      lastPulse = pulse;
      excitement = Math.min(excitement + 0.5, 1.0);
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

    // Rotation: continuous spin, faster when busy
    const spinSpeed = 0.5 + (busy ? 6.0 : 0) + excitement * 4.0;
    mesh.rotation.y += delta * spinSpeed;
    mesh.rotation.x = Math.sin(elapsed * 0.8) * 0.3;

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
