import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Maze } from './maze.js';
import { findPathBFS, getAccessibleArea } from './utils.js';

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
        this.startTime = null;
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.rotateLeft = false;
        this.rotateRight = false;
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

        // Textures — configure inside onLoad callbacks to avoid race conditions
        this.textureLoader = new THREE.TextureLoader();
        const configTex = (url, repeatX, repeatY) => {
            return this.textureLoader.load(url, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                if (repeatX) tex.repeat.set(repeatX, repeatY);
            });
        };
        this.textures = {
            brick: configTex('/textures/brick.png', 1, 1),
            floor: configTex('/textures/floor.png', 10, 10),
            clouds: configTex('/textures/clouds.png'),
            moon: configTex('/textures/moon.png')
        };
        
        // Monster
        this.monster = null;
        this.isGameOver = false;
        this.monsterSpawned = false;
        this.baseMonsterSpeed = 0.896; // Reduced by 20% (from 1.12)
        this.monsterSpeed = this.baseMonsterSpeed;
        this.monsterTextures = [];
        this.useFogOfWar = true;
        this.monsterBaseVolume = 1.8;
        this.monsterVolume = 0;
        this.monsterVolumeTarget = 0;
        
        // Powerups & Progression
        this.powerups = [];
        this.batteries = []; // Battery collection
        this.batteryLevel = 100; // Flashlight battery
        this.basePlayerSpeed = 19.6; // Reduced by 30% (from 28.0)
        this.playerSpeed = this.basePlayerSpeed;
        this.crouchKeyPressed = false;
        this.slowPowerupRemaining = 0;
        this.speedPowerupRemaining = 0;
        
        // Jump physics refinement
        this.gravityValue = 12.0;
        this.jumpForce = 3.2;

        
        // FPS Counter
        this.fpsFrameCount = 0;
        this.fpsPrevTime = performance.now();
        this.fpsElement = document.getElementById('fps');

        // Monster pathfinding throttle
        this.monsterPath = [];
        this.lastPathUpdateTime = 0;
        this.pathUpdateIntervalMs = 500; // Recalculate path every 500ms max

        this.torchLights = [];
        
        // Audio
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.monsterSound = null;
        this.screamBuffers = [];
        this.flashlightOnSound = null;
        this.flashlightOffSound = null;
        this.isMuted = false;
        this.listener.setMasterVolume(1);

        this.isFullscreenToggling = false;
        this.gameStarted = false;
        this.isPaused = false;
        this.menuBackgroundMusic = null;

        this.init();

    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setClearColor(0x020502); // Match forest fog color
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Enhanced Fog: чуть менее плотный, чтобы сцена казалась светлее
        this.scene.fog = new THREE.Fog(0x040804, 0.5, 11);

        // Forest-green ambient light — ещё немного темнее, но тени всё ещё читаются
        const ambientLight = new THREE.AmbientLight(0x606860, 0.26);
        this.scene.add(ambientLight);

        // Очень мягкий "лунный" заполняющий свет — чуть ослабляем для более мрачного настроения
        const hemiLight = new THREE.HemisphereLight(0xa0c0ff, 0x101308, 0.10);
        this.scene.add(hemiLight);

        // Silver-green moon light — усиливаем свет и тени от луны примерно на 20%
        this.moonLight = new THREE.DirectionalLight(0xa0b0a0, 0.84);
        this.moonLight.castShadow = true;
        // Max out shadow map for crispness
        this.moonLight.shadow.mapSize.width = 4096;
        this.moonLight.shadow.mapSize.height = 4096;
        this.moonLight.shadow.bias = -0.0005; // Slightly stronger bias to prevent acne but keep contact
        this.moonLight.shadow.normalBias = 0.01; // Reduced to prevent light pushing through thin walls
        this.moonLight.shadow.radius = 1;
        this.updateSunFrustum();
        this.scene.add(this.moonLight);

        // Cool Flashlight (SpotLight attached to camera)
        this.flashlight = new THREE.SpotLight(0xc0d0ff, 2.5, 20, Math.PI / 6, 0.5, 2);
        this.flashlight.position.set(0.3, -0.2, -0.2);
        this.flashlight.castShadow = true;
        this.flashlight.shadow.mapSize.width = 1024;
        this.flashlight.shadow.mapSize.height = 1024;
        this.camera.add(this.flashlight);

        // Flashlight Halo (Secondary soft light for scattering effect)
        this.flashlightHalo = new THREE.SpotLight(0xc0d0ff, 0.8, 10, Math.PI / 3, 0.8, 1);
        this.flashlightHalo.position.set(0.3, -0.2, -0.2);
        this.camera.add(this.flashlightHalo);

        // Flashlight targets (shared)
        this.flashlightTarget = new THREE.Object3D();
        this.flashlightTarget.position.set(0.3, -0.2, -5);
        this.camera.add(this.flashlightTarget);
        this.flashlight.target = this.flashlightTarget;
        this.flashlightHalo.target = this.flashlightTarget;

        this.scene.add(this.camera);

        // Simple synthesized flashlight click sounds (on/off)
        this.initFlashlightSounds();

        // Clean dark sky background — stars are handled by THREE.Points below
        const skyGeo = new THREE.SphereGeometry(500, 32, 32);
        const skyMat = new THREE.MeshBasicMaterial({ 
            color: 0x020208, 
            side: THREE.BackSide,
        });
        this.sky = new THREE.Mesh(skyGeo, skyMat);
        this.sky.renderOrder = -2;
        this.scene.add(this.sky);

        // --- STAR FIELD using THREE.Points ---
        // This is the best Three.js approach: all stars in a single draw call.
        // Stars are scattered on a sphere of radius 490 (inside sky at 500, outside clouds at 450).
        const STAR_COUNT = 3000;
        const starPositions = new Float32Array(STAR_COUNT * 3);
        const starColors = new Float32Array(STAR_COUNT * 3);
        const starSizes = new Float32Array(STAR_COUNT);
        
        for (let i = 0; i < STAR_COUNT; i++) {
            // Random point on a sphere using spherical coordinates
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 490;
            starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            starPositions[i * 3 + 2] = r * Math.cos(phi);
            
            // Color variation: mostly white, some cold blue, some warm yellow
            const colorRoll = Math.random();
            if (colorRoll < 0.15) { // Blue giant
                starColors[i * 3]     = 0.7;
                starColors[i * 3 + 1] = 0.8;
                starColors[i * 3 + 2] = 1.0;
            } else if (colorRoll < 0.25) { // Warm yellow
                starColors[i * 3]     = 1.0;
                starColors[i * 3 + 1] = 0.95;
                starColors[i * 3 + 2] = 0.7;
            } else { // White
                starColors[i * 3]     = 1.0;
                starColors[i * 3 + 1] = 1.0;
                starColors[i * 3 + 2] = 1.0;
            }
            
            // Size variation: most are tiny, a few are big/bright
            starSizes[i] = Math.random() < 0.05 ? 2.5 + Math.random() : 0.5 + Math.random() * 1.5;
        }
        
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
        
        // Create a small circular sprite texture for the stars
        const starSprite = document.createElement('canvas');
        starSprite.width = starSprite.height = 32;
        const spriteCtx = starSprite.getContext('2d');
        const grad = spriteCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        spriteCtx.fillStyle = grad;
        spriteCtx.fillRect(0, 0, 32, 32);
        const starSpriteTex = new THREE.CanvasTexture(starSprite);
        
        this.starMaterial = new THREE.PointsMaterial({
            size: 1.5,
            map: starSpriteTex,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false // MUST be false: stars at distance 490 would be 100% fogged otherwise
        });
        this.starSizes = starSizes;
        this.stars = new THREE.Points(starGeo, this.starMaterial);
        this.stars.renderOrder = -1; // Always behind moon and clouds
        this.scene.add(this.stars);

        // Add a secondary sphere for moving clouds
        const cloudGeo = new THREE.SphereGeometry(450, 32, 32);
        const cloudMat = new THREE.MeshBasicMaterial({
            map: this.textures.clouds,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.22, // Increased for visible haze
            color: 0xffffff,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.cloudSphere = new THREE.Mesh(cloudGeo, cloudMat);
        this.scene.add(this.cloudSphere);

        // Add a Moon — use THREE.Sprite so it always faces the camera (billboard)
        // This avoids the 3D sphere shape causing dark patches from the texture's black background
        const moonMat = new THREE.SpriteMaterial({ 
            map: this.textures.moon,
            color: 0xffffff,
            blending: THREE.AdditiveBlending, // Black pixels in texture = fully transparent
            fog: false,
            depthWrite: false
        });
        this.moon = new THREE.Sprite(moonMat);
        this.moon.scale.set(20, 20, 1); // 3x smaller moon disc
        this.moon.renderOrder = 1;
        this.moon.position.set(200, 240, 200);
        this.scene.add(this.moon);

        this.controls = new PointerLockControls(this.camera, document.body);

        // Pre-build the monster so spawning it later has zero cost
        this.initMonsterTextures();
        this.buildMonsterMeshCache();
        
        // Add monster to scene immediately but hide it to pre-warm all shaders and shadows
        // This completely eliminates the lag spike when it "spawns" because the engine
        // already knows about its material and geometry bounds within the scene.
        this.monster = this.monsterMeshCache;
        this.monster.visible = false;
        
        // Add a pulsing point light to the monster here as well
        this.monsterLight = new THREE.PointLight(0xff0000, 2, 3);
        this.monsterLight.castShadow = true;
        this.monsterLight.shadow.bias = -0.001;
        this.monster.add(this.monsterLight);

        // Pre-init monster sound to avoid audio-context freeze on first spawn
        this.initMonsterSound();
        if (this.monsterSound) {
            this.monster.add(this.monsterSound);
        }
        
        this.scene.add(this.monster);
        this.renderer.compile(this.scene, this.camera);

        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');

        const startGame = () => {
            if (!this.gameStarted) {
                this.gameStarted = true;
                startBtn.innerText = "CONTINUE";
            }
            const fowToggle = document.getElementById('fow-toggle');

            this.useFogOfWar = fowToggle ? fowToggle.checked : true;
            
            document.getElementById('game-over').style.display = 'none';
            this.isGameOver = false; // Add reset here
            
            // If monster is hanging around from death, reset it
            if (this.monsterSpawned) {
                this.monster.visible = false;
                this.monsterSpawned = false;
                this.monster.position.set(0, 0.5, 1);
                this.monsterVolume = 0;
                this.monsterVolumeTarget = 0;
            }
            // Reset monster timer for new game
            this.startTime = Date.now();
            // Always stop monster sound when restarting — it may have been playing during death screen
            if (this.monsterSound && this.monsterSound.isPlaying) {
                this.monsterSound.stop();
            }
            
            // Reset fog if FoW is disabled
            if (!this.useFogOfWar) {
                for (let y = 0; y < this.mazeSize; y++) {
                    for (let x = 0; x < this.mazeSize; x++) {
                        this.explorationGrid[y][x] = true;
                    }
                }
            }
            
            // Stop menu music when starting game
            if (this.menuBackgroundMusic && this.menuBackgroundMusic.isPlaying) {
                this.menuBackgroundMusic.pause();
            }
            
            this.controls.lock();
        };

        const toggleMute = this.toggleMute;

        this.toggleFullscreen = () => {

            const el = document.body;
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (!isFs) {
                this.isFullscreenToggling = true;
                // If pointer lock is active, exit it first (some browsers can't do both)
                const req = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el);
                if (!req) {
                    this.isFullscreenToggling = false;
                    return;
                }
                if (document.pointerLockElement) {
                    document.exitPointerLock();
                    setTimeout(() => req().catch(e => {
                        console.warn('Fullscreen error:', e);
                        this.isFullscreenToggling = false;
                    }), 50);
                } else {
                    req().catch(e => {
                        console.warn('Fullscreen error:', e);
                        this.isFullscreenToggling = false;
                    });
                }
            } else {
                this.isFullscreenToggling = true;
                const exit = document.exitFullscreen?.bind(document) || document.webkitExitFullscreen?.bind(document);
                if (exit) exit();
            }
        };
        document.addEventListener('fullscreenchange', () => {
            const icon = document.getElementById('fullscreen-icon');
            if (icon) icon.textContent = document.fullscreenElement ? '✕' : '⛶';
            
            // Allow menu again after transition
            setTimeout(() => { this.isFullscreenToggling = false; }, 100);
        });
        document.addEventListener('webkitfullscreenchange', () => {
            const icon = document.getElementById('fullscreen-icon');
            if (icon) icon.textContent = document.webkitFullscreenElement ? '✕' : '⛶';
            
            // Allow menu again after transition
            setTimeout(() => { this.isFullscreenToggling = false; }, 100);
        });

        // Set initial icon (sound ON by default)
        document.getElementById('mute-icon').textContent = '🔊';

        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) muteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMute();
        });

        const fsBtn = document.getElementById('fullscreen-btn');
        if (fsBtn) fsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleFullscreen();
        });

        startBtn.addEventListener('click', startGame);
        restartBtn.addEventListener('click', () => {
            location.reload();
        });
        
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
            // Only show menu if not game over and NOT toggling fullscreen
            if (!this.isGameOver && !this.isFullscreenToggling) {
                document.getElementById('menu').style.display = 'block';
            }
            document.getElementById('hud').style.display = 'none';
            document.getElementById('crosshair').style.display = 'none';
        });

        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
        window.addEventListener('resize', () => this.onWindowResize());

        // Load scream sounds
        const audioLoader = new THREE.AudioLoader();
        for (let i = 1; i <= 5; i++) {
            audioLoader.load(`/sounds/scream${i}.mp3`, (buffer) => {
                this.screamBuffers.push(buffer);
            });
        }

        // Load fire sound for torches
        this.fireSoundBuffer = null;
        audioLoader.load('/sounds/fire.mp3', (buffer) => {
            this.fireSoundBuffer = buffer;
            // Retroactively add sound to all existing torches
            this.torchLights.forEach(torchData => {
                if (torchData.group && !torchData.fireSound) {
                    this.addAudioToTorch(torchData);
                }
            });
        });

        // Load flashlight sound
        this.flashlightSoundBuffer = null;
        audioLoader.load('/sounds/light.mp3', (buffer) => {
            this.flashlightSoundBuffer = buffer;
            
            // Set buffer for flashlight sounds if they already exist
            if (this.flashlightOnSound && this.flashlightOffSound) {
                this.flashlightOnSound.setBuffer(buffer);
                this.flashlightOffSound.setBuffer(buffer);
                this.flashlightOnSound.setVolume(0.5);
                this.flashlightOffSound.setVolume(0.3);
            }
        });

        // Initialize menu background music
        this.initMenuBackgroundMusic();

        this.buildMaze();
        this.animate();
        
        // Handle preloader scream audio with multiple attempts
        const preloaderScream = document.getElementById('preloader-scream');
        if (preloaderScream) {
            preloaderScream.volume = 0.4;
            preloaderScream.loop = true;
            
            // Try to play immediately
            const tryPlay = () => {
                preloaderScream.play().catch(e => {
                    console.warn('Preloader scream failed to play:', e);
                });
            };
            
            tryPlay();
            
            // Try again after a short delay (in case of loading issues)
            setTimeout(tryPlay, 100);
            setTimeout(tryPlay, 500);
            setTimeout(tryPlay, 1000);
            
            // Add click listener to start audio on first user interaction
            const startAudioOnInteraction = () => {
                if (preloaderScream.paused) {
                    tryPlay();
                }
                document.removeEventListener('click', startAudioOnInteraction);
                document.removeEventListener('keydown', startAudioOnInteraction);
            };
            
            document.addEventListener('click', startAudioOnInteraction);
            document.addEventListener('keydown', startAudioOnInteraction);
            
            // Handle tab visibility - pause when tab is inactive
            document.addEventListener('visibilitychange', () => {
                if (document.hidden) {
                    // Tab is not active - pause audio
                    if (!preloaderScream.paused) {
                        preloaderScream.pause();
                    }
                } else {
                    // Tab is active - resume audio if preloader is still visible
                    const preloader = document.getElementById('preloader');
                    if (preloader && preloader.style.display !== 'none') {
                        tryPlay();
                    }
                }
            });
        }
        
        // Track texture loading
        let texturesLoaded = 0;
        const totalTextures = 7; // brick, floor, clouds, moon, monster_face_1, monster_face_2, wood
        
        const checkAllLoaded = () => {
            texturesLoaded++;
            if (texturesLoaded >= totalTextures) {
                const preloader = document.getElementById('preloader');
                if (preloader) {
                    preloader.style.animation = 'fadeOut 1s ease-in-out';
                    setTimeout(() => {
                        preloader.style.display = 'none';
                        // Stop preloader scream when preloader is hidden
                        if (preloaderScream && !preloaderScream.paused) {
                            preloaderScream.pause();
                            preloaderScream.currentTime = 0;
                        }
                    }, 1000);
                }
            }
        };
        
        // Override texture loading callbacks to track completion
        const originalLoad = this.textureLoader.load;
        this.textureLoader.load = (url, onLoad, onProgress, onError) => {
            return originalLoad.call(this.textureLoader, url, (texture) => {
                checkAllLoaded();
                if (onLoad) onLoad(texture);
            }, onProgress, onError);
        };
        
        // Preload all essential textures
        this.textureLoader.load('/textures/brick.png', checkAllLoaded);
        this.textureLoader.load('/textures/floor.png', checkAllLoaded);
        this.textureLoader.load('/textures/clouds.png', checkAllLoaded);
        this.textureLoader.load('/textures/moon.png', checkAllLoaded);
        this.textureLoader.load('/textures/monster_face_1.png', checkAllLoaded);
        this.textureLoader.load('/textures/monster_face_2.png', checkAllLoaded);
        this.textureLoader.load('/textures/wood.png', checkAllLoaded);
    }

    clearMaze() {
        // Remove all objects except camera and sky
        const toRemove = [];
        this.scene.traverse((object) => {
            if (object !== this.scene && 
                object !== this.camera && 
                object !== this.sky && 
                object !== this.moon &&         // Never delete the moon
                object !== this.cloudSphere &&  // Never delete the cloud layer
                object !== this.stars &&         // Never delete the starfield
                object !== this.moonLight &&
                object !== this.sunLight && 
                object !== this.monster &&      // Never remove the monster
                object !== this.monsterSound && // Keep monster's heart beating
                object !== this.monsterLight && // Keep monster's glow
                object !== this.playerLight &&  // Keep player's hand-held torch
                object !== this.flashlight &&     // Never delete the flashlight
                object !== this.flashlightHalo && // Never delete the flashlight halo
                object !== this.flashlightTarget && // Never delete the flashlight target
                !object.isAmbientLight) {
                toRemove.push(object);
            }
        });

        toRemove.forEach(obj => {
            if (obj.parent) obj.parent.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    obj.material.dispose();
                }
            }
        });

        this.walls = [];
        this.powerups = [];
        this.keys = [];
        this.lockedDoors = [];
        this.crouchBeams = [];
        this.goal = null;
        this.torchLights = [];
        
        // Stop torch fire sounds
        this.torchLights.forEach(torch => {
            if (torch.fireSound && torch.fireSound.isPlaying) {
                torch.fireSound.stop();
            }
        });
    }

    updateSunFrustum() {
        const d = this.mazeSize;
        this.moonLight.shadow.camera.left = -d;
        this.moonLight.shadow.camera.right = d;
        this.moonLight.shadow.camera.top = d;
        this.moonLight.shadow.camera.bottom = -d;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = 100;
        this.moonLight.shadow.camera.updateProjectionMatrix();
    }

    buildMaze() {
        this.updateSunFrustum();
        const mazeGen = new Maze(this.mazeSize, this.mazeSize);
        this.grid = mazeGen.generate();
        
        // Initialize exploration grid
        this.explorationGrid = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));

        const wallMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.brick,
            color: 0xa0b0a0, // Subtle green-grey tint (mossy/forest look)
            shininess: 5
        });

        const floorGeometry = new THREE.PlaneGeometry(this.mazeSize, this.mazeSize);
        const floorMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.floor,
            color: 0x90a090 // Slightly darker green tint for floor
        });
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
        const mainPath = findPathBFS(this.grid, this.mazeSize, this.mazeSize, endPathX, endPathY, startPathX, startPathY); // Reverse to get from exit to start
        


        // Instantiate maze objects (walls only — obstacles removed)
        // Walls are already instantiated above so we skip the duplicate loop.
        


        

      
        // Replace empty spaces with doors and spawn a key BEFORE the door 
        // We evaluate accessible spaces using BFS from start that STOPS at all door positions

        
        // --- KEY/DOOR SPAWN LOGIC REMOVED ---






        // Shuffle remaining empty spaces and spawn exactly one of each powerup
        emptySpaces.sort(() => Math.random() - 0.5);
        if (emptySpaces.length >= 2) {
            this.spawnPowerup(emptySpaces[0].x, emptySpaces[0].y, 'speed');
            this.spawnPowerup(emptySpaces[1].x, emptySpaces[1].y, 'slow');
        }

        // Spawn 4-8 batteries per level
        const numBatteries = 4 + Math.floor(Math.random() * 5);
        for (let i = 2; i < 2 + numBatteries && i < emptySpaces.length; i++) {
            this.spawnBattery(emptySpaces[i].x, emptySpaces[i].y);
        }

        // Spawn crouch beams in ~5% of remaining empty spaces
        const numBeams = Math.floor(emptySpaces.length * 0.05);
        for (let i = 2; i < 2 + numBeams && i < emptySpaces.length; i++) {
            const bx = emptySpaces[i].x;
            const bz = emptySpaces[i].y;
            // Prevent spawning beams right next to the start
            if (bx > 2 || bz > 2) {
                this.spawnCrouchBeam(bx, bz);
            }
        }

        // Spawn torches randomly, spaced out
        const maxTorches = 6 + Math.floor(this.level * 1.5); // Increase slightly with level
        let torchCount = 0;
        
        // Shuffle the spaces that weren't used by powerups and beams
        const potentialTorchSpaces = emptySpaces.slice(2 + numBeams).sort(() => Math.random() - 0.5);
        
        for (const space of potentialTorchSpaces) {
            const tx = space.x;
            const tz = space.y;
            
            // Check if it has a wall neighbor to attach to
            const hasWall = (tz > 0 && this.grid[tz-1][tx] === 1) ||
                            (tz < this.mazeSize-1 && this.grid[tz+1][tx] === 1) ||
                            (tx > 0 && this.grid[tz][tx-1] === 1) ||
                            (tx < this.mazeSize-1 && this.grid[tz][tx+1] === 1);
            
            if (hasWall) {
                // Check distance to existing torches (minimum distance 6 units)
                let tooClose = false;
                for (const t of this.torchLights) {
                    const dx = t.gridX - tx;
                    const dz = t.gridZ - tz;
                    if (Math.sqrt(dx*dx + dz*dz) < 6) {
                        tooClose = true;
                        break;
                    }
                }
                
                if (!tooClose) {
                    this.spawnTorch(tx, tz);
                    torchCount++;
                    if (torchCount >= maxTorches) break;
                }
            }
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
            // Door lowered from 1.3 to 1.1
            const doorGeo = new THREE.BoxGeometry(0.1, 1.1, 1);
            const door = new THREE.Mesh(doorGeo, doorMaterial);
            door.position.set(x, 0.55, z);
            door.castShadow = true;
            door.receiveShadow = true;
            this.scene.add(door);
        } else {
            // Open door frame
            const frameGeo = new THREE.BoxGeometry(0.1, 1.1, 0.2);
            const leftFrame = new THREE.Mesh(frameGeo, doorMaterial);
            leftFrame.position.set(x, 0.55, z - 0.4);
            leftFrame.castShadow = true;
            leftFrame.receiveShadow = true;
            this.scene.add(leftFrame);

            const rightFrame = new THREE.Mesh(frameGeo, doorMaterial);
            rightFrame.position.set(x, 0.55, z + 0.4);
            rightFrame.castShadow = true;
            rightFrame.receiveShadow = true;
            this.scene.add(rightFrame);

            const topGeo = new THREE.BoxGeometry(0.1, 0.2, 1);
            const topFrame = new THREE.Mesh(topGeo, doorMaterial);
            topFrame.position.set(x, 1.2, z); // 1.1 + 0.1
            topFrame.castShadow = true;
            topFrame.receiveShadow = true;
            this.scene.add(topFrame);
        }
    }

    createUnevenWall(x, y, material) {
        // ... (existing wall code)
        // Walls base lowered to 1.1 (+0.5 sink)
        // Total physical height needed: 1.1 base + 0.5 sink = ~1.6
        // Increased random base variation from 0.2 to 0.5 for more uneven look
        const height = 1.1 + 0.5 + Math.random() * 0.5;
        const geo = new THREE.BoxGeometry(1, height, 1);
        const wall = new THREE.Mesh(geo, material);
        // Sink the wall by 0.5 so its bottom is definitely below y=0 (floor is at y=0)
        wall.position.set(x, (height / 2) - 0.5, y);
        wall.castShadow = true;
        wall.receiveShadow = true;
        // Prevent light bleeding from behind the wall geometry
        if (material) {
            material.shadowSide = THREE.DoubleSide;
        }
        this.scene.add(wall);

        if (Math.random() > 0.3) {
            // Increased the number of random top bricks
            const numBricks = Math.floor(Math.random() * 4) + 1;
            for (let i = 0; i < numBricks; i++) {
                // Increased brick height variance significantly to make the top jagged
                const brickHeight = 0.1 + Math.random() * 0.25;
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

    createObstacle(x, y, material, type) {
        let geo, py;
        if (type === 'jump') {
            geo = new THREE.BoxGeometry(1, 0.4, 1);
            py = -0.3; // Low wall
        } else {
            geo = new THREE.BoxGeometry(1, 1.5, 1);
            py = 1.2; // High beam
        }
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(x, py, y);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.walls.push(mesh);
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
            emissiveIntensity: 0.8
        });
        
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2; // Stand the coin up
        mesh.rotation.y = Math.PI / 2;
        mesh.position.set(x, 0.5, z);

        mesh.userData = { type: type, isCoin: true };
        
        this.powerups.push(mesh);
    }

    spawnBattery(x, z) {
        const group = new THREE.Group();
        // Battery body
        const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.25, 8);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.6 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // Battery cap
        const capGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8);
        const capMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.15;
        group.add(cap);

        group.position.set(x, 0.4, z);


        this.scene.add(group);
        this.batteries.push(group);
    }

    // --- SPAWN METHODS REMOVED ---


    spawnCrouchBeam(x, z) {
        // We clone the texture to adjust its UV mapping specifically for the beam
        // This ensures the bricks run horizontally and at the correct scale
        const beamTex = this.textures.brick.clone();
        beamTex.needsUpdate = true;
        beamTex.repeat.set(1, 0.5);
        beamTex.offset.set(0, 0.5);

        // Use standard wall material for the obstacle
        const mat = new THREE.MeshPhongMaterial({ 
            map: beamTex,
            color: 0x888888, // Neutral tint like walls
            shininess: 2,
            shadowSide: THREE.DoubleSide
        });
        
        // The wall is total 1.1 base height.
        // If bottom gap is 0.5m high, the beam is 0.6m high (1.1 - 0.5 = 0.6).
        const beamHeight = 0.6;
        const geo = new THREE.BoxGeometry(1.0, beamHeight, 1.0);
        const mesh = new THREE.Mesh(geo, mat);
        
        // Center of the beam is 0.5 + (0.6 / 2) = 0.8
        mesh.position.set(x, 0.8, z); 
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        this.scene.add(mesh);
        if (!this.crouchBeams) this.crouchBeams = [];
        this.crouchBeams.push(mesh);
        
        // Mark on grid as crouch obstacle (type 4)
        this.grid[z][x] = 4;
    }

    onKeyDown(event) {
        switch (event.code) {
            // case 'ArrowUp':
            case 'KeyW': this.moveForward = true; break;
            // case 'ArrowLeft':
            case 'KeyA': this.moveLeft = true; break;
            // case 'ArrowDown':
            case 'KeyS': this.moveBackward = true; break;
            // case 'ArrowRight':
            case 'KeyD': this.moveRight = true; break;
            case 'Space': 
                if (this.canJump) {
                    this.velocity.y = this.jumpForce;
                    this.canJump = false;
                }
                break;

            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.crouchKeyPressed = true;
                break;
            case 'KeyM':
                this.toggleMute();
                break;
            case 'KeyF':
                if (this.flashlight) {
                    const willTurnOn = !this.flashlight.visible;
                    this.flashlight.visible = willTurnOn;
                    if (this.flashlightHalo) this.flashlightHalo.visible = willTurnOn;

                    if (!this.isMuted) {
                        if (willTurnOn && this.flashlightOnSound && this.flashlightOnSound.isPlaying) {
                            this.flashlightOnSound.stop();
                        }
                        if (!willTurnOn && this.flashlightOffSound && this.flashlightOffSound.isPlaying) {
                            this.flashlightOffSound.stop();
                        }

                        if (willTurnOn && this.flashlightOnSound) {
                            this.flashlightOnSound.play();
                        } else if (!willTurnOn && this.flashlightOffSound) {
                            this.flashlightOffSound.play();
                        }
                    }
                }
                break;
            case 'KeyL':
                if (this.toggleFullscreen) this.toggleFullscreen();
                break;
            case 'Escape':
                this.toggleMenu();
                break;
        }

    }

    onKeyUp(event) {
        switch (event.code) {
            // case 'ArrowUp':
            case 'KeyW': this.moveForward = false; break;
            // case 'ArrowLeft':
            case 'KeyA': this.moveLeft = false; break;
            // case 'ArrowDown':
            case 'KeyS': this.moveBackward = false; break;
            // case 'ArrowRight':
            case 'KeyD': this.moveRight = false; break;
            case 'ControlLeft':
            case 'ControlRight':
            case 'KeyC':
                this.crouchKeyPressed = false;
                break;
        }
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    isUnderObstacle(x, z) {
        const r = 0.35; // Player radius
        const minX = Math.floor(x - r + 0.5);
        const maxX = Math.floor(x + r + 0.5);
        const minZ = Math.floor(z - r + 0.5);
        const maxZ = Math.floor(z + r + 0.5);
        
        for (let gy = minZ; gy <= maxZ; gy++) {
            for (let gx = minX; gx <= maxX; gx++) {
                if (gx >= 0 && gx < this.mazeSize && gy >= 0 && gy < this.mazeSize) {
                    if (this.grid[gy][gx] === 4) {
                        return true;
                    }
                }
            }
        }
        return false;
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
                
                const cellType = this.grid[gy][gx];
                if (cellType === 1 || cellType === 2 || cellType === 3 || cellType === 4) {
                    // Check height for obstacles
                    const playerY = this.camera.position.y;
                    if (cellType === 3) { // Jump hurdle
                        if (playerY > 0.2) { // If player is high enough (jumping), ignore collision
                            continue;
                        }
                    }
                    if (cellType === 4) { // Crouch beam
                        if (this.isCrouching) { // If player is crouching, ignore collision
                            continue;
                        }
                    }

                    const testX = Math.max(gx - 0.5, Math.min(x, gx + 0.5));
                    const testZ = Math.max(gy - 0.5, Math.min(z, gy + 0.5));
                    
                    const distX = x - testX;
                    const distZ = z - testZ;
                    
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
        const time = performance.now();
        const delta = Math.min((time - this.prevTime) / 1000, 0.1);
        this.prevTime = time;

        if (this.textures.clouds) {
            // Speed up clouds slightly to make the dynamic sky more noticeable
            this.textures.clouds.offset.x += 0.0001;
            this.textures.clouds.offset.y += 0.00005;
        }
        if (this.cloudSphere) {
            this.cloudSphere.rotation.y += 0.0002; // physical rotation of the cloud dome
        }

        // --- TORCH FLICKER LOGIC ---
        const timeNow = time * 0.005;

        // Flicker environment torches
        this.torchLights.forEach(t => {
            if (t.light) {
                t.light.intensity = t.baseIntensity + Math.sin(timeNow * 0.8 + t.gridX) * 0.1 + Math.random() * 0.2;
                // Also slightly pulse the flame meshes
                if (t.flameMeshes) {
                    t.flameMeshes.forEach((m, i) => {
                        const s = 1.0 + Math.sin(timeNow * 1.5 + i) * 0.05 + Math.random() * 0.02;
                        m.scale.set(s, s, s);
                    });
                }
            }
        });

        // No wiggle for steady flashlight
        if (this.flashlight) {
            this.flashlight.intensity = 2.5; 
        }
        if (this.flashlightHalo) {
            this.flashlightHalo.intensity = 0.8;
        }

        // Smooth monster ambient volume fade (for spawn / stop)
        if (this.monsterSound) {
            const fadeSpeed = 0.17; // 6-second fade duration (1/6 ≈ 0.17)
            const diff = this.monsterVolumeTarget - this.monsterVolume;
            if (Math.abs(diff) > 0.001) {
                this.monsterVolume += diff * Math.min(1, fadeSpeed * delta);
                this.monsterSound.setVolume(Math.max(0, this.monsterVolume));
            }
        }

        // Battery depletion logic (paused when menu is open / controls unlocked)
        if (this.controls.isLocked && !this.isGameOver && this.flashlight && this.flashlight.visible) {
            const depletionRate = 3; // 3% per second
            this.batteryLevel -= depletionRate * delta;
            
            if (this.batteryLevel <= 0) {
                this.batteryLevel = 0;
                this.flashlight.visible = false;
                if (this.flashlightHalo) this.flashlightHalo.visible = false;
            }
            
            // Update UI
            const batteryBar = document.getElementById('battery-bar');
            const batteryText = document.getElementById('battery-text');
            if (batteryBar) batteryBar.style.width = this.batteryLevel + '%';
            if (batteryText) batteryText.innerText = Math.round(this.batteryLevel) + '%';
            
            // Change color if low
            if (batteryBar) {
                if (this.batteryLevel < 20) {
                    batteryBar.style.background = 'linear-gradient(90deg, #bb2222, #ff4444)';
                } else if (this.batteryLevel < 50) {
                    batteryBar.style.background = 'linear-gradient(90deg, #bbbb22, #ffff44)';
                } else {
                    batteryBar.style.background = 'linear-gradient(90deg, #22bb22, #44ff44)';
                }
            }
        }

        // Star twinkle — gentle pulse via opacity
        if (this.starMaterial) {
            this.starMaterial.opacity = 0.7 + Math.sin(time * 0.0008) * 0.15;
        }




        // FPS Calculation
        this.fpsFrameCount++;
        if (time >= this.fpsPrevTime + 1000) {
            const fps = Math.round((this.fpsFrameCount * 1000) / (time - this.fpsPrevTime));
            this.fpsElement.textContent = fps;
            this.fpsFrameCount = 0;
            this.fpsPrevTime = time;
        }

        // Move the moon slowly
        if (this.moonLight) {
            const sunSpeed = 0.0000169; // 30% faster than 0.000013
            this.moonLight.position.x = Math.sin(time * sunSpeed) * 30;
            this.moonLight.position.z = Math.cos(time * sunSpeed) * 30;
            this.moonLight.position.y = 40;
            if (this.moon) {
                this.moon.position.copy(this.moonLight.position);
            }
        }


        if (this.controls.isLocked && !this.isGameOver) {


            if (this.startTime && !this.monsterSpawned) {
                const elapsed = Date.now() - this.startTime;
                if (elapsed > 10000) {
                    this.spawnMonster();
                    document.getElementById('monster-timer').textContent = "Active!";
                } else {
                    document.getElementById('monster-timer').textContent = ((10000 - elapsed) / 1000).toFixed(1) + "s";
                }
            } else if (this.monsterSpawned) {
                document.getElementById('monster-timer').textContent = "Active!";
            } else {
                document.getElementById('monster-timer').textContent = "10.0s";
            }

            if (this.monsterSpawned) {
                this.updateMonster(delta);
            }

            // Keyboard rotation (Arrow keys)
            if (this.rotateLeft) {
                this.camera.rotation.y += 2.0 * delta;
            }
            if (this.rotateRight) {
                this.camera.rotation.y -= 2.0 * delta;
            }

            this.velocity.x -= this.velocity.x * 10.0 * delta;
            this.velocity.z -= this.velocity.z * 10.0 * delta;
            // Gravity
            this.velocity.y -= this.gravityValue * delta; 


            this.direction.z = Number(this.moveForward) - Number(this.moveBackward);
            this.direction.x = Number(this.moveRight) - Number(this.moveLeft);
            this.direction.normalize();

            // Slower movement when crouching, and auto-crouch if stuck under an obstacle
            this.isCrouching = this.crouchKeyPressed || this.isUnderObstacle(this.camera.position.x, this.camera.position.z);
            const speed = this.isCrouching ? this.playerSpeed / 2 : this.playerSpeed;

            if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
            if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

            // Target camera height based on crouch state
            const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;

            // --- POWERUP LOGIC ---
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const pu = this.powerups[i];
                if (pu.userData.collected) continue; // Skip collected items
                
                if (pu.userData.isCoin) {
                    pu.rotation.z += delta * 2;
                    // Note: time is from performance.now() which is huge, scale it down
                    pu.position.y = 0.5 + Math.sin(time / 200 + pu.position.x) * 0.1;
                }
                
                const dist = this.camera.position.distanceTo(pu.position);
                if (dist < 0.8) {
                    // Consume by hiding instead of removing from scene (prevents freezing)
                    pu.visible = false;
                    pu.userData.collected = true;
                    // No splice, keep in array to avoid shifting issues, but flag collected
                    
                    if (pu.userData.type === 'speed') {
                        this.playerSpeed = this.basePlayerSpeed * 1.5; // Boost speed significantly
                        this.speedPowerupRemaining = 15; // 15 seconds
                        document.getElementById('bonus-speed-indicator').style.display = 'block';
                    } else if (pu.userData.type === 'slow') {
                        this.monsterSpeed = this.baseMonsterSpeed * 0.5;
                        this.slowPowerupRemaining = 20; // 20 seconds
                        document.getElementById('bonus-indicator').style.display = 'block';
                    }
                }
            }

            if (this.speedPowerupRemaining > 0) {
                this.speedPowerupRemaining -= delta;
                if (this.speedPowerupRemaining <= 0) {
                    this.speedPowerupRemaining = 0;
                    this.playerSpeed = this.basePlayerSpeed;
                    document.getElementById('bonus-speed-indicator').style.display = 'none';
                } else {
                    document.getElementById('bonus-speed-time').textContent = Math.ceil(this.speedPowerupRemaining) + "s";
                }
            }

            if (this.slowPowerupRemaining > 0) {
                this.slowPowerupRemaining -= delta;
                if (this.slowPowerupRemaining <= 0) {
                    this.slowPowerupRemaining = 0;
                    this.monsterSpeed = this.baseMonsterSpeed;
                    document.getElementById('bonus-indicator').style.display = 'none';
                } else {
                    document.getElementById('bonus-time').textContent = Math.ceil(this.slowPowerupRemaining) + "s";
                }
            }

            // --- KEY/DOOR LOGIC REMOVED ---


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

            // --- POWERUP LOGIC ---
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const powerup = this.powerups[i];
                if (this.camera.position.distanceTo(powerup.position) < 0.8) {
                    this.scene.remove(powerup);
                    this.powerups.splice(i, 1);
                    this.applyPowerup(powerup.userData.type);
                }
            }

            // --- BATTERY LOGIC ---
            for (let i = this.batteries.length - 1; i >= 0; i--) {
                const battery = this.batteries[i];
                battery.rotation.y += delta * 2;
                if (this.camera.position.distanceTo(battery.position) < 0.8) {
                    this.scene.remove(battery);
                    this.batteries.splice(i, 1);
                    this.batteryLevel = Math.min(100, this.batteryLevel + 25);
                    // Force update UI immediately
                    const batteryBar = document.getElementById('battery-bar');
                    const batteryText = document.getElementById('battery-text');
                    if (batteryBar) batteryBar.style.width = this.batteryLevel + '%';
                    if (batteryText) batteryText.innerText = Math.round(this.batteryLevel) + '%';
                }
            }

            this.updateExploration();
            this.drawMinimap();

            const distToGoal = this.camera.position.distanceTo(this.goal.position);
            if (this.goal && distToGoal < 0.8) {
                this.nextLevel();
            }


            if (this.startTime) {
                const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
                const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
                const secs = (elapsed % 60).toString().padStart(2, '0');
                document.getElementById('timer').textContent = `${mins}:${secs}`;
            }
        }


        if (this.goal) {
            this.goal.rotation.y += 0.02;
            this.goal.position.y = Math.sin(performance.now() * 0.005) * 0.1 + 0.2;
        }

        this.renderer.render(this.scene, this.camera);
    }

    spawnMonster() {
        if (this.monsterSpawned) return;

        // Monster is already in the scene from init, just unhide and position
        this.monster.position.set(0, 0.5, 1);
        this.monster.visible = true;
        
        // Start sound with smooth fade-in
        if (this.monsterSound) {
            if (this.monsterSound.context.state === 'suspended') {
                this.monsterSound.context.resume();
            }
            if (!this.monsterSound.isPlaying) {
                this.monsterSound.play();
            }
            // Start from silence and fade up to base volume
            this.monsterVolume = 0;
            this.monsterVolumeTarget = this.monsterBaseVolume;
        }
        
        this.monsterSpawned = true;
    }

    buildMonsterMeshCache() {
        // Pre-build monster geometry ONCE at init.
        // Restored full scary geometry and procedural texture.
        const monsterGeo = new THREE.SphereGeometry(0.4, 32, 32);
        
        const pos = monsterGeo.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const noise = (
                Math.sin(v.x * 12 + v.y * 15) * 0.03 + 
                Math.cos(v.y * 18 + v.z * 11) * 0.03 +
                Math.sin(v.z * 14 + v.x * 16) * 0.03
            );
            v.addScaledVector(v.clone().normalize(), noise);
            pos.setXYZ(i, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        monsterGeo.computeVertexNormals();

        if (this.monsterTextures.length === 0) {
            this.initMonsterTextures();
        }
        const tex = this.monsterTextures[Math.floor(Math.random() * this.monsterTextures.length)];
        const monsterMat = new THREE.MeshPhongMaterial({ 
            map: tex,
            emissive: 0xff0000,
            emissiveIntensity: 0.1,
            shininess: 2
        });

        this.monsterMeshCache = new THREE.Mesh(monsterGeo, monsterMat);
    }

    spawnTorch(x, z) {
        const torchGroup = new THREE.Group();
        
        // Find which side has a wall to attach to
        let offset = { x: 0, z: 0, rotation: 0 };
        const neighbors = [
            { dx: 1, dz: 0, rot: Math.PI / 2, ox: 0.4, oz: 0 },
            { dx: -1, dz: 0, rot: -Math.PI / 2, ox: -0.4, oz: 0 },
            { dx: 0, dz: 1, rot: 0, ox: 0, oz: 0.4 },
            { dx: 0, dz: -1, rot: Math.PI, ox: 0, oz: -0.4 }
        ];

        for (const n of neighbors) {
            const nx = Math.round(x + n.dx);
            const nz = Math.round(z + n.dz);
            if (nx >= 0 && nx < this.mazeSize && nz >= 0 && nz < this.mazeSize) {
                if (this.grid[nz][nx] === 1) {
                    offset = { x: n.ox, z: n.oz, rotation: n.rot };
                    break;
                }
            }
        }

        // Bracket (Metal)
        const bracketGeo = new THREE.BoxGeometry(0.1, 0.05, 0.1);
        const bracketMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
        const bracket = new THREE.Mesh(bracketGeo, bracketMat);
        bracket.position.set(offset.x * 1.1, 0.6, offset.z * 1.1);
        torchGroup.add(bracket);

        // Handle (Wood)
        if (!this.woodTexture) this.woodTexture = this.createWoodTexture();
        const handleGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.45);
        const handleMat = new THREE.MeshStandardMaterial({ map: this.woodTexture, roughness: 0.9 });
        const handle = new THREE.Mesh(handleGeo, handleMat);
        
        // Position handle relative to wall
        handle.position.set(offset.x * 0.8, 0.65, offset.z * 0.8);
        handle.rotation.set(
            offset.z !== 0 ? (offset.z > 0 ? -0.3 : 0.3) : 0,
            offset.rotation,
            offset.x !== 0 ? (offset.x > 0 ? 0.3 : -0.3) : 0,
            'YXZ'
        );
        torchGroup.add(handle);
        
        // Flame layers
        const flameGroup = new THREE.Group();
        const layers = 3;
        const flameMeshes = [];
        for (let i = 0; i < layers; i++) {
            const size = 0.08 - i * 0.02;
            const geo = new THREE.SphereGeometry(size, 8, 8);
            const mat = new THREE.MeshPhongMaterial({
                color: i === 0 ? 0xff4400 : (i === 1 ? 0xffaa00 : 0xffff00),
                emissive: i === 0 ? 0xff0000 : (i === 1 ? 0xff6600 : 0xffaa00),
                transparent: true,
                opacity: 0.8 - i * 0.2,
                blending: THREE.AdditiveBlending
            });
            const f = new THREE.Mesh(geo, mat);
            flameGroup.add(f);
            flameMeshes.push(f);
        }
        
        // Position flame at top of handle
        const tipOffset = 0.22;
        flameGroup.position.copy(handle.position);
        // Move towards the tip in the handle's local up direction
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(handle.quaternion);
        flameGroup.position.addScaledVector(up, tipOffset);
        torchGroup.add(flameGroup);
        
        // Light
        // Reduced distance from 8 to 3 — prevents light bleeding through walls
        const light = new THREE.PointLight(0xffaa00, 2.4, 3);
        light.position.copy(flameGroup.position);
        // Disable shadows on torches to drastically improve performance 
        // (Multiple PointLight shadows cause severe lag)
        light.castShadow = false; 
        torchGroup.add(light);
        
        torchGroup.position.set(x, 0, z);
        this.scene.add(torchGroup);
        
        // Store for animation
        const torchData = {
            group: torchGroup,
            light,
            flameMeshes,
            baseIntensity: 2.4,
            gridX: x,
            gridZ: z
        };

        // Add fire sound if buffer is loaded
        if (this.fireSoundBuffer) {
            this.addAudioToTorch(torchData);
        }

        this.torchLights.push(torchData);
    }

    addAudioToTorch(torchData) {
        if (!this.fireSoundBuffer || torchData.fireSound) return;

        const fireSound = new THREE.PositionalAudio(this.listener);
        fireSound.setBuffer(this.fireSoundBuffer);
        fireSound.setLoop(true);
        fireSound.setRefDistance(1.0);
        fireSound.setRolloffFactor(2);
        fireSound.setDistanceModel('exponential');
        fireSound.setVolume(0.8);
        
        torchData.group.add(fireSound);
        torchData.fireSound = fireSound;
        
        // Start playing
        fireSound.play();
    }

    initMonsterTextures() {
        // Load the two real terrifying monster faces, randomly pick one per spawn
        this.monsterTextures.push(this.textureLoader.load('/textures/monster_face_1.png'));
        this.monsterTextures.push(this.textureLoader.load('/textures/monster_face_2.png'));
    }

    createWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128; // Small but enough for a handle
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Base wood color
        ctx.fillStyle = '#442200';
        ctx.fillRect(0, 0, 128, 128);
        
        // Grain
        ctx.strokeStyle = '#221100';
        ctx.lineWidth = 1;
        for (let i = 0; i < 50; i++) {
            ctx.beginPath();
            const x = Math.random() * 128;
            ctx.moveTo(x, 0);
            ctx.lineTo(x + (Math.random() - 0.5) * 20, 128);
            ctx.stroke();
        }
        
        // Knots
        for (let i = 0; i < 5; i++) {
            const kx = Math.random() * 128;
            const ky = Math.random() * 128;
            ctx.fillStyle = '#220800';
            ctx.beginPath();
            ctx.ellipse(kx, ky, 5, 8, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    initMonsterSound() {
        this.monsterSound = new THREE.PositionalAudio(this.listener);

        // 3D Positional Audio — louder as player approaches
        this.monsterSound.setDistanceModel('exponential');
        this.monsterSound.setRefDistance(1.0);   // Full volume 1 unit away
        this.monsterSound.setMaxDistance(210);   // Audible up to 210 units away
        this.monsterSound.setRolloffFactor(1.2); // Smooth: loud close, quiet far
        this.monsterSound.setLoop(true);
        // Start muted; we'll fade up when the monster actually spawns
        this.monsterSound.setVolume(0);

        // Load the 5.5-minute haunting ambient track
        // Play from 3:00 (180s), loop back there when reaching 5:21 (321s)
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('/sounds/monster_ambient.mp3', (buffer) => {
            this.monsterSound.setBuffer(buffer);
            this.monsterSound.setLoopStart(180); // 3:00
            this.monsterSound.setLoopEnd(321);   // 5:21
            this.monsterSound.offset = 180;      // Start at 3:00 on first play
            console.log('[Monster] Ambient track loaded:', buffer.duration.toFixed(1), 's — loop 3:00-5:21');
        }, undefined, (err) => {
            console.warn('[Monster] Audio file failed, using synthesized fallback:', err);
            this._initSynthMonsterSound();
        });
    }

    initSepiaNoise() {
        const noiseDiv = document.getElementById('sepia-noise');
        if (!noiseDiv) return;
        
        // Create canvas for noise generation
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 200;
        
        const generateSepiaNoise = () => {
            const imageData = ctx.createImageData(canvas.width, canvas.height);
            const data = imageData.data;
            
            for (let i = 0; i < data.length; i += 4) {
                // Generate sepia-toned noise
                const gray = Math.random() * 255;
                const r = Math.min(255, (gray * 0.393) + (gray * 0.769) + (gray * 0.189));
                const g = Math.min(255, (gray * 0.349) + (gray * 0.686) + (gray * 0.168));
                const b = Math.min(255, (gray * 0.272) + (gray * 0.534) + (gray * 0.131));
                
                // Random opacity for noise effect
                const alpha = Math.random() < 0.1 ? Math.random() * 100 : 0;
                
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = alpha;
            }
            
            ctx.putImageData(imageData, 0, 0);
            noiseDiv.style.backgroundImage = `url(${canvas.toDataURL()})`;
            noiseDiv.style.backgroundSize = '200px 200px';
        };
        
        // Update noise periodically
        const updateNoise = () => {
            generateSepiaNoise();
            setTimeout(updateNoise, 100);
        };
        
        updateNoise();
    }

    initMenuBackgroundMusic() {
        this.menuBackgroundMusic = new THREE.Audio(this.listener);
        this.menuBackgroundMusic.setLoop(true);
        this.menuBackgroundMusic.setVolume(0.3);
        
        const audioLoader = new THREE.AudioLoader();
        audioLoader.load('/sounds/scream3.mp3', (buffer) => {
            this.menuBackgroundMusic.setBuffer(buffer);
            if (!this.gameStarted) {
                this.menuBackgroundMusic.play();
            }
        });
    }

    initFlashlightSounds() {
        // Use light.mp3 for flashlight on/off sound
        this.flashlightOnSound = new THREE.Audio(this.listener);
        this.flashlightOffSound = new THREE.Audio(this.listener);

        // Try to set buffer immediately if already loaded
        if (this.flashlightSoundBuffer) {
            this.flashlightOnSound.setBuffer(this.flashlightSoundBuffer);
            this.flashlightOffSound.setBuffer(this.flashlightSoundBuffer);
            this.flashlightOnSound.setVolume(0.5);
            this.flashlightOffSound.setVolume(0.3);
        }

        // Attach to camera so it follows the player
        this.camera.add(this.flashlightOnSound);
        this.camera.add(this.flashlightOffSound);
    }

    _initSynthMonsterSound() {
        const ctx = this.monsterSound.context;

        // WaveShaper distortion curve (gritty demonic texture)
        const makeDistortion = (amount = 60) => {
            const n = 256, curve = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const x = (i * 2) / n - 1;
                curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
            }
            return curve;
        };

        // Shared effects chain: distortion -> lowpass -> delay (reverb) -> master
        const distNode = ctx.createWaveShaper();
        distNode.curve = makeDistortion(80);
        distNode.oversample = '2x';

        const masterFilter = ctx.createBiquadFilter();
        masterFilter.type = 'lowpass';
        masterFilter.frequency.value = 800;

        const delay = ctx.createDelay(1.0);
        delay.delayTime.value = 0.4;
        const delayFb = ctx.createGain();
        delayFb.gain.value = 0.45;
        const delayWet = ctx.createGain();
        delayWet.gain.value = 0.35;

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.0;

        distNode.connect(masterFilter);
        masterFilter.connect(masterGain);
        masterFilter.connect(delay);
        delay.connect(delayFb);
        delayFb.connect(delay);
        delay.connect(delayWet);
        delayWet.connect(masterGain);

        this.monsterSound.setNodeSource(masterGain);

        // Schedule a single demonic howl: pitch rise → peak hold → fall → silence
        const scheduleHowl = () => {
            if (!this.monsterSpawned) {
                // Check again later
                this._howlTimeout = setTimeout(scheduleHowl, 500);
                return;
            }
            const now = ctx.currentTime;

            const startFreq  = 80  + Math.random() * 50;   // 80–130 Hz start
            const peakFreq   = 380 + Math.random() * 220;  // 380–600 Hz peak (the wail)
            const riseTime   = 1.2 + Math.random() * 1.5;  // 1.2–2.7s
            const holdTime   = 0.3 + Math.random() * 0.8;  // 0.3–1.1s hold at peak
            const fallTime   = 1.5 + Math.random() * 2.0;  // 1.5–3.5s fall
            const silenceGap = 1.5 + Math.random() * 4.0;  // 1.5–5.5s silence between howls
            const totalSnd   = riseTime + holdTime + fallTime;

            // Create 3 slightly detuned oscillators for a thick layered howl
            const detunes = [0, 8, -12];
            detunes.forEach(det => {
                const osc = ctx.createOscillator();
                osc.type = 'sawtooth';
                const oscGain = ctx.createGain();
                oscGain.gain.value = 0;

                // Vibrato (wavering 'demon voice')
                const vibLfo = ctx.createOscillator();
                const vibGain = ctx.createGain();
                vibLfo.frequency.value = 4.5 + Math.random() * 2;
                vibGain.gain.value = 8 + Math.random() * 15;
                vibLfo.connect(vibGain);
                vibGain.connect(osc.frequency);
                vibLfo.start(now);
                vibLfo.stop(now + totalSnd + 0.1);

                // Pitch sweep: rise → peak → fall
                osc.frequency.setValueAtTime(startFreq + det, now);
                osc.frequency.linearRampToValueAtTime(peakFreq + det, now + riseTime);
                osc.frequency.setValueAtTime(peakFreq + det, now + riseTime + holdTime);
                osc.frequency.linearRampToValueAtTime(startFreq + det, now + totalSnd);

                // Amplitude envelope: fade in → sustain → fade out
                oscGain.gain.setValueAtTime(0, now);
                oscGain.gain.linearRampToValueAtTime(0.25, now + 0.3);
                oscGain.gain.setValueAtTime(0.25, now + totalSnd - 0.6);
                oscGain.gain.linearRampToValueAtTime(0, now + totalSnd);

                osc.connect(oscGain);
                oscGain.connect(distNode);
                osc.start(now);
                osc.stop(now + totalSnd + 0.1);
            });

            // Schedule next howl after this one ends + silence gap
            const nextDelay = (totalSnd + silenceGap) * 1000;
            this._howlTimeout = setTimeout(scheduleHowl, nextDelay);
        };

        scheduleHowl();
    }

    updateMonster(delta) {
        if (!this.monsterSpawned || !this.monster || this.isGameOver) return;
        
        const timeOffset = Date.now() / 200;
        this.monster.position.y = 0.5 + Math.sin(timeOffset) * 0.1;

        // Pulsating effect (slight scale variation)
        const pulseScale = 1.0 + Math.sin(Date.now() / 500) * 0.05;
        this.monster.scale.set(pulseScale, pulseScale, pulseScale);

        const currentCellX = Math.floor(this.monster.position.x + 0.5);
        const currentCellZ = Math.floor(this.monster.position.z + 0.5);
        
        const playerCellX = Math.floor(this.camera.position.x + 0.5);
        const playerCellZ = Math.floor(this.camera.position.z + 0.5);
        
        // Throttle expensive BFS to every 500ms
        const now = performance.now();
        if (now - this.lastPathUpdateTime > this.pathUpdateIntervalMs) {
            this.monsterPath = findPathBFS(
                this.grid, this.mazeSize, this.mazeSize,
                currentCellX, currentCellZ,
                playerCellX, playerCellZ
            );
            this.lastPathUpdateTime = now;
        }
        const path = this.monsterPath;
        
        if (path.length > 0) {
            const nextCell = path[0];
            const targetX = nextCell[0];
            const targetZ = nextCell[1];
            
            const dx = targetX - this.monster.position.x;
            const dz = targetZ - this.monster.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist > 0.05) {
                const moveX = (dx / dist) * this.monsterSpeed * delta;
                const moveZ = (dz / dist) * this.monsterSpeed * delta;
                this.monster.position.x += moveX;
                this.monster.position.z += moveZ;

                // Smooth rotation
                const angle = Math.atan2(dx, dz);
                const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                this.monster.quaternion.slerp(targetRotation, 0.1);
            }
        } else {
            // Direct line of sight fallback or close proximity
            const dx = this.camera.position.x - this.monster.position.x;
            const dz = this.camera.position.z - this.monster.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            
            if (dist > 0.05) {
                const moveX = (dx / dist) * this.monsterSpeed * delta;
                const moveZ = (dz / dist) * this.monsterSpeed * delta;
                this.monster.position.x += moveX;
                this.monster.position.z += moveZ;

                // Smooth rotation
                const angle = Math.atan2(dx, dz);
                const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                this.monster.quaternion.slerp(targetRotation, 0.1);
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
        
        this.playDeathScream();
        // Monster sound intentionally keeps playing here — creepy effect during death screen

        // Reset Game state without instantly restarting
        this.level = 1; 
        this.mazeSize = 25; 
        this.playerKeys = 0;
        this.slowPowerupRemaining = 0;
        this.monsterSpeed = this.baseMonsterSpeed;
        
        document.getElementById('keys').innerText = this.playerKeys;
        document.getElementById('monster-timer').textContent = "5.0s";
        document.getElementById('timer').textContent = "00:00";
        document.getElementById('bonus-indicator').style.display = 'none';
        
        // Hide the monster mesh but DON'T stop its sound — keeps playing on death screen
        if (this.monsterSpawned) {
            this.monster.visible = false;
            this.monsterSpawned = false;
        }
        this.startTime = null;
        
        // Return to start position
        this.camera.position.set(0, this.baseHeight, 1);
        this.camera.lookAt(1, this.baseHeight, 1);
        
        // Use timeout to delay heavy synchronous generation to avoid frame lock/lag
        setTimeout(() => {
            this.clearMaze();
            this.buildMaze();
        }, 50);
    }

    playDeathScream() {
        // Always play scream5.mp3 (index 4 in the array)
        if (this.screamBuffers.length < 5) return;
        
        const scream = new THREE.Audio(this.listener);
        const screamBuffer = this.screamBuffers[4]; // scream5.mp3 is at index 4
        
        scream.setBuffer(screamBuffer);
        scream.setVolume(2.1); // 3x louder
        scream.play();

        // Ensure scream is not longer than 5 seconds
        setTimeout(() => {
            if (scream.isPlaying) {
                scream.stop();
            }
        }, 5000);
    }

    updateExploration() {
        if (!this.useFogOfWar) return;

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
                if (!this.explorationGrid[y][x] && this.useFogOfWar) {
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
        this.startTime = Date.now();
        
        // Don't null out this.monster — it's permanently in scene, just hide it
        if (this.monsterSpawned) {
            if (this.monsterSound && this.monsterSound.isPlaying) {
                this.monsterSound.stop();
            }
            this.monster.visible = false;
            this.monsterSpawned = false;
        }
        
        this.clearMaze();
        this.buildMaze();
    }

    toggleMenu() {
        if (this.controls.isLocked) {
            // Pause the game
            this.isPaused = true;
            this.controls.unlock();
            
            // Play menu music
            if (this.menuBackgroundMusic && !this.menuBackgroundMusic.isPlaying) {
                this.menuBackgroundMusic.play();
            }
        } else {
            // Resume the game
            this.isPaused = false;
            this.controls.lock();
            
            // Stop menu music
            if (this.menuBackgroundMusic && this.menuBackgroundMusic.isPlaying) {
                this.menuBackgroundMusic.pause();
            }
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        const volume = this.isMuted ? 0 : 1;
        this.listener.setMasterVolume(volume);
        document.getElementById('mute-icon').textContent = this.isMuted ? '🔇' : '🔊';
        
        // Control preloader audio as well
        const preloaderScream = document.getElementById('preloader-scream');
        if (preloaderScream) {
            if (this.isMuted) {
                preloaderScream.pause();
            } else {
                // Resume if preloader is still visible
                const preloader = document.getElementById('preloader');
                if (preloader && preloader.style.display !== 'none') {
                    preloaderScream.play().catch(e => {
                        console.warn('Failed to resume preloader audio:', e);
                    });
                }
            }
        }
    }
}


new Game();
