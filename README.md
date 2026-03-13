# ☠️ DEADLY LABYRINTH

**[Live Demo: deadly-labyrinth.vercel.app](https://deadly-labyrinth.vercel.app/)**

A dark, atmospheric first-person 3D maze game built in the browser with **Three.js** and **Vite**. Explore a procedurally generated stone labyrinth, collect keys, grab power-ups, and escape before the monster hunts you down.

![Three.js](https://img.shields.io/badge/Three.js-black?logo=three.js) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) ![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?logo=javascript&logoColor=black)

---

## 🎮 Gameplay

- Navigate a **procedurally generated stone maze** that grows larger every level.
- **Collect all keys** to unlock the exit door.
- **Grab power-ups** — speed boost (blue) and monster slow-down (yellow).
- **Survive the monster** — it spawns after a countdown and chases you with improved collision-aware pathfinding.
- Reach the **exit portal** to advance to the next level.
- A **fog of war** minimap reveals only explored areas.

---

## ✨ Features

### Visuals & Graphics Settings
- **Advanced Graphics Menu**: Granular control over Resolution (Render Scale), Shadow Quality (Up to Ultra 2048x2048), and Particle Effects.
- **Master Quality Presets**: Quick-switch between Low, Medium, High, and Ultra profiles.
- **Dynamic night sky**: procedural star field, pulsing moon light, and drifting clouds.
- **Atmospheric Lighting**: Wall torches with flickering animations and level-based aggressive darkening.

### Gameplay Systems
- **Radius-Based Monster AI**: The monster uses robust collision detection to avoid getting stuck on corners and a recovery system for complex geometry.
- **Procedural Level Design**: Mazes scale in size and complexity as level increases.
- **Survival Mechanics**: Flashlight battery management, crouching under low beams, and spatial 3D audio cues.

### Audio
- **3D positional monster sound** — audible up to 210 units.
- **Generative synth**: pitch-sweeping demon wails — unique every time.
- **Atmospheric SFX**: screams, footsteps, and environment ambiance.

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
| `F` | Flashlight |
| `L` | Fullscreen |
| `Esc` | Pause |

---

## 🛠️ Tech Stack

| Tool | Role |
|------|------|
| [Three.js](https://threejs.org) | 3D engine, lighting, shadows, materials, audio |
| [Vite](https://vitejs.dev) | Dev server & build tool |
| Vanilla JS + CSS3 | Custom UI, Red-themed Labyrinth UI, responsive HUD |
| Web Audio API | Generative positional audio |

---

## 🚀 Running Locally

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test
```

---

## 📁 Project Structure

```
├── index.html          # Entry point + HUD markup
├── style.css           # Unified "Deadly Labyrinth" red theme styles
├── src/
│   ├── main.js         # Core Game Engine
│   ├── translations.js # Localization strings (EN, RU, UA)
│   └── utils.js        # Pathfinding and math utilities
├── public/
│   ├── textures/       # Environmental assets
│   └── sounds/         # Audio assets
└── gameplay_test.mjs   # Vitest gameplay tests
```

---

## 📜 License

MIT — built for intensive first-person horror exploration.
