# Servitor

## The Basics

- A parallel agent orchestrator for high-velocity software development.
- SvelteKit full-stack web application.
- User can create one or multiple code projects (basically just a path to a git repository on the same machine.)
- Designed to be run locally, but also on a remote VM (with repositories on that VM).
- Integrates with GitHub for pull requests, issues, and project management.

## Workspaces

- User can create, interact with, close etc. workspaces
- Each workspace is a git worktree of the project it belongs to
- Workspaces can contain one or more agent sessions
