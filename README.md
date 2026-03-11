# ☠️ Death Labyrinth

**[Live Demo: tthree-js-labyrinth-game.vercel.app](https://tthree-js-labyrinth-game.vercel.app/)**

A dark, atmospheric first-person 3D maze game built in the browser with **Three.js** and **Vite**. Explore a procedurally generated stone labyrinth, collect keys, grab power-ups, and escape before the monster hunts you down.

![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) ![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?logo=javascript&logoColor=black)

---

## 🎮 Gameplay

- Navigate a **procedurally generated stone maze** that grows larger every level
- **Collect all keys** to unlock the exit door
- **Grab power-ups** — speed boost (blue) and monster slow-down (yellow)
- **Survive the monster** — it spawns after a countdown and chases you through the maze
- Reach the **exit portal** to advance to the next level
- A **fog of war** minimap reveals only explored areas (toggle in menu)

---

## ✨ Features

### Visuals
- Fully 3D first-person view with **real-time shadows** (4096×4096 shadow map)
- **Dynamic night sky**: procedural star field (3000 points, twinkling), animated moon sprite, drifting cloud layer
- **Torch lighting** along the walls with flickering flame animation
- **Stone brick walls** with procedural texture and randomized height variation
- Atmospheric **exponential fog** and dark ambient lighting
- **Crouch beams** you must duck under with `C`

### Gameplay Systems
- **Procedural maze generation** with guaranteed solvability (DFS algorithm), scales per level
- **PointerLock controls** for immersive FPS mouse look
- **Physics**: gravity, jumping, crouching, collision detection
- **Monster AI**: pathfinds toward the player; positional 3D audio gets louder as it approaches
- **Power-up system**: speed boost and monster slow-down with on-screen timers
- **Key + locked door** puzzle system per level

### Audio
- **3D positional monster sound** — audible up to 210 units, gets louder as it approaches
- **Generative demon howl synthesizer**: pitch-sweeping wails with vibrato, distortion, and cave reverb — unique every time
- **Scream on death**, footstep-style effects
- Full **mute toggle** (button or `M` key)

### Performance
- Monster mesh **pre-built and cached** at startup — no freeze on spawn
- Items toggled via `visible` flag instead of scene add/remove — no micro-freezes on pickup
- Stars rendered in a **single draw call** via `THREE.Points`
- Torch shadows **disabled** to keep FPS high (60–120 FPS on modern hardware)
- **FPS counter** always visible in HUD

---

## 🕹️ Controls

| Key | Action |
|-----|--------|
| `W A S D` / Arrows | Move |
| Mouse | Look |
| `Space` | Jump |
| `C` / `Ctrl` | Crouch |
| `Enter` | Start / Restart |
| `M` | Mute / Unmute |
| `F` | Fullscreen |

---

## 🛠️ Tech Stack

| Tool | Role |
|------|------|
| [Three.js](https://threejs.org) | 3D rendering, lighting, shadows, materials, audio |
| [Vite](https://vitejs.dev) | Dev server & bundler |
| Vanilla JS + DOM | UI, HUD, pointer lock |
| Web Audio API | Generative positional monster sound |
| [Vitest](https://vitest.dev) | Maze generation & gameplay unit tests |

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start dev server (opens at http://localhost:5174)
npm run dev

# Run tests
npm test
```

> Requires a modern browser with WebGL2 and PointerLock API support (Chrome, Firefox, Edge).

---

## 📁 Project Structure

```
├── index.html          # Entry point + HUD markup
├── style.css           # All UI/HUD styles
├── src/
│   └── main.js         # Game engine (single-file, ~1700 lines)
├── public/
│   ├── textures/       # Moon, wall, cloud, key textures
│   └── sounds/         # Monster ambient, scream SFX
└── gameplay_test.mjs   # Vitest gameplay tests
```

---

## 📜 License

MIT — built for fun and learning. Feel free to fork and extend it.
