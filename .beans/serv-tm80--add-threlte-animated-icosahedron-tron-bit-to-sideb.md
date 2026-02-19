---
# serv-tm80
title: Add Threlte animated icosahedron (Tron Bit) to sidebar
status: completed
type: feature
priority: normal
created_at: 2026-02-19T20:32:03Z
updated_at: 2026-02-19T21:02:07Z
---

Add an animated wireframe icosahedron in the sidebar header that pulses on SSE events, inspired by Bit from Tron.

## Tasks
- [x] Install Threlte + Three.js packages
- [x] Create ServitorBitScene.svelte (animation logic)
- [x] Create ServitorBit.svelte (Canvas wrapper)
- [x] Fix ServitorBit.svelte (missing T import)
- [x] Create activity store (pulse counter)
- [x] Integrate ServitorBit into Sidebar header
- [x] Wire workspace page SSE handlers to increment pulse
- [x] Type-check and commit

## Summary of Changes

Added ServitorBit as the composer prompt — a 3D animated icosahedron with custom shaders, three-tier animation (idle/busy/excited), click interaction with heart particles, and activity store for SSE event bridging.
