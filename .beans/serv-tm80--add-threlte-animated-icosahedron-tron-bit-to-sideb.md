---
# serv-tm80
title: Add Threlte animated icosahedron (Tron Bit) to sidebar
status: in-progress
type: feature
priority: normal
created_at: 2026-02-19T20:32:03Z
updated_at: 2026-02-19T20:35:25Z
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
