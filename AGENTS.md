# Repository Guidelines

## Project Structure & Module Organization

This repository contains a browser-based 3D fighter game built with Vite, TypeScript, and Three.js.

- `index.html` defines the game canvas, HUD, and menu shell.
- `src/main.ts` owns the game loop, controls, combat, campaign flow, and LAN multiplayer client.
- `src/aircraft.ts`, `src/world.ts`, and `src/effects.ts` contain procedural 3D models, city generation, collisions, and visual effects.
- `src/ui.ts`, `src/save.ts`, and `src/progression.ts` handle HUD/menu behavior, localStorage saves, upgrades, and jet purchases.
- `src/config.ts` centralizes gameplay constants, levels, jets, and base stats.
- `server/server.js` serves the built app and hosts the WebSocket LAN multiplayer relay.
- Generated output lives in `dist/`; dependencies live in `node_modules/`. Do not edit either directly.

There is currently no dedicated `tests/` directory or static asset directory.

## Build, Test, and Development Commands

- `npm install`: install project dependencies.
- `npm run dev`: start the Vite development server on the local network.
- `npm run build`: run TypeScript checks and create the production build in `dist/`.
- `npm run preview`: serve the production build locally with Vite.
- `npm run multiplayer`: build the app, then start the LAN multiplayer server on port `8787`.

Use `npm run build` before handing off changes.

## Coding Style & Naming Conventions

Use TypeScript modules with `strict` compiler settings. Keep code ASCII unless existing content requires otherwise. Use two-space indentation in JSON and follow the existing TypeScript style: `PascalCase` for classes and types, `camelCase` for functions, variables, and object fields.

Prefer config-driven gameplay changes in `src/config.ts` over hard-coded values in systems. Keep Three.js object ownership clear: create objects in the relevant system and remove them from the scene when destroyed.

## Testing Guidelines

No automated test framework is currently configured. Validate changes with:

1. `npm run build`
2. Manual browser testing for campaign controls, shooting, collisions, upgrades, and LAN multiplayer joins.

For multiplayer work, test with at least two browser clients connected to `http://<host-ip>:8787/`.

## Commit & Pull Request Guidelines

This directory is not currently initialized as a Git repository, so no commit history conventions exist. Use concise, imperative commit messages if Git is added later, such as `Add LAN multiplayer relay`.

Pull requests should include a short summary, manual test notes, screenshots or screen recordings for visual changes, and any known gameplay tradeoffs.

## Security & Configuration Tips

LAN multiplayer is intended for trusted local networks only. The WebSocket server does not provide authentication, persistence, or internet-facing hardening.
