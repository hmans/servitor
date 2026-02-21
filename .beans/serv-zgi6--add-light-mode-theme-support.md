---
# serv-zgi6
title: Add light mode theme support
status: completed
type: feature
priority: normal
created_at: 2026-02-21T07:17:57Z
updated_at: 2026-02-21T07:46:45Z
---

Add a light mode theme alternative to the current dark TUI-inspired aesthetic. Users should be able to toggle between light and dark modes.

## Approach

Define semantic CSS custom properties for all color roles, register them as Tailwind v4 theme tokens, replace hardcoded zinc classes in all components, and add a toggle button.

## Tasks

## Summary of Changes

## Summary of Changes

Introduced a complete light mode theming system:

- **Semantic color tokens**: Defined CSS custom properties for all color roles (surface, fg, edge) with dark/light variants in layout.css, registered as Tailwind v4 theme colors via @theme
- **Theme store**: Created theme.svelte.ts with reactive state, localStorage persistence, and toggle function
- **Flash prevention**: Added inline script in app.html to apply theme class before first paint
- **Theme toggle**: Sun/moon icon button in sidebar header
- **Component migration**: Replaced all hardcoded zinc-* Tailwind classes with semantic tokens (bg-surface, text-fg, border-edge, etc.) across all 18 components and 4 route files
- **Markdown styles**: Updated all hardcoded RGB values to use CSS custom properties
- Build passes, all 124 tests pass
