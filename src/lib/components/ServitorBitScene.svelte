<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		PerspectiveCamera,
		ShaderMaterial,
		Color,
		IcosahedronGeometry,
		Vector3
	} from 'three';
	import type { Mesh } from 'three';

	let { pulse = 0, busy = false }: { pulse?: number; busy?: boolean } = $props();

	const { camera } = useThrelte();

	const cam = new PerspectiveCamera(50, 1, 0.1, 100);
	cam.position.set(0, 0, 3.5);
	camera.set(cam);

	const vertexShader = `
		uniform float uTime;
		uniform float uExcitement;
		varying vec3 vNormal;
		varying vec3 vWorldNormal;
		varying float vDisplacement;

		// Simple 3D noise via sin permutations
		float noise3(vec3 p) {
			return sin(p.x * 1.7 + p.y * 2.3) * sin(p.y * 1.3 + p.z * 3.1) * sin(p.z * 2.7 + p.x * 1.1);
		}

		void main() {
			// Per-vertex spike displacement along normal
			float n = noise3(position * 2.0 + uTime * 3.0);
			float spike = n * uExcitement * 0.6;
			vDisplacement = spike;

			vec3 displaced = position + normal * spike;

			// Transform normal to world space for lighting
			vNormal = normalize(normalMatrix * normal);
			vWorldNormal = vNormal;

			gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
		}
	`;

	const fragmentShader = `
		uniform vec3 uBaseColor;
		uniform vec3 uHotColor;
		uniform float uExcitement;
		uniform vec3 uLightDir;
		varying vec3 vNormal;
		varying vec3 vWorldNormal;
		varying float vDisplacement;

		void main() {
			// Directional light diffuse
			float ndotl = dot(normalize(vWorldNormal), normalize(uLightDir));
			float diffuse = max(ndotl, 0.0);

			// Ambient + diffuse
			float ambient = 0.25;
			float light = ambient + diffuse * 0.75;

			// Mix color based on excitement + per-vertex displacement
			float mix_t = clamp(uExcitement + abs(vDisplacement) * 1.5, 0.0, 1.0);
			vec3 color = mix(uBaseColor, uHotColor, mix_t);

			// Apply lighting + glow when excited
			float glow = 1.0 + uExcitement * 0.6;
			gl_FragColor = vec4(color * light * glow, 1.0);
		}
	`;

	const baseColor = new Color(0.6, 0.2, 0.35); // muted pink
	const hotColor = new Color(1.0, 0.4, 0.65); // hot pink

	const material = new ShaderMaterial({
		uniforms: {
			uTime: { value: 0 },
			uExcitement: { value: 0 },
			uBaseColor: { value: baseColor },
			uHotColor: { value: hotColor },
			uLightDir: { value: new Vector3(0.5, 1.0, 0.8).normalize() }
		},
		vertexShader,
		fragmentShader
	});

	const geometry = new IcosahedronGeometry(1, 0);

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

		// Three-tier animation: idle / busy / excited
		const idleSpeed = 0.15;
		const busySpeed = busy ? 1.0 : 0;
		const excitedSpeed = excitement * 4;
		const rotSpeed = idleSpeed + busySpeed + excitedSpeed;

		mesh.rotation.x += delta * rotSpeed * 0.7;
		mesh.rotation.y += delta * rotSpeed;

		// Brightness boost when busy, more when excited
		const busyExcitement = busy ? 0.15 : 0;
		const effectiveExcitement = Math.max(excitement, busyExcitement);

		material.uniforms.uTime.value = elapsed;
		material.uniforms.uExcitement.value = effectiveExcitement;

		// Float: gentle wandering position, amplified when excited
		const floatAmp = 0.05 + excitement * 0.25;
		mesh.position.x = Math.sin(elapsed * 0.7) * floatAmp;
		mesh.position.y = Math.cos(elapsed * 0.9) * floatAmp;

		// Scale: pulse on excitement
		const pulseScale = 1 + excitement * 0.25;
		mesh.scale.set(pulseScale, pulseScale, pulseScale);
	});
</script>

<T.Mesh bind:ref={mesh} {geometry} {material} />
