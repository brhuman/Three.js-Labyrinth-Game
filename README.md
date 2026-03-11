## Neon Labyrinth

Neon Labyrinth is a small experimental 3D first‑person maze game built with **Three.js** and **Vite**. It started as a playground to explore modern WebGL rendering, procedural maze generation, and FPS-style controls directly in the browser.

You navigate a dynamically generated labyrinth, collect keys and power‑ups, avoid a pursuing monster, and try to reach the exit as the maze scales up in size and difficulty. The project was created mainly for fun and to get hands‑on experience with a lightweight 3D engine, camera controls, lighting, shadows, and simple game feel tuning.

### Tech stack
- **Three.js** for 3D rendering, lighting, shadows, and materials  
- **Vite** for fast local development and bundling  
- **Vanilla JS + DOM** for UI, HUD, and pointer lock controls  
- **Vitest** for a few lightweight gameplay/maze tests

### Running locally
- **Install**: `npm install`  
- **Dev server**: `npm run dev` then open the printed URL in your browser  
- **Tests**: `npm test`

Mouse + WASD/Arrow keys to move, `Space` to jump, `Ctrl/C` to crouch. If someone stumbles upon this repo, treat it as a focused tech demo rather than a polished production game.
