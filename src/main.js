import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls';
import { Maze } from './maze.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.controls = null;
        this.mazeSize = 25; // Increased for Phase 9
        this.grid = null;
        this.walls = [];
        this.goal = null;
        this.level = 1;
        this.playerKeys = 0; // Phase 9 keys
        this.startTime = null;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isCrouching = false;
        this.canJump = true;
        
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        
        this.baseHeight = 0.7; // Lowered normal camera height
        this.crouchHeight = 0.35; // Lowered crouching camera height
        this.currentHeight = this.baseHeight;
        
        this.prevTime = performance.now();
        
        // Minimap / Fog of War
        this.minimapCanvas = document.getElementById('minimap');
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.explorationGrid = [];
        this.minimapSize = 150;
        this.minimapCanvas.width = this.minimapSize;
        this.minimapCanvas.height = this.minimapSize;

        // Textures
        this.textureLoader = new THREE.TextureLoader();
        this.textures = {
            brick: this.textureLoader.load('/textures/brick.png'),
            floor: this.textureLoader.load('/textures/floor.png'),
            clouds: this.textureLoader.load('/textures/clouds.png')
        };
        
        // Monster
        this.monster = null;
        this.isGameOver = false;
        this.monsterSpawned = false;
        this.baseMonsterSpeed = 1.6;
        this.monsterSpeed = this.baseMonsterSpeed;
        
        // Powerups & Progression
        this.powerups = [];
        this.keys = [];
        this.lockedDoors = [];
        this.basePlayerSpeed = 40.0;
        this.playerSpeed = this.basePlayerSpeed;
        
        this.textures.brick.wrapS = this.textures.brick.wrapT = THREE.RepeatWrapping;
        this.textures.brick.repeat.set(1, 1);
        this.textures.floor.wrapS = this.textures.floor.wrapT = THREE.RepeatWrapping;
        this.textures.floor.repeat.set(10, 10);
        this.textures.clouds.wrapS = this.textures.clouds.wrapT = THREE.RepeatWrapping;

        this.init();
    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x87ceeb);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.02);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.sunLight.castShadow = true;
        // Max out shadow map for crispness
        this.sunLight.shadow.mapSize.width = 8192;
        this.sunLight.shadow.mapSize.height = 8192;
        this.sunLight.shadow.bias = 0; // Reset bias
        this.sunLight.shadow.normalBias = 0.02; // Keep normal bias low
        this.sunLight.shadow.radius = 1; // Sharper edges
        this.updateSunFrustum();
        this.scene.add(this.sunLight);

        this.scene.add(this.camera);

        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ 
            map: this.textures.clouds, 
            side: THREE.BackSide 
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(this.sky);

        this.controls = new PointerLockControls(this.camera, document.body);
        
        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');

        const startGame = () => {
            document.getElementById('game-over').style.display = 'none';
            this.isGameOver = false; // Add reset here
            
            // If monster is hanging around from death, clear it for the respawn
            if (this.monster) {
                this.scene.remove(this.monster);
                this.monster = null;
                this.monsterSpawned = false;
            }
            
            this.controls.lock();
        };

        startBtn.addEventListener('click', startGame);
        restartBtn.addEventListener('click', startGame);
        
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Enter' && !this.controls.isLocked) {
                startGame();
            }
        });

        this.controls.addEventListener('lock', () => {
            document.getElementById('menu').style.display = 'none';
            document.getElementById('game-over').style.display = 'none';
            document.getElementById('hud').style.display = 'flex';
            document.getElementById('crosshair').style.display = 'block';
            this.startTime = Date.now(); // Always reset start time when locking into a run
        });

        this.controls.addEventListener('unlock', () => {
            // Only show menu if not game over (game over shows its own modal)
            if (!this.isGameOver) {
                document.getElementById('menu').style.display = 'block';
            }
            document.getElementById('hud').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
        });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('resize', () => this.onWindowResize());

        this.buildMaze();
        this.animate();
    }

    updateSunFrustum() {
        const d = this.mazeSize;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.camera.near = 0.1;
        this.sunLight.shadow.camera.far = 100;
        this.sunLight.shadow.camera.updateProjectionMatrix();
    }

    buildMaze() {
        this.updateSunFrustum();
        const mazeGen = new Maze(this.mazeSize, this.mazeSize);
        this.grid = mazeGen.generate();
        
        // Initialize exploration grid
        this.explorationGrid = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));

        const wallMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.brick,
            shininess: 5
        });

        const floorGeometry = new THREE.PlaneGeometry(this.mazeSize, this.mazeSize);
        const floorMaterial = new THREE.MeshPhongMaterial({ map: this.textures.floor });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(this.mazeSize / 2 - 0.5, -0.5, this.mazeSize / 2 - 0.5);
        floor.receiveShadow = true;
        this.scene.add(floor);

        const emptySpaces = [];
        
        for (let y = 0; y < this.mazeSize; y++) {
            for (let x = 0; x < this.mazeSize; x++) {
                if (this.grid[y][x] === 1) {
                    this.createUnevenWall(x, y, wallMaterial);
                } else {
                    // Collect empty spaces for powerups and keys
                    const isStart = (x === 0 && y === 1);
                    const isEnd = (x === this.mazeSize - 1 && y === this.mazeSize - 2);
                    
                    if (!isStart && !isEnd) {
                        emptySpaces.push({x, y});
                    }
                }
            }
        }

        // Find main path from start to end
        const startPathX = 0, startPathY = 1;
        const endPathX = this.mazeSize - 1, endPathY = this.mazeSize - 2;
        const mainPath = this.findPathBFS(endPathX, endPathY, startPathX, startPathY); // Reverse to get from exit to start
        
        const numLocks = Math.min(this.level, 3); // Max 3 locks
        
        // Pick locations for doors on the main path
        // To ensure we have space between them, pick indices spaced out
        const doorPositions = [];
        if (mainPath.length > numLocks * 4) {
             const step = Math.floor((mainPath.length - 4) / numLocks);
             for (let i = 0; i < numLocks; i++) {
                 // Start index + offset. Index 0 is exit.
                 const pathIndex = 2 + i * step + Math.floor(Math.random() * (step/2));
                 doorPositions.push(mainPath[pathIndex]);
             }
        }
        
        // Replace empty spaces with doors and spawn a key BEFORE the door 
        // We evaluate accessible spaces using BFS from start that STOPS at all door positions
        const doorSet = new Set(doorPositions.map(p => `${p[0]},${p[1]}`));
        
        let accessibleFromStart = this.getAccessibleArea(startPathX, startPathY, doorSet);
        
        for (let i = 0; i < doorPositions.length; i++) {
             const pos = doorPositions[i];
             
             // The key for this door MUST be in the currently accessible area
             if (accessibleFromStart.length > 0) {
                 const keyIndex = Math.floor(Math.random() * accessibleFromStart.length);
                 const keyPos = accessibleFromStart[keyIndex];
                 
                 // Spawn Key
                 this.spawnKey(keyPos[0], keyPos[1]);
                 
                 // Remove from emptySpaces so we don't spawn powerups on it
                 const eIdx = emptySpaces.findIndex(e => e.x === keyPos[0] && e.y === keyPos[1]);
                 if (eIdx !== -1) emptySpaces.splice(eIdx, 1);
             }
             
             // Now spawn the door itself
             this.spawnLockedDoor(pos[0], pos[1]);
             
             // For the next door (if any), the accessible area now EXTENDS past this current door,
             // but stops at the REMAINING doors.
             doorSet.delete(`${pos[0]},${pos[1]}`);
             accessibleFromStart = this.getAccessibleArea(startPathX, startPathY, doorSet);
        }

        // Shuffle remaining empty spaces and spawn exactly one of each powerup
        emptySpaces.sort(() => Math.random() - 0.5);
        if (emptySpaces.length >= 2) {
            this.spawnPowerup(emptySpaces[0].x, emptySpaces[0].y, 'speed');
            this.spawnPowerup(emptySpaces[1].x, emptySpaces[1].y, 'slow');
        }

        // Start Door (Closed)
        this.createDoor(-0.4, 1, false);

        // End Door (Open)
        this.createDoor(this.mazeSize - 1, this.mazeSize - 2, true);

        // Goal zone inside the open door
        const goalGeometry = new THREE.BoxGeometry(0.2, 1.8, 0.8);
        const goalMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            emissive: 0x00ff00,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.3
        });
        this.goal = new THREE.Mesh(goalGeometry, goalMaterial);
        this.goal.position.set(this.mazeSize - 1, 0.4, this.mazeSize - 2);
        this.scene.add(this.goal);

        document.getElementById('level').textContent = this.level;

        this.camera.position.set(0, this.baseHeight, 1);
        this.camera.lookAt(1, this.baseHeight, 1);
    }

    createDoor(x, z, isOpen) {
        const doorMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.floor,
            color: 0x885533, // Tint to make it look like dark wood if texture is light
            shininess: 10
        }); 
        
        if (!isOpen) {
            const doorGeo = new THREE.BoxGeometry(0.1, 2, 1);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            door.position.set(x, 0.5, z);
            door.castShadow = true;
            door.receiveShadow = true;
            this.scene.add(door);
        } else {
            // Open door frame
            const frameGeo = new THREE.BoxGeometry(0.1, 2, 0.2);
            const leftFrame = new THREE.Mesh(frameGeo, doorMaterial);
            leftFrame.position.set(x, 0.5, z - 0.4);
            leftFrame.castShadow = true;
            leftFrame.receiveShadow = true;
            this.scene.add(leftFrame);

            const rightFrame = new THREE.Mesh(frameGeo, doorMaterial);
            rightFrame.position.set(x, 0.5, z + 0.4);
            rightFrame.castShadow = true;
            rightFrame.receiveShadow = true;
            this.scene.add(rightFrame);

            const topGeo = new THREE.BoxGeometry(0.1, 0.2, 1);
            const topFrame = new THREE.Mesh(topGeo, doorMaterial);
            topFrame.position.set(x, 1.6, z);
            topFrame.castShadow = true;
            topFrame.receiveShadow = true;
            this.scene.add(topFrame);
        }
    }

    createUnevenWall(x, y, material) {
        // ... (existing wall code)
        const height = 2 + Math.random() * 0.4;
        const geo = new THREE.BoxGeometry(1, height, 1);
        const wall = new THREE.Mesh(geo, material);
        wall.position.set(x, height / 2 - 0.5, y);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.scene.add(wall);

        if (Math.random() > 0.4) {
            const numBricks = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < numBricks; i++) {
                const brickHeight = 0.15 + Math.random() * 0.1;
                const brickGeo = new THREE.BoxGeometry(0.4, brickHeight, 0.25);
                const brick = new THREE.Mesh(brickGeo, material);
                brick.position.set(
                    x + (Math.random() - 0.5) * 0.5,
                    height - 0.5 + brickHeight / 2,
                    y + (Math.random() - 0.5) * 0.5
                );
                brick.castShadow = true;
                brick.receiveShadow = true;
                this.scene.add(brick);
            }
        }
    }

    createCoinTexture(text, colorStr) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = colorStr;
        ctx.beginPath();
        ctx.arc(64, 64, 60, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 5;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 45px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    spawnPowerup(x, z, type) {
        const isSpeed = type === 'speed';
        const color = isSpeed ? 0x0088ff : 0xffff00;
        const text = isSpeed ? 'SPD' : 'SLW';
        const cssColor = isSpeed ? '#0088ff' : '#aaaa00';
        
        const tex = this.createCoinTexture(text, cssColor);
        
        const geo = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16);
        const mat = new THREE.MeshPhongMaterial({ 
            map: tex,
            color: 0xffffff,
            emissive: color,
            emissiveIntensity: 0.2
        });
        
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2; // Stand the coin up
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(x, 0.5, z);
        
        const light = new THREE.PointLight(color, 1, 3);
        mesh.add(light);
        
        mesh.userData = { type: type, isCoin: true };
        
        this.scene.add(mesh);
        this.powerups.push(mesh);
    }

    spawnKey(x, z) {
        // Simple distinct visual for key
        const geo = new THREE.TorusGeometry(0.15, 0.05, 8, 16);
        const mat = new THREE.MeshPhongMaterial({ 
            color: 0xffd700, // Gold
            emissive: 0xffd700,
            emissiveIntensity: 0.5
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z);
        
        const light = new THREE.PointLight(0xffd700, 1, 3);
        mesh.add(light);
        
        mesh.userData = { isKey: true };
        this.scene.add(mesh);
        this.keys.push(mesh);
    }

    spawnLockedDoor(x, z) {
        const geo = new THREE.BoxGeometry(1, 2, 1);
        const mat = new THREE.MeshPhongMaterial({ 
            color: 0x550000, // Dark red/locked
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z); // Center it in the tile
        mesh.userData = { isLockedDoor: true, gridX: x, gridY: z };
        
        // Add a lock icon/cube to the door
        const lockGeo = new THREE.BoxGeometry(0.2, 0.3, 0.2);
        const lockMat = new THREE.MeshPhongMaterial({ color: 0xffd700 });
        const lockMesh = new THREE.Mesh(lockGeo, lockMat);
        lockMesh.position.set(0, 0, 0);
        mesh.add(lockMesh);

        this.scene.add(mesh);
        this.lockedDoors.push(mesh);
        
        // Mark it on the grid so collision works!
        // We use '2' for locked door so it acts like a wall but we can identify it later
        this.grid[z][x] = 2;
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = true; break;
            case 'Space': 
                if (this.canJump) {
                    this.velocity.y += 6; // Smoother, lower initial velocity
                    this.canJump = false;
                }
                break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.isCrouching = true;
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': this.moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': this.moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': this.moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': this.moveRight = false; break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.isCrouching = false;
                break;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    checkPlayerCollision(x, z) {
        const r = 0.35; // Player radius
        // Grid cells to check based on player bounding box
        const minX = Math.floor(x - r + 0.5);
        const maxX = Math.floor(x + r + 0.5);
        const minZ = Math.floor(z - r + 0.5);
        const maxZ = Math.floor(z + r + 0.5);
        
        for (let gy = minZ; gy <= maxZ; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                // STRICT BOUNDARY CHECK
                if (gx < 0 || gx >= this.mazeSize || gy < 0 || gy >= this.mazeSize) {
                    return true;
                }
                
                // Wall collision check (1 is wall, 2 is locked door)
                if (this.grid[gy][gx] === 1 || this.grid[gy][gx] === 2) {
                    // Wall center is (gx, gy), size is 1x1
                    // Nearest point on the wall rect to the circle center (x, z)
                    const testX = Math.max(gx - 0.5, Math.min(x, gx + 0.5));
                    const testZ = Math.max(gy - 0.5, Math.min(z, gy + 0.5));
                    
                    const distX = x - testX;
                    const distZ = z - testZ;
                    
                    // Box-Circle intersection
                    if ((distX * distX + distZ * distZ) <= r * r) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        if (this.textures.clouds) {
            this.textures.clouds.offset.x += 0.00005;
            this.textures.clouds.offset.y += 0.00002;
        }

        const time = performance.now();

        // Move the sun slowly to change shadows
        if (this.sunLight) {
            const sunSpeed = 0.00001; // 10x slower
            this.sunLight.position.x = Math.sin(time * sunSpeed) * 30;
            this.sunLight.position.z = Math.cos(time * sunSpeed) * 30;
            this.sunLight.position.y = 40;
        }

        if (this.controls.isLocked && !this.isGameOver) {
            const delta = (time - this.prevTime) / 1000;

            if (this.startTime && !this.monsterSpawned) {
                const elapsed = Date.now() - this.startTime;
                if (elapsed > 5000) {
                    this.spawnMonster();
                    document.getElementById('monster-timer').textContent = "Active!";
                } else {
                    document.getElementById('monster-timer').textContent = ((5000 - elapsed) / 1000).toFixed(1) + "s";
                }
            } else if (this.monsterSpawned) {
                document.getElementById('monster-timer').textContent = "Active!";
            } else {
                document.getElementById('monster-timer').textContent = "5.0s";
            }

            if (this.monsterSpawned) {
                this.updateMonster(delta);
            }

            this.velocity.x -= this.velocity.x * 10.0 * delta;
            this.velocity.z -= this.velocity.z * 10.0 * delta;
            // Gravity
            this.velocity.y -= 9.8 * 4.0 * delta; // Reduced gravity multiplier for smoother jump curve

            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize();

            // Slower movement when crouching
            const speed = this.isCrouching ? this.playerSpeed / 2 : this.playerSpeed;

            if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
            if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

            // Target camera height based on crouch state
            const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;

            // --- POWERUP LOGIC ---
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const pu = this.powerups[i];
                if (pu.userData.isCoin) {
                    pu.rotation.z += delta * 2;
                    // Note: time is from performance.now() which is huge, scale it down
                    pu.position.y = 0.5 + Math.sin(time / 200 + pu.position.x) * 0.1;
                }
                
                const dist = this.camera.position.distanceTo(pu.position);
                if (dist < 0.8) {
                    // Consume
                    this.scene.remove(pu);
                    this.powerups.splice(i, 1);
                    
                    if (pu.userData.type === 'speed') {
                        this.playerSpeed = this.basePlayerSpeed * 1.25;
                    } else if (pu.userData.type === 'slow') {
                        this.monsterSpeed = this.baseMonsterSpeed * 0.5;
                    }
                }
            }

            // --- KEY LOGIC ---
            for (let i = this.keys.length - 1; i >= 0; i--) {
                const keyMesh = this.keys[i];
                keyMesh.rotation.y += delta * 2;
                
                if (this.camera.position.distanceTo(keyMesh.position) < 0.8) {
                    this.scene.remove(keyMesh);
                    this.keys.splice(i, 1);
                    this.playerKeys++;
                    document.getElementById('keys').innerText = this.playerKeys;
                }
            }
            
            // --- DOOR UNLOCK LOGIC ---
            if (this.playerKeys > 0) {
                for (let i = this.lockedDoors.length - 1; i >= 0; i--) {
                    const door = this.lockedDoors[i];
                    if (this.camera.position.distanceTo(door.position) < 1.0) {
                        // Open the door
                        this.scene.remove(door);
                        this.lockedDoors.splice(i, 1);
                        this.playerKeys--;
                        document.getElementById('keys').innerText = this.playerKeys;
                        
                        // Clear collision
                        const dx = door.userData.gridX;
                        const dy = door.userData.gridY;
                        this.grid[dy][dx] = 0;
                        break; // Only open one maximum per frame
                    }
                }
            }

            const oldPos = this.camera.position.clone();
            
            // 1. Calculate intended movement using Three.js built-in camera vectors
            this.controls.moveRight(-this.velocity.x * delta);
            this.controls.moveForward(-this.velocity.z * delta);
            
            const intendedPos = this.camera.position.clone();
            const dx = intendedPos.x - oldPos.x;
            const dz = intendedPos.z - oldPos.z;
            
            // Reset to old pos so we can apply movement independently
            this.camera.position.copy(oldPos);
            
            // X Movement Check
            this.camera.position.x += dx;
            if (this.checkPlayerCollision(this.camera.position.x, this.camera.position.z)) {
                this.camera.position.x = oldPos.x; // Revert X
            }
            
            // Z Movement Check
            this.camera.position.z += dz;
            if (this.checkPlayerCollision(this.camera.position.x, this.camera.position.z)) {
                this.camera.position.z = oldPos.z; // Revert Z
            }

            // Y Movement Check (Gravity and Jumping)
            this.camera.position.y += this.velocity.y * delta;
            if (this.camera.position.y < targetHeight) {
                this.velocity.y = 0;
                this.camera.position.y = targetHeight;
                this.canJump = true;
            } else if (this.camera.position.y > targetHeight && !this.canJump) {
                 // Camera smoothing for when releasing crouch while standing still
                 if (this.velocity.y === 0 && this.camera.position.y < targetHeight + 0.1) {
                     this.camera.position.y += (targetHeight - this.camera.position.y) * 10 * delta;
                 }
            }

            // Debug logs to verify alignment in console
            if (Math.random() < 0.05) { // Log occasionally to not spam
                const gx = Math.round(this.camera.position.x);
                const gy = Math.round(this.camera.position.z);
                console.log(`Player World: (${this.camera.position.x.toFixed(2)}, ${this.camera.position.z.toFixed(2)}) | Grid: [${gy}, ${gx}]`);
            }

            this.updateExploration();
            this.drawMinimap();

            const distToGoal = this.camera.position.distanceTo(this.goal.position);
            // Increased trigger distance to align with walking into the door frame
            if (distToGoal < 0.8) {
                this.nextLevel();
            }

            if (this.startTime) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                document.getElementById('timer').textContent = `${mins}:${secs}`;
            }

            this.prevTime = time;
        }

        if (this.goal) {
            this.goal.rotation.y += 0.02;
            this.goal.position.y = Math.sin(performance.now() * 0.005) * 0.1 + 0.2;
        }

        this.renderer.render(this.scene, this.camera);
    }

    spawnMonster() {
        if (this.monster) return;

        const monsterGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const monsterMat = new THREE.MeshPhongMaterial({ 
            color: 0xff0000, 
            emissive: 0xff0000,
            emissiveIntensity: 1
        });
        
        this.monster = new THREE.Mesh(monsterGeo, monsterMat);
        // Spawn at start
        this.monster.position.set(0, 0.5, 1);
        
        // Add a pulsing point light to the monster
        const monsterLight = new THREE.PointLight(0xff0000, 2, 5);
        this.monster.add(monsterLight);
        
        this.scene.add(this.monster);
        this.monsterSpawned = true;
    }

    findPathBFS(startGridX, startGridY, endGridX, endGridY) {
        if (startGridX === endGridX && startGridY === endGridY) return [];
        
        const queue = [[startGridX, startGridY]];
        const visited = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));
        const parent = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(null));
        
        visited[startGridY][startGridX] = true;
        
        const dirs = [
            {x: 0, y: -1}, {x: 1, y: 0},
            {x: 0, y: 1}, {x: -1, y: 0}
        ];
        
        let found = false;
        
        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            
            if (cx === endGridX && cy === endGridY) {
                found = true;
                break;
            }
            
            for (const dir of dirs) {
                const nx = cx + dir.x;
                const ny = cy + dir.y;
                
                if (nx >= 0 && nx < this.mazeSize && ny >= 0 && ny < this.mazeSize) {
                    if (this.grid[ny][nx] !== 1 && !visited[ny][nx]) {
                        visited[ny][nx] = true;
                        parent[ny][nx] = [cx, cy];
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        
        if (!found) return [];
        
        const path = [];
        let curr = [endGridX, endGridY];
        while (curr !== null && (curr[0] !== startGridX || curr[1] !== startGridY)) {
            path.push(curr);
            curr = parent[curr[1]][curr[0]];
        }
        path.reverse();
        return path;
    }

    getAccessibleArea(startGridX, startGridY, blockedSet) {
        const queue = [[startGridX, startGridY]];
        const visited = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));
        visited[startGridY][startGridX] = true;
        
        const dirs = [
            {x: 0, y: -1}, {x: 1, y: 0},
            {x: 0, y: 1}, {x: -1, y: 0}
        ];
        
        const accessible = [];
        
        while (queue.length > 0) {
            const [cx, cy] = queue.shift();
            
            // Only consider empty space for keys
            if (cx !== startGridX || cy !== startGridY) {
                 accessible.push([cx, cy]);
            }
            
            for (const dir of dirs) {
                const nx = cx + dir.x;
                const ny = cy + dir.y;
                
                if (nx >= 0 && nx < this.mazeSize && ny >= 0 && ny < this.mazeSize) {
                    // Stop at walls (1) and explicit blocked positions (Doors)
                    if (this.grid[ny][nx] !== 1 && !visited[ny][nx] && !blockedSet.has(`${nx},${ny}`)) {
                        visited[ny][nx] = true;
                        queue.push([nx, ny]);
                    }
                }
            }
        }
        
        return accessible;
    }

    updateMonster(delta) {
        if (!this.monsterSpawned || !this.monster || this.isGameOver) return;
        
        const timeOffset = Date.now() / 200;
        this.monster.position.y = 0.5 + Math.sin(timeOffset) * 0.1;

        const mx = Math.floor(Math.max(0, Math.min(this.mazeSize - 1, this.monster.position.x + 0.5)));
        const mz = Math.floor(Math.max(0, Math.min(this.mazeSize - 1, this.monster.position.z + 0.5)));
        
        const px = Math.floor(Math.max(0, Math.min(this.mazeSize - 1, this.camera.position.x + 0.5)));
        const pz = Math.floor(Math.max(0, Math.min(this.mazeSize - 1, this.camera.position.z + 0.5)));
        
        const path = this.findPathBFS(mx, mz, px, pz);
        
        if (path.length > 0) {
            const nextCell = path[0];
            const targetX = nextCell[0];
            const targetZ = nextCell[1];
            
            const dx = targetX - this.monster.position.x;
            const dz = targetZ - this.monster.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist > 0.05) {
                this.monster.position.x += (dx / dist) * this.monsterSpeed * delta;
                this.monster.position.z += (dz / dist) * this.monsterSpeed * delta;
            }
        } else {
            // Direct line of sight fallback or close proximity
            const dx = this.camera.position.x - this.monster.position.x;
            const dz = this.camera.position.z - this.monster.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist > 0.05) {
                this.monster.position.x += (dx / dist) * this.monsterSpeed * delta;
                this.monster.position.z += (dz / dist) * this.monsterSpeed * delta;
            }
        }

        const distToPlayer = this.camera.position.distanceTo(this.monster.position);
        if (distToPlayer < 0.6) {
            this.handleGameOver();
        }
    }
    
    handleGameOver() {
        this.isGameOver = true;
        this.controls.unlock();
        document.getElementById('game-over').style.display = 'block';
        
        // Reset Game state without instantly restarting
        this.level = 1; // You could optionally reset mazeSize here, or let it stay large. Let's reset it:
        this.mazeSize = 25; 
        this.playerKeys = 0;
        document.getElementById('keys').innerText = this.playerKeys;
        document.getElementById('monster-timer').textContent = "5.0s";
        
        this.monsterSpawned = false;
        if (this.monster) {
            this.scene.remove(this.monster);
            if (this.monster.geometry) this.monster.geometry.dispose();
            if (this.monster.material) this.monster.material.dispose();
            this.monster = null;
        }
        this.startTime = null;
        
        // Use timeout to delay heavy synchronous generation to avoid frame lock/lag
        setTimeout(() => {
            this.clearMaze();
            this.buildMaze();
        }, 50);
    }

    updateExploration() {
        const px = this.camera.position.x;
        const pz = this.camera.position.z;
        const radius = 3;
        
        // Always reveal the exact cell we are standing on securely
        const cx = Math.round(px);
        const cy = Math.round(pz);
        if (cx >= 0 && cx < this.mazeSize && cy >= 0 && cy < this.mazeSize) {
             this.explorationGrid[cy][cx] = true;
        }

        // Raycast outward in a circle to clear fog within radius, stopping at walls
        for (let angle = 0; angle < Math.PI * 2; angle += 0.1) {
            let rx = px;
            let rz = pz;
            const stepX = Math.cos(angle) * 0.2;
            const stepZ = Math.sin(angle) * 0.2;
            
            for (let i = 0; i < radius / 0.2; i++) {
                rx += stepX;
                rz += stepZ;
                
                const gridX = Math.round(rx);
                const gridY = Math.round(rz);
                
                if (gridX >= 0 && gridX < this.mazeSize && gridY >= 0 && gridY < this.mazeSize) {
                    this.explorationGrid[gridY][gridX] = true;
                    // Stop raycasting this angle if we hit a wall
                    if (this.grid[gridY][gridX] === 1) {
                        break;
                    }
                } else {
                    break;
                }
            }
        }
    }

    drawMinimap() {
        const ctx = this.minimapCtx;
        const size = this.minimapSize;
        const cellSize = size / this.mazeSize;

        ctx.clearRect(0, 0, size, size);

        for (let y = 0; y < this.mazeSize; y++) {
            for (let x = 0; x < this.mazeSize; x++) {
                if (!this.explorationGrid[y][x]) {
                    ctx.fillStyle = '#1a1a1a'; // Fog
                } else {
                    if (this.grid[y][x] === 1) {
                        ctx.fillStyle = '#666'; // Wall
                    } else {
                        ctx.fillStyle = '#ccc'; // Path
                    }
                }
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
            }
        }

        // Draw Player
        const px = (this.camera.position.x * cellSize) + cellSize/2;
        const py = (this.camera.position.z * cellSize) + cellSize/2;
        ctx.fillStyle = '#ff0000';
        ctx.beginPath();
        ctx.arc(px, py, cellSize / 3, 0, Math.PI * 2);
        ctx.fill();

        // Draw Goal if revealed
        const gx = (this.goal.position.x * cellSize) + cellSize/2;
        const gy = (this.goal.position.z * cellSize) + cellSize/2;
        const gy_grid = Math.round(this.goal.position.z);
        const gx_grid = Math.round(this.goal.position.x);
        if (this.explorationGrid[gy_grid] && this.explorationGrid[gy_grid][gx_grid]) {
            ctx.fillStyle = '#00ff00';
            ctx.fillRect(gx - cellSize/4, gy - cellSize/4, cellSize/2, cellSize/2);
        }
    }

    nextLevel() {
        this.level++;
        this.mazeSize += 2;
        
        while(this.scene.children.length > 0){ 
            this.scene.remove(this.scene.children[0]); 
        }
        
        this.walls = [];
        this.scene.add(this.camera);
        this.scene.add(this.sky); 
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);
        
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
        this.sunLight.castShadow = true;
        
        // Increase resolution and add bias to prevent "shadow swimming" (jagged edges during slow movement)
        this.sunLight.shadow.mapSize.width = 4096;
        this.sunLight.shadow.mapSize.height = 4096;
        this.sunLight.shadow.bias = -0.0001;
        this.sunLight.shadow.normalBias = 0.02;
        
        this.scene.add(this.sunLight);

        this.buildMaze();
    }
}

new Game();
