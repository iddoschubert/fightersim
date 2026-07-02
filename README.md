# Fighter Sim

An arcade-style 3D fighter jet combat game for the browser, built with TypeScript, Vite, and Three.js.

Fly through an abandoned futuristic city, fight enemy aircraft, earn coins, unlock better jets, and host LAN multiplayer sessions for other players on the same network.

## Highlights

- True 3D third-person flight combat
- Procedural futuristic city with skyscrapers, roads, rubble, smoke, and collision obstacles
- Campaign levels with AI enemy fighters
- Upgrade progression with coins, Victory Points, and unlockable jets
- LAN multiplayer using a lightweight WebSocket relay
- HUD with health, coins, level progress, enemy count, jet info, Victory Points, and radar
- Flares, twin machine-gun fire, explosions, smoke, sparks, and engine glow

## Quick Start

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## LAN Multiplayer

Start the LAN server:

```bash
npm run multiplayer
```

Open the shown URL on the host computer, or use the host machine's local network IP from another computer on the same network:

```text
http://<host-ip>:8787/
```

Then choose **LAN Multiplayer** from the game menu.

The multiplayer server is intended for trusted local networks. It does not include authentication or internet-facing hardening.

## Controls

| Action | Key |
| --- | --- |
| Pitch up / down | `W` / `S` |
| Roll left / right | `A` / `D` |
| Fire guns | `Space` |
| Drop flare | `Q` |

## Gameplay

Destroy all enemy jets to complete a level and earn a Victory Point. Victory Points can upgrade speed, fire rate, or maximum health.

Coins are earned from hits and enemy kills. Spend coins to unlock newer, stronger fighter jets. Each upgraded jet improves health, speed, and fire rate while visually progressing from older aircraft toward modern stealth fighters.

Flares can blind enemies that are close behind you, forcing them to break chase and stop firing for a short time.

## Project Structure

```text
src/
  aircraft.ts      Procedural aircraft models and hitboxes
  config.ts        Gameplay constants, levels, jets, and base stats
  effects.ts       Explosions, muzzle flashes, smoke, sparks, and impacts
  main.ts          Game loop, controls, combat, AI, campaign, multiplayer client
  progression.ts   Jet unlocks and player stat calculation
  save.ts          localStorage save handling
  style.css        HUD, menus, radar, and page styling
  ui.ts            HUD/menu rendering
  world.ts         Procedural city, obstacles, and spawn points
server/
  server.js        Static file server and WebSocket LAN relay
```

## Development Notes

- The game uses procedural Three.js geometry and does not require external art assets.
- Persistent campaign progress is stored in browser `localStorage`.
- Run `npm run build` before sharing changes.
- Generated folders such as `dist/` and `node_modules/` should not be edited directly.
