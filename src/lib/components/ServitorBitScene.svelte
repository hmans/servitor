<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { PerspectiveCamera, MeshStandardMaterial, IcosahedronGeometry } from 'three';
	import type { Mesh } from 'three';

	let { pulse = 0, busy = false }: { pulse?: number; busy?: boolean } = $props();

	const { camera } = useThrelte();

	const cam = new PerspectiveCamera(50, 1, 0.1, 100);
	cam.position.set(0, 0, 3.5);
	camera.set(cam);

	// Flat-shaded geometry: toNonIndexed gives each face its own vertices
	const baseGeo = new IcosahedronGeometry(1, 0);
	const geometry = baseGeo.toNonIndexed();
	geometry.computeVertexNormals();

	const material = new MeshStandardMaterial({
		color: 0xec4899,
		flatShading: true,
		roughness: 0.5,
		metalness: 0.1,
		emissive: 0xec4899,
		emissiveIntensity: 0
	});

	let mesh: Mesh | undefined = $state();
	let lastPulse = 0;
	let excitement = 0;
	let elapsed = 0;

	useTask((delta) => {
		if (!mesh) return;

		elapsed += delta;

		// Detect new pulse
		if (pulse !== lastPulse) {
			lastPulse = pulse;
			excitement = Math.min(excitement + 0.5, 1.0);
		}

		// Decay excitement
		excitement = Math.max(0, excitement - delta * 0.7);

		// Rotation: noise-driven axes, speed scales with activity
		const idleSpeed = 0.15;
		const busySpeed = busy ? 3.0 : 0;
		const excitedSpeed = excitement * 8;
		const rotSpeed = idleSpeed + busySpeed + excitedSpeed;

		// Noise-driven rotation axis weights — each axis wobbles independently
		const nx = Math.sin(elapsed * 1.3) * Math.cos(elapsed * 0.7);
		const ny = Math.cos(elapsed * 0.9) * Math.sin(elapsed * 1.1);
		const nz = Math.sin(elapsed * 0.6) * Math.cos(elapsed * 1.7);

		mesh.rotation.x += delta * rotSpeed * nx;
		mesh.rotation.y += delta * rotSpeed * ny;
		mesh.rotation.z += delta * rotSpeed * nz;

		// Float: layered noise for organic wandering
		const baseAmp = 0.15;
		const excitedAmp = baseAmp + excitement * 0.3;
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

		// Emissive glow when excited
		material.emissiveIntensity = excitement * 0.6;
	});
</script>

<T.AmbientLight intensity={0.3} />
<T.DirectionalLight position={[3, 5, 4]} intensity={1.0} />

<T.Mesh bind:ref={mesh} {geometry} {material} />
