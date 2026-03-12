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
        this.startingLevel = 1;
        this.level = 1;
        this.baseMazeSize = 10; // 30% smaller than previous 15
        this.mazeSize = this.baseMazeSize; // Will be calculated per level
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
        this.minimapSize = 180; // Increased by 20%
        this.minimapCanvas.width = this.minimapSize;
        this.minimapCanvas.height = this.minimapSize;

        this.textureLoader = new THREE.TextureLoader();
        this.textures = {}; // Will be populated in init()
        
        // Monster
        this.monster = null;
        this.isGameOver = false;
        this.monsterSpawned = false;
        this.basePlayerSpeed = 19.6; // Base player speed
        this.playerSpeed = this.basePlayerSpeed;

        // Difficulty settings (moved here to fix initialization order)
        this.difficulty = 'normal'; // Default difficulty (Normal as requested)
        this.difficultyMultipliers = {
            super_easy: 0.35, // 35% monster speed
            easy: 0.5,       // 50% monster speed
            normal: 0.8,     // 80% monster speed (original default)
            hard: 1.0        // 100% monster speed
        };

        // Effective player speed is playerSpeed / 10 (due to friction)
        // User wants monster to be 20% slower than player (normal difficulty)
        this.baseMonsterSpeed = (this.basePlayerSpeed / 10) * 0.8; 
        this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
        this.monsterTextures = [];
        this.useFogOfWar = true;
        this.monsterBaseVolume = 1.8;
        this.monsterVolume = 0;
        this.monsterVolumeTarget = 0;
        
        // Monster crouch animation
        this.monsterCrouchHeight = 0; // Current crouch offset
        this.monsterTargetCrouchHeight = 0; // Target crouch offset
        this.monsterCrouchSpeed = 3.0; // Speed of crouch animation
        
        // Monster spawn conditions
        this.playerLeftStartArea = false; // Has player moved 2 cells from start
        this.monsterSpawnDelay = this.getMonsterSpawnDelay(); // Level-based delay
        this.leftStartTime = null; // When player left start area
        
        // Powerups & Progression
        this.powerups = [];
        this.batteries = []; // Battery collection
        this.batteryLevel = 100; // Flashlight battery
        this.crouchKeyPressed = false;
        this.slowPowerupRemaining = 0;
        this.speedPowerupRemaining = 0;
        this.radarPowerupRemaining = 0; // New Tracker bonus
        this.monsterTrackerBeam = null;
        
        // Jump physics refinement
        this.gravityValue = 12.0;
        this.jumpForce = 3.2;

        
        // FPS Counter
        this.fpsFrameCount = 0;
        this.fpsPrevTime = performance.now();
        // this.fpsElement = document.getElementById('fps'); // Removed FPS counter

        // Crouch hint state
        this.crouchHintShown = localStorage.getItem('crouchHintShown') === 'true';

        // Play time tracking
        this.totalPlayTime = parseFloat(localStorage.getItem('totalPlayTime')) || 0;
        this.sessionPlayTime = 0;

        // Monster pathfinding throttle
        this.monsterPath = [];
        this.lastPathUpdateTime = 0;
        this.pathUpdateIntervalMs = 800; // Increased from 500ms for better performance on large maps
        this.currentPathIndex = 0;
        this.monsterTargetPosition = null;

        this.torchLights = [];
        
        // Audio
        this.listener = new THREE.AudioListener();
        this.camera.add(this.listener);
        this.monsterSound = null;
        this.screamBuffers = [];
        this.flashlightOnSound = null;
        this.flashlightOffSound = null;
        this.isMuted = localStorage.getItem('isMuted') === 'true';
        this.listener.setMasterVolume(this.isMuted ? 0 : 1);

        this.isFullscreenToggling = false;
        this.gameStarted = false;
        this.pauseTime = null;
        this.lastUnlockTime = 0;
        this.totalPausedDuration = 0;
        this.flashlightHintShown = false; // Track if flashlight hint has been shown
        this.fullscreenHintShown = false; // Track if fullscreen hint has been shown
        this.runMessageShown = false; // Track if RUN message has been shown
        this.mazesCompleted = 0; // Track completed mazes for statistics
        
        // Flashlight optimization
        this.flashlightDebounceTime = 0;
        this.flashlightDebounceDelay = 100; // ms
        
        // Global audio optimization
        this.audioDebounceTime = {};
        this.audioDebounceDelay = 50; // ms for general audio

        this.init();

    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)); // Limit pixel ratio for performance
        this.renderer.setClearColor(0x020502); // Match forest fog color
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap; // Less expensive than PCFSoftShadowMap
        this.renderer.powerPreference = "high-performance";
        this.renderer.antialias = window.devicePixelRatio <= 1; // Disable AA on high DPI displays
        
        // Set FPS limit to 144
        this.targetFPS = 144;
        this.frameInterval = 1000 / this.targetFPS;
        this.then = performance.now();
        
        // Try to enable high refresh rate
        this.enableHighFPS = true;
        this.displayRefreshRate = screen.refreshRate || 60; // Get actual display refresh rate
        
        if (this.enableHighFPS) {
            // Try to unlock frame rate for high refresh displays
            this.renderer.setAnimationLoop(() => this.animate());
            console.log(`Display refresh rate: ${this.displayRefreshRate}Hz, Target FPS: ${this.targetFPS}`);
        }
        
        document.body.appendChild(this.renderer.domElement);

        // Preload essential textures with tracking
        this.initTextureLoading();

        // Cool Flashlight (SpotLight attached to camera)
        this.flashlight = new THREE.SpotLight(0xc0d0ff, 2.5, 20, Math.PI / 6, 0.5, 2);
        this.flashlight.position.set(0.3, -0.2, -0.2);
        this.flashlight.castShadow = true;
        this.flashlight.shadow.mapSize.width = 512;
        this.flashlight.shadow.mapSize.height = 512;
        this.flashlight.visible = false; // Initially turned off
        this.camera.add(this.flashlight);

        // Flashlight Halo (Secondary soft light for scattering effect)
        this.flashlightHalo = new THREE.SpotLight(0xc0d0ff, 0.8, 10, Math.PI / 3, 0.8, 1);
        this.flashlightHalo.position.set(0.3, -0.2, -0.2);
        this.flashlightHalo.visible = false; // Initially turned off
        this.camera.add(this.flashlightHalo);

        // Flashlight targets (shared)
        this.flashlightTarget = new THREE.Object3D();
        this.flashlightTarget.position.set(0.3, -0.2, -5);
        this.camera.add(this.flashlightTarget);
        this.flashlight.target = this.flashlightTarget;
        this.flashlightHalo.target = this.flashlightTarget;

        this.scene.add(this.camera);

        // Create Monster Tracker Beam (Hidden by default)
        const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, 20, 8);
        const beamMat = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            transparent: true, 
            opacity: 0.6,
            depthWrite: false 
        });
        this.monsterTrackerBeam = new THREE.Mesh(beamGeo, beamMat);
        this.monsterTrackerBeam.visible = false;
        this.scene.add(this.monsterTrackerBeam);

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
        // Stars are scattered on a sphere of radius 490 (inside sky at 500).
        const STAR_COUNT = 1500;
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
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false // MUST be false: stars at distance 490 would be 100% fogged otherwise
        });
        this.starSizes = starSizes;
        this.stars = new THREE.Points(starGeo, this.starMaterial);
        this.stars.renderOrder = -1; // Always behind moon
        this.scene.add(this.stars);


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

        // Настраиваем освещение в зависимости от уровня
        this.updateLighting();

        // Sync mute icon
        const muteIcon = document.getElementById('mute-icon');
        if (muteIcon) muteIcon.textContent = this.isMuted ? '🔇' : '🔊';

        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');

        const startGame = () => {
            if (!this.gameStarted) {
                this.gameStarted = true;
                this.level = this.startingLevel; // Set level from selector
                startBtn.innerText = "CONTINUE";
                this.startTime = Date.now();
            } else if (this.isPaused) {
                // The 'lock' listener will handle the rest of the resume logic
                this.controls.lock();
                return;
            }

            const fowToggle = document.getElementById('fow-toggle');
            this.useFogOfWar = fowToggle ? fowToggle.checked : true;
            
            document.getElementById('game-over').style.display = 'none';
            this.isGameOver = false;
            
            // Initial game start setup or level restart
            // (Timer and monster reset only if NOT resuming from pause)
            if (!this.isPaused) {
                // Reset maze for new game
                this.clearMaze();
                this.buildMaze();
                
                if (this.monsterSpawned) {
                    this.monster.visible = false;
                    this.monsterSpawned = false;
                    this.monster.position.set(0, 0.5, 1);
                    this.monsterVolume = 0;
                    this.monsterVolumeTarget = 0;
                    // Reset pathfinding state
                    this.monsterPath = [];
                    this.currentPathIndex = 0;
                    this.monsterTargetPosition = null;
                    this.lastPathUpdateTime = 0;
                }
                
                // Reset spawn conditions
                this.playerLeftStartArea = false;
                this.leftStartTime = null;
                this.runMessageShown = false;
                
                if (this.monsterSound && this.monsterSound.isPlaying) {
                    this.stopAudioSafely(this.monsterSound);
                }

                // Reset fog if FoW is disabled
                if (!this.useFogOfWar) {
                    for (let y = 0; y < this.mazeSize; y++) {
                        for (let x = 0; x < this.mazeSize; x++) {
                            this.explorationGrid[y][x] = true;
                        }
                    }
                }
            }
            
            // Stop menu music when starting game
            if (this.menuBackgroundMusic && this.menuBackgroundMusic.isPlaying) {
                this.stopAudioSafely(this.menuBackgroundMusic);
            }
            
            this.controls.lock();
        };

        const toggleMute = this.toggleMute;

        this.toggleFullscreen = () => {
            // Prevent rapid toggling that could cause freezes
            if (this.isFullscreenToggling) {
                return;
            }

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
                if (exit) {
                    exit().catch(e => {
                        console.warn('Exit fullscreen error:', e);
                        this.isFullscreenToggling = false;
                    });
                } else {
                    this.isFullscreenToggling = false;
                }
            }
        };
        document.addEventListener('fullscreenchange', () => {
            const icon = document.getElementById('fullscreen-icon');
            if (icon) icon.textContent = document.fullscreenElement ? '✕' : '⛶';
            
            // Always reset toggling state when fullscreen changes
            this.isFullscreenToggling = false;
            
            // If we just entered fullscreen and game is active, restore pointer lock
            if (document.fullscreenElement && this.gameStarted && !this.isGameOver) {
                setTimeout(() => {
                    if (this.controls && !this.controls.isLocked) {
                        this.controls.lock();
                    }
                }, 100);
            }
        });
        document.addEventListener('webkitfullscreenchange', () => {
            const icon = document.getElementById('fullscreen-icon');
            if (icon) icon.textContent = document.webkitFullscreenElement ? '✕' : '⛶';
            
            // Always reset toggling state when fullscreen changes
            this.isFullscreenToggling = false;
            
            // If we just entered fullscreen and game is active, restore pointer lock
            if (document.webkitFullscreenElement && this.gameStarted && !this.isGameOver) {
                setTimeout(() => {
                    if (this.controls && !this.controls.isLocked) {
                        this.controls.lock();
                    }
                }, 100);
            }
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

        // Difficulty selection
        this.setupDifficultySelection();
        // Level selection
        this.setupLevelSelection();

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
            this.isPaused = false;
            document.getElementById('menu').style.display = 'none';
            document.getElementById('game-over').style.display = 'none';
            document.getElementById('hud').style.display = 'flex';
            document.getElementById('crosshair').style.display = 'block';
            
            // Hide control buttons when playing
            document.getElementById('mute-btn').style.display = 'none';
            document.getElementById('fullscreen-btn').style.display = 'none';
            
            // Pre-warm audio context to prevent first-frame lag
            if (this.monsterSound && this.monsterSound.context.state === 'suspended') {
                this.monsterSound.context.resume();
            }
            
            // Show appropriate hint after 1 second based on level
            if (this.level === 1 && !this.fullscreenHintShown) {
                setTimeout(() => {
                    // Only show if game is still active and hint hasn't been shown yet
                    if (!this.fullscreenHintShown && this.controls.isLocked && !this.isGameOver && this.level === 1) {
                        const hint = document.getElementById('fullscreen-hint');
                        hint.style.display = 'block';
                        hint.classList.add('show');
                        this.fullscreenHintShown = true;
                        
                        // Start fading after 3 seconds from appearance
                        setTimeout(() => {
                            if (hint && hint.style.display !== 'none') {
                                hint.classList.add('fade-out');
                            }
                        }, 3000);
                        
                        // Completely hide after 5 seconds from appearance
                        setTimeout(() => {
                            if (hint && hint.style.display !== 'none') {
                                hint.style.display = 'none';
                                hint.classList.remove('show', 'fade-out');
                            }
                        }, 5000);
                    }
                }, 1000); // Wait 1 second before showing hint
            } else if (this.level === 5 && !this.flashlightHintShown) {
                setTimeout(() => {
                    // Only show if game is still active and hint hasn't been shown yet
                    if (!this.flashlightHintShown && this.controls.isLocked && !this.isGameOver && this.level === 5) {
                        const hint = document.getElementById('flashlight-hint');
                        hint.style.display = 'block';
                        hint.classList.add('show');
                        this.flashlightHintShown = true;
                        
                        // Start fading after 3 seconds from appearance
                        setTimeout(() => {
                            if (hint && hint.style.display !== 'none') {
                                hint.classList.add('fade-out');
                            }
                        }, 3000);
                        
                        // Completely hide after 5 seconds from appearance
                        setTimeout(() => {
                            if (hint && hint.style.display !== 'none') {
                                hint.style.display = 'none';
                                hint.classList.remove('show', 'fade-out');
                            }
                        }, 5000);
                    }
                }, 10000); // Wait 10 seconds before showing hint
            }
            
            // Resume timer by adjusting startTime for the paused duration
            if (this.pauseTime) {
                const pausedFor = Date.now() - this.pauseTime;
                this.startTime += pausedFor;
                this.pauseTime = null;
            }

            // Stop menu music
            if (this.menuBackgroundMusic && this.menuBackgroundMusic.isPlaying) {
                this.stopAudioSafely(this.menuBackgroundMusic);
            }
        });

        this.controls.addEventListener('unlock', () => {
            // Only show menu if not game over and NOT toggling fullscreen
            if (!this.isGameOver && !this.isFullscreenToggling) {
                this.isPaused = true;
                this.pauseTime = Date.now();
                this.lastUnlockTime = Date.now();
                document.getElementById('menu').style.display = 'block';
                
                // Show control buttons when paused
                document.getElementById('mute-btn').style.display = 'flex';
                document.getElementById('fullscreen-btn').style.display = 'flex';
                
                // Play menu music
                if (this.menuBackgroundMusic && !this.menuBackgroundMusic.isPlaying) {
                    this.playAudioSafely(this.menuBackgroundMusic, 'menu');
                }
            } else if (!this.isGameOver && this.isFullscreenToggling) {
                // We're toggling fullscreen, so hide HUD but don't show menu
                this.isPaused = true;
                this.pauseTime = Date.now();
                this.lastUnlockTime = Date.now();
                
                // Show control buttons when toggling fullscreen
                document.getElementById('mute-btn').style.display = 'flex';
                document.getElementById('fullscreen-btn').style.display = 'flex';
            }
            
            // Always hide HUD and crosshair when unlocking
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
        
        // Show control buttons in menu initially
        document.getElementById('mute-btn').style.display = 'flex';
        document.getElementById('fullscreen-btn').style.display = 'flex';
        
        // Handle preloader scream audio with multiple attempts
        const preloaderScream = document.getElementById('preloader-scream');
        if (preloaderScream) {
            preloaderScream.volume = 0.4;
            preloaderScream.loop = true;
            
            // Try to play immediately
            const tryPlay = () => {
                setTimeout(() => {
                    preloaderScream.play().catch(e => {
                        console.warn('Preloader scream failed to play:', e);
                    });
                }, 0);
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
    }

    setupDifficultySelection() {
        const difficultyButtons = document.querySelectorAll('.difficulty-btn');
        const difficultyDescription = document.querySelector('.difficulty-description');
        
        const updateDifficulty = (selectedDifficulty) => {
            this.difficulty = selectedDifficulty;
            
            // Update button states
            difficultyButtons.forEach(btn => {
                if (btn.dataset.difficulty === selectedDifficulty) {
                    btn.classList.add('selected');
                } else {
                    btn.classList.remove('selected');
                }
            });
            
            // Update description
            const speedPercentage = Math.round(this.difficultyMultipliers[selectedDifficulty] * 100);
            const displayName = selectedDifficulty.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            difficultyDescription.textContent = `Monster speed: ${speedPercentage}% (${displayName})`;
            
            // Update monster speed if game is not started
            if (!this.gameStarted) {
                this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
            }
        };
        
        // Add click listeners to difficulty buttons
        difficultyButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const difficulty = btn.dataset.difficulty;
                updateDifficulty(difficulty);
            });
        });
        
        // Initialize with default difficulty
        updateDifficulty(this.difficulty);
    }

    setupLevelSelection() {
        const levelValSpan = document.getElementById('starting-level-val');
        const levelDecBtn = document.getElementById('level-dec');
        const levelIncBtn = document.getElementById('level-inc');
        
        const updateLevelUI = () => {
            if (levelValSpan) levelValSpan.textContent = this.startingLevel;
        };
        
        if (levelDecBtn) {
            levelDecBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.startingLevel > 1) {
                    this.startingLevel--;
                    updateLevelUI();
                }
            });
        }
        
        if (levelIncBtn) {
            levelIncBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.startingLevel < 99) {
                    this.startingLevel++;
                    updateLevelUI();
                }
            });
        }
    }

    initTextureLoading() {
        // Track texture loading
        let texturesLoaded = 0;
        const totalTextures = 5; // brick, floor, moon, monster_face_1, monster_face_2
        
        const checkAllLoaded = () => {
            texturesLoaded++;
            if (texturesLoaded >= totalTextures) {
                const preloader = document.getElementById('preloader');
                if (preloader) {
                    preloader.style.animation = 'fadeOut 1s ease-in-out';
                    setTimeout(() => {
                        preloader.style.display = 'none';
                        const preloaderScream = document.getElementById('preloader-scream');
                        if (preloaderScream && !preloaderScream.paused) {
                            preloaderScream.pause();
                            preloaderScream.currentTime = 0;
                        }
                    }, 1000);
                }
            }
        };
        
        const configTex = (url, repeatX, repeatY) => {
            return this.textureLoader.load(url, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                if (repeatX) tex.repeat.set(repeatX, repeatY);
                checkAllLoaded();
            });
        };

        this.textures.brick = configTex('/textures/brick.png', 1, 1);
        this.textures.floor = configTex('/textures/floor.png', 10, 10);
        this.textures.moon = configTex('/textures/moon.png');
        
        // Monster faces are tracked as well
        this.monsterTextures = [
            this.textureLoader.load('/textures/monster_face_1.png', () => checkAllLoaded()),
            this.textureLoader.load('/textures/monster_face_2.png', () => checkAllLoaded())
        ];
    }

    clearMaze() {
        try {
            // Remove all objects except camera and sky
            const toRemove = [];
            this.scene.traverse((object) => {
                if (object !== this.scene && 
                    object !== this.camera && 
                    object !== this.sky && 
                    object !== this.moon &&         // Never delete the moon
                    object !== this.sky &&
                    object !== this.stars &&         // Never delete the starfield
                    object !== this.moonLight &&
                    object !== this.monster &&      // Never remove the monster
                    object !== this.monsterSound && // Keep monster's heart beating
                    object !== this.monsterLight && // Keep monster's glow
                    object !== this.flashlight &&     // Never delete the flashlight
                    object !== this.flashlightHalo && // Never delete the flashlight halo
                    object !== this.flashlightTarget && // Never delete the flashlight target
                    object !== this.goalLight && // Never delete the goal light
                    !object.isAmbientLight) {
                    toRemove.push(object);
                }
            });

            toRemove.forEach(obj => {
                try {
                    if (obj.parent) obj.parent.remove(obj);
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        if (Array.isArray(obj.material)) {
                            obj.material.forEach(m => m.dispose());
                        } else {
                            obj.material.dispose();
                        }
                    }
                } catch (error) {
                    console.warn('Error disposing object:', error);
                }
            });

            // Stop torch fire sounds BEFORE clearing the array
            this.torchLights.forEach(torch => {
                try {
                    if (torch.fireSound && torch.fireSound.isPlaying) {
                        this.stopAudioSafely(torch.fireSound);
                    }
                } catch (error) {
                    console.warn('Error stopping torch sound:', error);
                }
            });

            this.walls = [];
            this.powerups = [];
            this.lockedDoors = [];
            this.crouchBeams = [];
            this.goal = null;
            this.goalLight = null;
            this.torchLights = [];
        } catch (error) {
            console.error('Error in clearMaze():', error);
            // Reset arrays even if disposal fails
            this.walls = [];
            this.powerups = [];
            this.lockedDoors = [];
            this.crouchBeams = [];
            this.goal = null;
            this.goalLight = null;
            this.torchLights = [];
        }
    }

    updateLighting() {
        // Удаляем старое освещение если оно есть
        const lightsToRemove = [];
        this.scene.traverse((object) => {
            if (object.isAmbientLight || object.isHemisphereLight || (this.moonLight && object === this.moonLight)) {
                lightsToRemove.push(object);
            }
        });
        
        lightsToRemove.forEach(light => {
            this.scene.remove(light);
        });

        // Настраиваем освещение в зависимости от уровня

        // Настраиваем освещение в зависимости от уровня (плавное затемнение)
        // Рассчитываем фактор прогрессии (0 = уровень 1, 1 = уровень 15+)
        const darkenFactor = Math.min(1.0, (this.level - 1) / 14);
        
        // 1. Fog parameters
        const fogColor = 0x040804;
        const fogNear = 0.5;
        // fogFar: L1=25, L15+=6
        const fogFar = 25 - (darkenFactor * 19);
        
        // 2. Ambient light (Color interpolates towards darker grey)
        // L1: 0xa0a8a0 (160, 168, 160) -> L15+: 0x485048 (72, 80, 72)
        const rA = Math.round(160 - (darkenFactor * (160 - 72)));
        const gA = Math.round(168 - (darkenFactor * (168 - 80)));
        const bA = Math.round(160 - (darkenFactor * (160 - 72)));
        const ambientColor = (rA << 16) | (gA << 8) | bA;
        // intensity: L1=0.50, L15+=0.20
        const ambientIntensity = 0.50 - (darkenFactor * 0.30);
        
        // 3. Hemisphere light
        // Sky L1: 0xc8e0ff (200, 224, 255) -> L15+: 0x88a0e0 (136, 160, 224)
        const rH = Math.round(200 - (darkenFactor * (200 - 136)));
        const gH = Math.round(224 - (darkenFactor * (224 - 160)));
        const bH = Math.round(255 - (darkenFactor * (255 - 224)));
        const hemiSkyColor = (rH << 16) | (gH << 8) | bH;
        const hemiGroundColor = 0x101308;
        // intensity: L1=0.25, L15+=0.06
        const hemiIntensity = 0.25 - (darkenFactor * 0.19);
        
        // 4. Moon light
        // L1: 0xd8e8d8 (216, 232, 216) -> L15+: 0x90a090 (144, 160, 144)
        const rM = Math.round(216 - (darkenFactor * (216 - 144)));
        const gM = Math.round(232 - (darkenFactor * (232 - 160)));
        const bM = Math.round(216 - (darkenFactor * (216 - 144)));
        const moonColor = (rM << 16) | (gM << 8) | bM;
        // intensity: L1=1.5, L15+=0.5
        const moonIntensity = 1.5 - (darkenFactor * 1.0);

        // Обновляем туман
        this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
        this.renderer.setClearColor(fogColor);

        // Создаем новое освещение
        const ambientLight = new THREE.AmbientLight(ambientColor, ambientIntensity);
        ambientLight.isAmbientLight = true; // Помечаем для последующего удаления
        this.scene.add(ambientLight);

        const hemiLight = new THREE.HemisphereLight(hemiSkyColor, hemiGroundColor, hemiIntensity);
        this.scene.add(hemiLight);

        this.moonLight = new THREE.DirectionalLight(moonColor, moonIntensity);
        this.moonLight.castShadow = true;
        this.moonLight.shadow.mapSize.width = 512;
        this.moonLight.shadow.mapSize.height = 512;
        this.moonLight.shadow.bias = -0.0005;
        this.moonLight.shadow.normalBias = 0.01;
        this.moonLight.shadow.radius = 1;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = 50;
        this.updateSunFrustum();
        this.scene.add(this.moonLight);
    }

    updateSunFrustum() {
        const d = Math.min(this.mazeSize, 30); // Limit shadow frustum size for performance
        this.moonLight.shadow.camera.left = -d;
        this.moonLight.shadow.camera.right = d;
        this.moonLight.shadow.camera.top = d;
        this.moonLight.shadow.camera.bottom = -d;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = Math.min(50, d * 1.5); // Dynamic far plane
        this.moonLight.shadow.camera.updateProjectionMatrix();
        // Optimized shadow map resolution
        this.moonLight.shadow.mapSize.width = 512;
        this.moonLight.shadow.mapSize.height = 512;
    }

    buildMaze() {
        // Calculate maze size for current level
        if (this.level === 1) {
            this.mazeSize = this.baseMazeSize; // Level 1: base size (10)
        } else {
            const sizeIncrease = Math.floor(this.baseMazeSize * 0.15 * (this.level - 1)); // 15% increase per level
            this.mazeSize = this.baseMazeSize + sizeIncrease;
        }
        
        // Ensure odd number for proper maze generation
        if (this.mazeSize % 2 === 0) {
            this.mazeSize++;
        }
        
        this.updateSunFrustum();
        const mazeGen = new Maze(this.mazeSize, this.mazeSize);
        this.grid = mazeGen.generate();
        
        // Initialize exploration grid
        this.explorationGrid = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));

        const wallMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.brick,
            color: 0xa0b0a0, // Subtle green-grey tint (mossy/forest look)
            shininess: 5,
            shadowSide: THREE.DoubleSide
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

        // Random exit position - either on right side or bottom side
        const exitSide = Math.random() < 0.5 ? 'right' : 'bottom';
        let exitX, exitZ;
        
        if (exitSide === 'right') {
            // Random position on right side (avoiding corners)
            exitX = this.mazeSize - 1;
            exitZ = Math.floor(Math.random() * (this.mazeSize - 4)) + 2; // Between 2 and mazeSize-2
        } else {
            // Random position on bottom side (avoiding corners)
            exitX = Math.floor(Math.random() * (this.mazeSize - 4)) + 2; // Between 2 and mazeSize-2
            exitZ = this.mazeSize - 1;
        }

        // Update maze grid for new exit position
        // Clear the new exit position (make it a passage)
        this.grid[exitZ][exitX] = 0;
        
        // Close the old default exit position (mazeSize-1, mazeSize-2) if it's different
        const oldExitX = this.mazeSize - 1;
        const oldExitZ = this.mazeSize - 2;
        if (oldExitX !== exitX || oldExitZ !== exitZ) {
            this.grid[oldExitZ][oldExitX] = 1; // Make it a wall
        }

        const emptySpaces = [];
        let torchCount = 0;
        // Dynamic torch limit based on maze size for performance
        const maxTorches = Math.min(20, Math.floor(this.mazeSize * 0.6));
        
        // Count walls and prepare instanced mesh
        let wallCount = 0;
        let decorBrickCount = 0;
        // Reduce decoration density on large maps
        const decorChance = this.mazeSize > 20 ? 0.7 : 0.3; // Reduced from 30 to 20
        
        for (let y = 0; y < this.mazeSize; y++) {
            for (let x = 0; x < this.mazeSize; x++) {
                if (this.grid[y][x] === 1) {
                    wallCount++;
                    if (Math.random() > decorChance) {
                        decorBrickCount += Math.floor(Math.random() * 2) + 1; // Max 2 bricks instead of 4
                    }
                } else {
                    const isStart = (x === 0 && y === 1);
                    const isEnd = (x === exitX && y === exitZ);
                    if (!isStart && !isEnd) {
                        emptySpaces.push({x, y});
                    }
                }
            }
        }

        const wallGeo = new THREE.BoxGeometry(1, 1, 1);
        this.wallInstancedMesh = new THREE.InstancedMesh(wallGeo, wallMaterial, wallCount);
        this.wallInstancedMesh.castShadow = true;
        this.wallInstancedMesh.receiveShadow = true;
        this.wallInstancedMesh.frustumCulled = true;
        this.scene.add(this.wallInstancedMesh);

        const brickGeo = new THREE.BoxGeometry(0.4, 1, 0.25); // Height will be scaled
        this.brickInstancedMesh = new THREE.InstancedMesh(brickGeo, wallMaterial, decorBrickCount);
        this.brickInstancedMesh.castShadow = true;
        this.brickInstancedMesh.receiveShadow = true;
        this.brickInstancedMesh.frustumCulled = true;
        this.scene.add(this.brickInstancedMesh);

        let wallIdx = 0;
        let brickIdx = 0;
        const dummy = new THREE.Object3D();

        for (let y = 0; y < this.mazeSize; y++) {
            for (let x = 0; x < this.mazeSize; x++) {
                if (this.grid[y][x] === 1) {
                    // Wall
                    const height = 1.1 + 0.5 + Math.random() * 0.5;
                    dummy.position.set(x, (height / 2) - 0.5, y);
                    dummy.scale.set(1, height, 1);
                    dummy.updateMatrix();
                    this.wallInstancedMesh.setMatrixAt(wallIdx++, dummy.matrix);

                    // Decor bricks
                    if (Math.random() > 0.3) {
                        const numBricks = Math.floor(Math.random() * 4) + 1;
                        for (let i = 0; i < numBricks; i++) {
                            const brickHeight = 0.1 + Math.random() * 0.25;
                            dummy.position.set(
                                x + (Math.random() - 0.5) * 0.5,
                                height - 0.5 + brickHeight / 2,
                                y + (Math.random() - 0.5) * 0.5
                            );
                            dummy.scale.set(1, brickHeight, 1);
                            dummy.updateMatrix();
                            this.brickInstancedMesh.setMatrixAt(brickIdx++, dummy.matrix);
                        }
                    }
                }
            }
        }

        // Find main path from start to exit
        const startPathX = 0, startPathY = 1;
        const mainPath = findPathBFS(this.grid, this.mazeSize, this.mazeSize, exitX, exitZ, startPathX, startPathY); // Reverse to get from exit to start
        


        // Instantiate maze objects (walls only — obstacles removed)
        // Walls are already instantiated above so we skip the duplicate loop.
        


        

      
        // Replace empty spaces with doors and spawn a key BEFORE the door 
        // We evaluate accessible spaces using BFS from start that STOPS at all door positions

        
        // --- KEY/DOOR SPAWN LOGIC REMOVED ---






        // --- ITEM SPAWNING (DISJOINT SETS) ---
        emptySpaces.sort(() => Math.random() - 0.5);
        
        let spaceIdx = 0;

        // 1. Spawn Powerups far from start area (after player leaves safe zone)
        const powerupTypes = this.getPowerupTypesForLevel();
        const powerupPositions = this.selectFarFromStartPositions(emptySpaces, powerupTypes.length, 8); // Min distance 8 from start
        for (let i = 0; i < powerupTypes.length && i < powerupPositions.length; i++) {
            const pos = powerupPositions[i];
            this.spawnPowerup(pos.x, pos.y, powerupTypes[i]);
        }

        // 2. Spawn Batteries (progressive: 0 on level 1, 1 on level 2, 2 on level 3, 3+ on level 4+)
        let numBatteries;
        if (this.level === 1) {
            numBatteries = 0; // Level 1: no batteries
        } else if (this.level === 2) {
            numBatteries = 1; // Level 2: minimal batteries  
        } else if (this.level === 3) {
            numBatteries = 2; // Level 3: few batteries
        } else {
            numBatteries = 3; // Level 4+: normal amount
        }
        
        const batteryPositions = this.selectFarFromStartPositions(emptySpaces, numBatteries, 8); // Min distance 8 from start
        for (const pos of batteryPositions) {
            this.spawnBattery(pos.x, pos.y);
        }

        // 3. Spawn Crouch Beams (disjoint from batteries) - avoid spawning near start (7 cells)
        const numBeams = Math.floor(emptySpaces.length * 0.05);
        const startX = 0, startZ = 1;
        for (let i = 0; i < numBeams && spaceIdx < emptySpaces.length; i++) {
            const s = emptySpaces[spaceIdx++];
            const dist = Math.sqrt(Math.pow(s.x - startX, 2) + Math.pow(s.y - startZ, 2));
            if (dist >= 7) { 
                this.spawnCrouchBeam(s.x, s.y);
            }
        }
        
        // --- TORCHES ---
        const potentialTorchSpaces = emptySpaces.slice(spaceIdx).sort(() => Math.random() - 0.5);
        
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

        // End Door (Open) frame
        this.createDoor(exitX, exitZ, true, exitSide);

        // Green glowing floor area instead of door panel
        const floorGlowGeometry = new THREE.BoxGeometry(1, 0.05, 1);
        const floorGlowMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00ff00, 
            emissive: 0x00ff00,
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.6
        });
        this.goal = new THREE.Mesh(floorGlowGeometry, floorGlowMaterial);
        this.goal.position.set(exitX, 0.025, exitZ); // Slightly above floor
        
        // Add green point light for better visibility
        this.goalLight = new THREE.PointLight(0x00ff00, 3, 10);
        this.goalLight.position.set(exitX, 0.5, exitZ); // Lower position for floor glow
        this.scene.add(this.goalLight);

        document.getElementById('level').textContent = this.level;

        this.camera.position.set(0, this.baseHeight, 1);
        this.camera.lookAt(2, this.baseHeight, 1); // Смотрим дальше в лабиринт
    }

    createDoor(x, z, isOpen, exitSide = null) {
        const doorMaterial = new THREE.MeshPhongMaterial({ 
            map: this.textures.floor,
            color: isOpen ? 0x00ff00 : 0x885533, // Green tint for open doors, dark wood for closed
            emissive: isOpen ? 0x00ff00 : 0x000000, // Green glow for open doors
            emissiveIntensity: isOpen ? 0.3 : 0,
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
            // Determine door orientation based on exit side
            let isRotated = false;
            if (exitSide === 'right') {
                // Exit is on right wall, so door should face inward (along -X axis)
                isRotated = true;
            }
            // For bottom wall exit, door faces inward (along -Z axis) - no rotation needed
            
            // Open door frame
            const frameGeo = new THREE.BoxGeometry(0.1, 1.1, 0.2);
            
            const leftFrame = new THREE.Mesh(frameGeo, doorMaterial);
            const rightFrame = new THREE.Mesh(frameGeo, doorMaterial);
            
            if (isRotated) {
                // For right wall exit: frames should be positioned along Z axis but rotated
                leftFrame.position.set(x, 0.55, z - 0.4);
                rightFrame.position.set(x, 0.55, z + 0.4);
                leftFrame.rotation.y = Math.PI / 2;
                rightFrame.rotation.y = Math.PI / 2;
            } else {
                // For bottom wall exit: frames positioned along X axis
                leftFrame.position.set(x - 0.4, 0.55, z);
                rightFrame.position.set(x + 0.4, 0.55, z);
            }
            
            leftFrame.castShadow = true;
            leftFrame.receiveShadow = true;
            this.scene.add(leftFrame);

            rightFrame.castShadow = true;
            rightFrame.receiveShadow = true;
            this.scene.add(rightFrame);

            // Top frame with proper dimensions based on orientation
            const topGeo = isRotated ? 
                new THREE.BoxGeometry(1, 0.2, 0.1) : // Rotated: longer along X
                new THREE.BoxGeometry(0.1, 0.2, 1);  // Standard: longer along Z
            const topFrame = new THREE.Mesh(topGeo, doorMaterial);
            topFrame.position.set(x, 1.2, z); // 1.1 + 0.1
            topFrame.castShadow = true;
            topFrame.receiveShadow = true;
            if (isRotated) {
                topFrame.rotation.y = Math.PI / 2;
            }
            this.scene.add(topFrame);
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
    
    getPowerupTypesForLevel() {
        const types = [];
        
        // Level 1: no bonuses at all
        if (this.level === 1) {
            // No bonuses - return empty array
        }
        // Level 2: very few bonuses (25% chance of 1 bonus)
        else if (this.level === 2) {
            const rand = Math.random();
            if (rand < 0.25) {
                // Only one type of bonus, equal probability
                const bonusType = Math.random() < 0.33 ? 'speed' : (Math.random() < 0.5 ? 'slow' : 'radar');
                types.push(bonusType);
            }
        }
        // Level 3: few bonuses (50% chance of 1-2 bonuses)
        else if (this.level === 3) {
            const rand = Math.random();
            if (rand < 0.5) {
                // Guaranteed one bonus
                types.push('speed');
                // 30% chance of second bonus
                if (Math.random() < 0.3) {
                    const secondType = Math.random() < 0.5 ? 'slow' : 'radar';
                    types.push(secondType);
                }
            }
        }
        // Level 4+: normal amount (what was previously level 1)
        else {
            // This matches the previous "level 1-2" logic
            const rand = Math.random();
            if (rand < 0.3) types.push('speed');      // 30% chance
            else if (rand < 0.5) types.push('slow');  // 20% chance
            else if (rand < 0.6) types.push('radar');  // 10% chance
            // 40% chance of no bonuses at all
        }
        
        return types;
    }

    selectDistantPositions(availableSpaces, count, minDistance) {
        const positions = [];
        const usedSpaces = [...availableSpaces];
        
        for (let i = 0; i < count && usedSpaces.length > 0; i++) {
            // Pick random position
            const randomIndex = Math.floor(Math.random() * usedSpaces.length);
            const selectedPos = usedSpaces[randomIndex];
            positions.push(selectedPos);
            
            // Remove positions that are too close to the selected one
            usedSpaces.splice(randomIndex, 1);
            
            for (let j = usedSpaces.length - 1; j >= 0; j--) {
                const pos = usedSpaces[j];
                const distance = Math.sqrt(
                    Math.pow(pos.x - selectedPos.x, 2) + 
                    Math.pow(pos.y - selectedPos.y, 2)
                );
                
                if (distance < minDistance) {
                    usedSpaces.splice(j, 1);
                }
            }
        }
        
        return positions;
    }

    selectNearStartPositions(availableSpaces, count, maxDistance) {
        const positions = [];
        const startX = 0, startZ = 1; // Start position
        
        // Filter spaces that are within maxDistance from start
        const nearStartSpaces = availableSpaces.filter(space => {
            const distance = Math.sqrt(
                Math.pow(space.x - startX, 2) + 
                Math.pow(space.y - startZ, 2)
            );
            return distance <= maxDistance;
        });
        
        // Shuffle the near-start spaces
        nearStartSpaces.sort(() => Math.random() - 0.5);
        
        // Take the first 'count' positions (or fewer if not enough spaces)
        for (let i = 0; i < count && i < nearStartSpaces.length; i++) {
            positions.push(nearStartSpaces[i]);
        }
        
        return positions;
    }

    selectFarFromStartPositions(availableSpaces, count, minDistance) {
        const positions = [];
        const startX = 0, startZ = 1; // Start position
        
        // Filter spaces that are at least minDistance from start
        const farFromStartSpaces = availableSpaces.filter(space => {
            const distance = Math.sqrt(
                Math.pow(space.x - startX, 2) + 
                Math.pow(space.y - startZ, 2)
            );
            return distance >= minDistance;
        });
        
        // Shuffle the far-from-start spaces
        farFromStartSpaces.sort(() => Math.random() - 0.5);
        
        // Take the first 'count' positions (or fewer if not enough spaces)
        for (let i = 0; i < count && i < farFromStartSpaces.length; i++) {
            positions.push(farFromStartSpaces[i]);
        }
        
        return positions;
    }

    spawnPowerup(x, z, type) {
        // Create icon-only sprite (no text)
        const iconSprite = this.createPowerupIcon(type);
        
        // Use Sprite for billboard effect (always faces camera)
        const material = new THREE.SpriteMaterial({ 
            map: iconSprite,
            transparent: true,
            alphaTest: 0.1,
            fog: false
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(0.8, 0.8, 1); // Size of the icon
        sprite.position.set(x, 0.8, z); // Slightly above ground
        
        // Create text label below icon
        const labelText = this.getPowerupLabelText(type);
        const textSprite = this.createPowerupText(labelText);
        const textMaterial = new THREE.SpriteMaterial({ 
            map: textSprite,
            transparent: true,
            alphaTest: 0.1,
            fog: false
        });
        
        const textSpriteObj = new THREE.Sprite(textMaterial);
        textSpriteObj.scale.set(1.2, 0.3, 1); // Text size
        textSpriteObj.position.set(x, 0.4, z); // Below the icon
        
        // Create group for icon + text
        const group = new THREE.Group();
        group.add(sprite);
        group.add(textSpriteObj);
        group.position.set(x, 0, z);
        
        // Store rotation animation data
        sprite.userData = { 
            type: type, 
            isPowerup: true,
            rotationOffset: Math.random() * Math.PI * 2, // Random starting rotation
            lastRotationTime: 0
        };
        
        group.userData = { type: type, isPowerupGroup: true };
        
        this.scene.add(group);
        this.powerups.push(group);
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

        // Add percentage text above battery
        const percentTex = this.createCoinTexture('+25%', '#00ff00');
        const textGeo = new THREE.PlaneGeometry(0.3, 0.1);
        const textMat = new THREE.MeshBasicMaterial({ 
            map: percentTex, 
            transparent: true,
            side: THREE.DoubleSide
        });
        const textMesh = new THREE.Mesh(textGeo, textMat);
        textMesh.position.y = 0.35;
        group.add(textMesh);

        group.position.set(x, 0.4, z);

        this.scene.add(group);
        this.batteries.push(group);
    }

    getPowerupLabelText(type) {
        const labels = {
            'speed': 'Speed Boost',
            'slow': 'Slow Monster',
            'radar': 'Monster Tracker'
        };
        return labels[type] || 'Powerup';
    }

    createPowerupText(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, 256, 64);
        
        // Border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 254, 62);
        
        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 128, 32);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    createPowerupIcon(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        
        // Background circle
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(64, 64, 56, 0, Math.PI * 2);
        ctx.fill();
        
        // Colored border
        const colors = {
            'speed': '#0088ff',
            'slow': '#ffff00', 
            'radar': '#ff0000'
        };
        
        ctx.strokeStyle = colors[type] || '#888888';
        ctx.lineWidth = 8;
        ctx.stroke();
        
        // Draw icon based on type
        ctx.fillStyle = colors[type] || '#888888';
        ctx.strokeStyle = colors[type] || '#888888';
        ctx.lineWidth = 4;
        
        switch(type) {
            case 'speed':
                // Lightning bolt icon
                ctx.beginPath();
                ctx.moveTo(40, 30);
                ctx.lineTo(55, 50);
                ctx.lineTo(50, 50);
                ctx.lineTo(88, 98);
                ctx.lineTo(73, 78);
                ctx.lineTo(78, 78);
                ctx.closePath();
                ctx.fill();
                break;
                
            case 'slow':
                // Clock/slow icon
                ctx.beginPath();
                ctx.arc(64, 64, 25, 0, Math.PI * 1.5);
                ctx.stroke();
                // Clock hands
                ctx.beginPath();
                ctx.moveTo(64, 64);
                ctx.lineTo(64, 45);
                ctx.moveTo(64, 64);
                ctx.lineTo(80, 64);
                ctx.stroke();
                break;
                
            case 'radar':
                // Radar/pulse icon
                ctx.beginPath();
                ctx.arc(64, 64, 15, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(64, 64, 25, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(64, 64, 35, 0, Math.PI * 2);
                ctx.stroke();
                // Pulse lines
                for(let i = 0; i < 4; i++) {
                    const angle = (i * Math.PI / 2) + Math.PI / 4;
                    ctx.beginPath();
                    ctx.moveTo(64 + Math.cos(angle) * 15, 64 + Math.sin(angle) * 15);
                    ctx.lineTo(64 + Math.cos(angle) * 35, 64 + Math.sin(angle) * 35);
                    ctx.stroke();
                }
                break;
        }
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
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

    spawnCrouchBeam(x, z) {
        // We clone the texture to adjust its UV mapping specifically for the beam
        // This ensures the bricks run horizontally and at the correct scale
        const beamTex = this.textures.brick.clone();
        // Only set needsUpdate if the original texture has an image, otherwise Three.js will warn.
        // The renderer will automatically handle the update when the image actually loads.
        if (this.textures.brick.image) {
            beamTex.needsUpdate = true;
        }
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
            case 'KeyF':
                if (this.flashlight) {
                    const willTurnOn = !this.flashlight.visible;
                    
                    // Batch light visibility changes for performance
                    this.flashlight.visible = willTurnOn;
                    if (this.flashlightHalo) this.flashlightHalo.visible = willTurnOn;

                    // Optimize audio operations - use async to prevent blocking
                    if (!this.isMuted) {
                        // Stop any playing sounds first
                        if (willTurnOn && this.flashlightOnSound?.isPlaying) {
                            this.flashlightOnSound.stop();
                        }
                        if (!willTurnOn && this.flashlightOffSound?.isPlaying) {
                            this.flashlightOffSound.stop();
                        }

                        // Play sound with minimal delay
                        setTimeout(() => {
                            try {
                                if (willTurnOn && this.flashlightOnSound) {
                                    this.flashlightOnSound.play();
                                } else if (!willTurnOn && this.flashlightOffSound) {
                                    this.flashlightOffSound.play();
                                }
                            } catch (e) {
                                console.warn('Flashlight sound failed:', e);
                            }
                        }, 0);
                    }
                }
                break;
            case 'KeyL':
                if (this.toggleFullscreen) this.toggleFullscreen();
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
            case 'Escape':
                if (this.gameStarted && !this.isGameOver && this.isPaused) {
                    // Debounce: verify that this is not the release of the key that just paused the game
                    if (Date.now() - this.lastUnlockTime > 250) {
                        this.controls.lock();
                    }
                }
                break;
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
        // Don't call requestAnimationFrame manually when using setAnimationLoop
        if (!this.enableHighFPS) {
            requestAnimationFrame(() => this.animate());
        }
        
        // FPS limiting
        const now = performance.now();
        const elapsed = now - this.then;
        
        if (elapsed > this.frameInterval) {
            this.then = now - (elapsed % this.frameInterval);
            
            const time = now;
            const delta = Math.min((time - this.prevTime) / 1000, 0.1);
            this.prevTime = time;
            this.fpsFrameCount++;

            // Update FPS counter every second for all map sizes
            if (time - this.fpsPrevTime >= 1000) {
                const fps = this.fpsFrameCount;
                this.fpsFrameCount = 0;
                this.fpsPrevTime = time;
                
                // FPS display removed
            }

        // Adaptive quality system removed (FPS-based)

        // Cloud animation disabled for performance

        // --- SIMPLIFIED TORCH FLICKER LOGIC ---
        const timeNow = time * 0.003; // Slower, simpler animation

        // Simplified flicker for environment torches
        this.torchLights.forEach(t => {
            if (t.light) {
                // Simple sine wave flicker without random noise
                t.light.intensity = t.baseIntensity + Math.sin(timeNow + t.gridX) * 0.05;
                // Remove complex flame mesh scaling for performance
            }
        });

        // Simplified steady flashlight
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

        // Battery logic (paused when menu is open / controls unlocked)
        if (this.controls.isLocked && !this.isGameOver) {
            if (this.flashlight && this.flashlight.visible) {
                // Depletion when flashlight is on
                const depletionRate = 3; // 3% per second
                this.batteryLevel -= depletionRate * delta;
                
                if (this.batteryLevel <= 0) {
                    this.batteryLevel = 0;
                    this.flashlight.visible = false;
                    if (this.flashlightHalo) this.flashlightHalo.visible = false;
                }
            } else if (this.batteryLevel < 100) {
                // Regeneration when flashlight is off
                const regenerationRate = 0.5; // 0.5% per second
                this.batteryLevel = Math.min(100, this.batteryLevel + regenerationRate * delta);
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

        // Crouch hint logic: show if player is near a crouch beam (type 4) for the first time
        if (this.controls.isLocked && !this.isGameOver && !this.crouchHintShown) {
            const px = this.camera.position.x;
            const pz = this.camera.position.z;
            const checkRadius = 1.5; // "one cube" distance is roughly 1, but 1.5 gives a bit more breathing room
            
            let nearBeam = false;
            const minX = Math.floor(px - checkRadius + 0.5);
            const maxX = Math.floor(px + checkRadius + 0.5);
            const minZ = Math.floor(pz - checkRadius + 0.5);
            const maxZ = Math.floor(pz + checkRadius + 0.5);

            for (let gz = minZ; gz <= maxZ; gz++) {
                for (let gx = minX; gx <= maxX; gx++) {
                    if (gx >= 0 && gx < this.mazeSize && gz >= 0 && gz < this.mazeSize) {
                        if (this.grid[gz][gx] === 4) {
                            nearBeam = true;
                            break;
                        }
                    }
                }
                if (nearBeam) break;
            }

            if (nearBeam) {
                const hint = document.getElementById('crouch-hint');
                if (hint) {
                    hint.style.display = 'block';
                    setTimeout(() => hint.classList.add('show'), 10);
                    
                    this.crouchHintShown = true;
                    localStorage.setItem('crouchHintShown', 'true');

                    // Auto-hide after 5 seconds
                    setTimeout(() => {
                        hint.classList.add('fade-out');
                        setTimeout(() => {
                            hint.style.display = 'none';
                            hint.classList.remove('show', 'fade-out');
                        }, 500);
                    }, 5000);
                }
            }
        }




            // FPS calculation removed

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


            // Check if player left start area
            this.checkPlayerLeftStartArea();
            
            if (this.startTime && !this.monsterSpawned) {
                // Start 5-second countdown when player leaves start area
                let spawnConditionMet = false;
                let timeUntilSpawn = 999;
                
                if (this.playerLeftStartArea && this.leftStartTime) {
                    const elapsed = Date.now() - this.leftStartTime;
                    timeUntilSpawn = Math.max(0, 5000 - elapsed) / 1000; // 5 seconds
                    spawnConditionMet = elapsed >= 5000;
                }
                
                const countdownElement = document.getElementById('monster-countdown');
                const numberElement = countdownElement.querySelector('.countdown-number');
                const textElement = countdownElement.querySelector('.countdown-text');
                
                if (spawnConditionMet) {
                    this.spawnMonster();
                    // Show "RUN" message
                    numberElement.textContent = "RUN";
                    numberElement.className = "countdown-number run";
                    textElement.textContent = "MONSTER IS HERE";
                    this.runMessageShown = true;
                    
                    // Make sure it's visible
                    countdownElement.style.display = 'block';
                    
                    // Hide after 3 seconds
                    setTimeout(() => {
                        countdownElement.style.display = 'none';
                    }, 3000);
                } else if (this.playerLeftStartArea && this.leftStartTime) {
                    // Show countdown after leaving safe zone
                    countdownElement.style.display = 'block';
                    const displayTime = Math.ceil(timeUntilSpawn);
                    numberElement.textContent = displayTime;
                    
                    // Add warning classes based on time remaining
                    numberElement.className = "countdown-number";
                    if (timeUntilSpawn <= 2) {
                        numberElement.classList.add("danger"); // Red, fast pulse
                    } else if (timeUntilSpawn <= 3) {
                        numberElement.classList.add("warning"); // Yellow, medium pulse
                    }
                    textElement.textContent = "MONSTER COMING";
                } else {
                    // Hide countdown when in safe zone
                    countdownElement.style.display = 'none';
                }
            } else if (this.monsterSpawned && !this.runMessageShown) {
                // Hide countdown if monster is already spawned and RUN message was shown
                const countdownElement = document.getElementById('monster-countdown');
                countdownElement.style.display = 'none';
            } else {
                // Initial state before game starts
                const countdownElement = document.getElementById('monster-countdown');
                countdownElement.style.display = 'none';
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
            const speed = this.isCrouching ? this.playerSpeed * 0.3 : this.playerSpeed;

            if (this.moveForward || this.moveBackward) this.velocity.z -= this.direction.z * speed * delta;
            if (this.moveLeft || this.moveRight) this.velocity.x -= this.direction.x * speed * delta;

            // Target camera height based on crouch state
            const targetHeight = this.isCrouching ? this.crouchHeight : this.baseHeight;


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


            // --- POWERUP LOGIC ---
            for (let i = this.powerups.length - 1; i >= 0; i--) {
                const powerup = this.powerups[i];
                
                // Handle both old sprites and new groups
                let targetSprite = null;
                if (powerup.userData.isPowerupGroup) {
                    // New format: group with icon sprite as first child
                    targetSprite = powerup.children[0];
                } else if (powerup.userData.isPowerup) {
                    // Old format: direct sprite
                    targetSprite = powerup;
                }
                
                // Horizontal rotation animation for sprites
                if (targetSprite && targetSprite.userData.isPowerup) {
                    const currentTime = performance.now();
                    const timeDiff = (currentTime - (targetSprite.userData.lastRotationTime || 0)) / 1000;
                    targetSprite.userData.lastRotationTime = currentTime;
                    
                    // Gentle horizontal rotation
                    const rotationSpeed = 1.5; // radians per second
                    targetSprite.userData.rotationOffset += rotationSpeed * timeDiff;
                    
                    // Apply rotation to sprite material (creates horizontal spin effect)
                    const rotationAmount = Math.sin(targetSprite.userData.rotationOffset) * 0.3;
                    targetSprite.material.rotation = rotationAmount;
                }
                
                // Collection logic
                if (this.camera.position.distanceTo(powerup.position) < 0.8) {
                    this.scene.remove(powerup);
                    this.powerups.splice(i, 1);
                    this.applyPowerup(powerup.userData.type);
                }
            }

            // Powerup timers and effects
            if (this.speedPowerupRemaining > 0) {
                this.speedPowerupRemaining -= delta;
                document.getElementById('bonus-speed-time').innerText = Math.ceil(this.speedPowerupRemaining) + 's';
                if (this.speedPowerupRemaining <= 0) {
                    this.playerSpeed = this.basePlayerSpeed;
                    document.getElementById('bonus-speed-indicator').style.display = 'none';
                }
            }

            if (this.slowPowerupRemaining > 0) {
                this.slowPowerupRemaining -= delta;
                document.getElementById('bonus-time').innerText = Math.ceil(this.slowPowerupRemaining) + 's';
                if (this.slowPowerupRemaining <= 0) {
                    this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
                    document.getElementById('bonus-indicator').style.display = 'none';
                }
            }

            if (this.radarPowerupRemaining > 0) {
                this.radarPowerupRemaining -= delta;
                document.getElementById('bonus-radar-time').innerText = Math.ceil(this.radarPowerupRemaining) + 's';
                
                // Update beam position
                if (this.monsterTrackerBeam && this.monster) {
                    this.monsterTrackerBeam.visible = true;
                    this.monsterTrackerBeam.position.set(this.monster.position.x, 10, this.monster.position.z);
                }

                if (this.radarPowerupRemaining <= 0) {
                    document.getElementById('bonus-radar-indicator').style.display = 'none';
                    if (this.monsterTrackerBeam) this.monsterTrackerBeam.visible = false;
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

            // Throttle heavy exploration and minimap updates (every 5 frames)
            if (this.fpsFrameCount % 5 === 0) {
                this.updateExploration();
                this.drawMinimap();
            }

            const distToGoal = this.camera.position.distanceTo(this.goal.position);
            if (this.goal && distToGoal < 0.8) {
                this.nextLevel();
            }


            if (this.startTime) {
                this.sessionPlayTime = Date.now() - this.startTime + this.totalPausedDuration;
            }
        }


        if (this.goal) {
            // Floor glow doesn't need to face player, but keep pulsing effect
            const pulseIntensity = Math.sin(performance.now() * 0.003) * 0.3 + 0.7;
            this.goal.material.emissiveIntensity = 1.2 * pulseIntensity;
            
            // Subtle floating animation for the floor glow
            this.goal.position.y = 0.025 + Math.sin(performance.now() * 0.002) * 0.02;
        }

        this.renderer.render(this.scene, this.camera);
        } // Close FPS limiting block
    }

    spawnMonster() {
        if (this.monsterSpawned) return;

        // Monster is already in the scene from init, just unhide and position
        this.monster.position.set(0, 0.5, 1);
        this.monster.visible = true;
        
        // Reset pathfinding state when spawning
        this.monsterPath = [];
        this.currentPathIndex = 0;
        this.monsterTargetPosition = null;
        this.lastPathUpdateTime = 0;
        
        // Reset crouch animation state
        this.monsterCrouchHeight = 0;
        this.monsterTargetCrouchHeight = 0;
        
        // Pre-calculate initial path to avoid first-frame lag
        const currentCellX = Math.floor(this.monster.position.x + 0.5);
        const currentCellZ = Math.floor(this.monster.position.z + 0.5);
        const playerCellX = Math.floor(this.camera.position.x + 0.5);
        const playerCellZ = Math.floor(this.camera.position.z + 0.5);
        
        const initialPath = findPathBFS(
            this.grid, this.mazeSize, this.mazeSize,
            currentCellX, currentCellZ,
            playerCellX, playerCellZ,
            true // isMonster
        );
        
        if (initialPath.length > 0) {
            this.monsterPath = initialPath;
            this.updateMonsterTarget();
        }
        
        // Delayed audio start to prevent crackling and add dramatic effect
        setTimeout(() => {
            if (this.monsterSound) {
                if (this.monsterSound.context.state === 'suspended') {
                    this.monsterSound.context.resume();
                }
                if (!this.monsterSound.isPlaying) {
                    this.playAudioSafely(this.monsterSound, 'monster');
                }
                // Start from silence with dramatic fade up
                this.monsterVolume = 0;
                this.monsterVolumeTarget = this.monsterBaseVolume * 1.2; // Initial boost for dramatic entrance
            }
        }, 800); // Delay audio by 800ms for smoother spawn
        
        // After 2 seconds, reduce to normal volume
        setTimeout(() => {
            if (this.monsterSound && this.monsterSpawned) {
                this.monsterVolumeTarget = this.monsterBaseVolume;
            }
        }, 2800);
        
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
        fireSound.panner.panningModel = 'HRTF'; // Better spatial positioning
        fireSound.setBuffer(this.fireSoundBuffer);
        fireSound.setLoop(true);
        fireSound.setRefDistance(1.5); // Full volume within 1.5 units
        fireSound.setRolloffFactor(2.5); // Faster falloff for torches for better localization
        fireSound.setMaxDistance(15);    // Don't process sounds from very far torches
        fireSound.setDistanceModel('inverse'); 
        fireSound.setVolume(0.8);
        
        torchData.group.add(fireSound);
        torchData.fireSound = fireSound;
        
        // Start playing
        this.playAudioSafely(fireSound, 'torch');
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
        this.monsterSound.panner.panningModel = 'HRTF'; // Better spatial positioning

        // 3D Positional Audio — louder as player approaches
        this.monsterSound.setDistanceModel('inverse');
        this.monsterSound.setRefDistance(2.0);   // Full volume within 2 units
        this.monsterSound.setMaxDistance(100);
        this.monsterSound.setRolloffFactor(1.8); // Slightly faster falloff for better "geolocation"
        this.monsterSound.setLoop(true);
        
        // Directionality: Monster sounds are louder when it's facing the player
        this.monsterSound.setDirectionalCone(60, 180, 0.4); 
        
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
                this.playAudioSafely(this.menuBackgroundMusic, 'menu');
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

    updateMonsterPerformance() {
        const distance = this.camera.position.distanceTo(this.monster.position);
        
        // Aggressive optimization based on distance
        if (distance > 20) {
            // Far away - minimal rendering
            this.monsterLight.castShadow = false;
            this.monsterLight.intensity = 0.2;
            this.monster.visible = false; // Hide completely when far
        } else if (distance > 15) {
            // Medium distance - reduced quality
            this.monsterLight.castShadow = false;
            this.monsterLight.intensity = 0.5;
            this.monster.visible = true;
        } else if (distance > 8) {
            // Close - reduced shadows
            this.monsterLight.castShadow = false;
            this.monsterLight.intensity = 1.5;
            this.monster.visible = true;
        } else {
            // Very close - full quality
            this.monsterLight.castShadow = true;
            this.monsterLight.intensity = 2;
            this.monster.visible = true;
        }
    }

    updateMonster(delta) {
        if (!this.monsterSpawned || !this.monster || this.isGameOver) return;
        
        // Optimized shadows based on distance
        this.updateMonsterPerformance();
        
        const timeOffset = Date.now() / 200;
        
        // Night-time lowering effect - monster crouches slightly during darker levels
        const nightLowering = this.level > 2 ? 0.1 : 0; // Lower more on darker levels
        
        // Check if monster needs to crouch for upcoming obstacles
        const needsToCrouch = this.checkMonsterCrouchNeed();
        this.monsterTargetCrouchHeight = needsToCrouch ? 0.25 : 0; // Crouch down by 0.25 units
        
        // Smooth crouch animation
        if (Math.abs(this.monsterCrouchHeight - this.monsterTargetCrouchHeight) > 0.01) {
            const crouchDiff = this.monsterTargetCrouchHeight - this.monsterCrouchHeight;
            this.monsterCrouchHeight += crouchDiff * this.monsterCrouchSpeed * delta;
        } else {
            this.monsterCrouchHeight = this.monsterTargetCrouchHeight;
        }
        
        // Apply all height effects
        this.monster.position.y = 0.5 + Math.sin(timeOffset) * 0.1 - nightLowering - this.monsterCrouchHeight;

        // Pulsating effect (slight scale variation) - DISABLED
        // const pulseScale = 1.0 + Math.sin(Date.now() / 500) * 0.05;
        // this.monster.scale.set(pulseScale, pulseScale, pulseScale);
        
        // Slight scale adjustment when crouching for visual feedback
        const crouchScale = 1.0 - (this.monsterCrouchHeight * 0.15); // Slightly smaller when crouched
        this.monster.scale.set(crouchScale, 1.0, crouchScale);

        // Direct movement towards player with obstacle avoidance
        const dx = this.camera.position.x - this.monster.position.x;
        const dz = this.camera.position.z - this.monster.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist > 0.05) {
            // Check if there's a clear line of sight
            const hasLineOfSight = this.checkLineOfSight(
                this.monster.position.x, 
                this.monster.position.z,
                this.camera.position.x, 
                this.camera.position.z
            );
            
            let targetX, targetZ;
            
            if (hasLineOfSight) {
                // Direct line of sight - move straight to player
                targetX = this.camera.position.x;
                targetZ = this.camera.position.z;
            } else {
                // No line of sight - use pathfinding but update more frequently
                const now = performance.now();
                if (now - this.lastPathUpdateTime > 400) { // Reduced from 800ms for more responsive movement
                    const currentCellX = Math.floor(this.monster.position.x + 0.5);
                    const currentCellZ = Math.floor(this.monster.position.z + 0.5);
                    const playerCellX = Math.floor(this.camera.position.x + 0.5);
                    const playerCellZ = Math.floor(this.camera.position.z + 0.5);
                    
                    const newPath = findPathBFS(
                        this.grid, this.mazeSize, this.mazeSize,
                        currentCellX, currentCellZ,
                        playerCellX, playerCellZ,
                        true // isMonster
                    );
                    
                    if (newPath.length > 0) {
                        this.monsterPath = newPath;
                        this.currentPathIndex = 0;
                        this.updateMonsterTarget();
                    }
                    this.lastPathUpdateTime = now;
                }
                
                // Use pathfinding target
                if (this.monsterTargetPosition) {
                    targetX = this.monsterTargetPosition.x;
                    targetZ = this.monsterTargetPosition.z;
                    
                    // Check if we reached the current waypoint
                    const waypointDx = targetX - this.monster.position.x;
                    const waypointDz = targetZ - this.monster.position.z;
                    const waypointDist = Math.sqrt(waypointDx * waypointDx + waypointDz * waypointDz);
                    
                    if (waypointDist < 0.1) {
                        this.currentPathIndex++;
                        this.updateMonsterTarget();
                    }
                } else {
                    // Fallback to direct movement
                    targetX = this.camera.position.x;
                    targetZ = this.camera.position.z;
                }
            }
            
            // Smooth movement towards target
            const moveDx = targetX - this.monster.position.x;
            const moveDz = targetZ - this.monster.position.z;
            const moveDist = Math.sqrt(moveDx * moveDx + moveDz * moveDz);
            
            if (moveDist > 0.05) {
                // Monster slows down when crouching under obstacles (15% slowdown vs 30% for player)
                const currentMonsterSpeed = this.monsterCrouchHeight > 0.01 ? this.monsterSpeed * 0.85 : this.monsterSpeed;
                const moveX = (moveDx / moveDist) * currentMonsterSpeed * delta;
                const moveZ = (moveDz / moveDist) * currentMonsterSpeed * delta;
                
                // Check if new position would be valid (not in wall, but allow crouch beams)
                const newX = this.monster.position.x + moveX;
                const newZ = this.monster.position.z + moveZ;
                const cellX = Math.floor(newX + 0.5);
                const cellZ = Math.floor(newZ + 0.5);
                
                // Monster can pass through crouch beams (type 4) but not regular walls (type 1)
                if (cellX >= 0 && cellX < this.mazeSize && cellZ >= 0 && cellZ < this.mazeSize && 
                    (this.grid[cellZ][cellX] === 0 || this.grid[cellZ][cellX] === 4)) {
                    this.monster.position.x = newX;
                    this.monster.position.z = newZ;
                    
                    // Smooth rotation towards movement direction
                    const angle = Math.atan2(moveDx, moveDz);
                    const targetRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
                    this.monster.quaternion.slerp(targetRotation, 0.15);
                }
            }
        }

        // Check for game over collision
        const distToPlayer = this.camera.position.distanceTo(this.monster.position);
        if (distToPlayer < 0.6) {
            this.handleGameOver();
        }
    }
    
    // Get monster spawn delay based on level (10s → 9s → 8s → 7s → 6s → 5s → 5s...)
    getMonsterSpawnDelay() {
        const delays = [10000, 9000, 8000, 7000, 6000, 5000]; // Levels 1-6
        if (this.level <= 6) {
            return delays[this.level - 1];
        }
        return 5000; // Level 7+ stays at 5 seconds
    }
    
    // Check if player has moved 2 cells from start position (0, 1)
    checkPlayerLeftStartArea() {
        const playerX = this.camera.position.x;
        const playerZ = this.camera.position.z;
        const startX = 0;
        const startZ = 1;
        
        // Calculate distance from start position
        const distance = Math.sqrt(
            Math.pow(playerX - startX, 2) + 
            Math.pow(playerZ - startZ, 2)
        );
        
        // Check if player is at least 2 cells away (2 units distance)
        if (distance >= 2.0 && !this.playerLeftStartArea) {
            this.playerLeftStartArea = true;
            this.leftStartTime = Date.now();
            return true;
        }
        
        return false;
    }
    
    // Check if monster needs to crouch for upcoming obstacles
    checkMonsterCrouchNeed() {
        const checkDistance = 1.5; // Check 1.5 units ahead
        const monsterX = this.monster.position.x;
        const monsterZ = this.monster.position.z;
        
        // Get movement direction
        const dx = this.camera.position.x - monsterX;
        const dz = this.camera.position.z - monsterZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        
        if (dist < 0.01) return false; // Not moving
        
        // Normalize direction
        const dirX = (dx / dist) * checkDistance;
        const dirZ = (dz / dist) * checkDistance;
        
        // Check positions along the movement path
        const checkPoints = [
            {x: monsterX + dirX * 0.5, z: monsterZ + dirZ * 0.5}, // Close check
            {x: monsterX + dirX, z: monsterZ + dirZ}, // Medium check  
            {x: monsterX + dirX * 1.5, z: monsterZ + dirZ * 1.5} // Far check
        ];
        
        for (const point of checkPoints) {
            const cellX = Math.floor(point.x + 0.5);
            const cellZ = Math.floor(point.z + 0.5);
            
            if (cellX >= 0 && cellX < this.mazeSize && cellZ >= 0 && cellZ < this.mazeSize) {
                if (this.grid[cellZ][cellX] === 4) {
                    return true; // Crouch beam detected ahead
                }
            }
        }
        
        return false;
    }
    
    // Check if there's a clear line of sight between two points
    checkLineOfSight(x1, z1, x2, z2) {
        const dx = Math.abs(x2 - x1);
        const dz = Math.abs(z2 - z1);
        const sx = x1 < x2 ? 1 : -1;
        const sz = z1 < z2 ? 1 : -1;
        let err = dx - dz;
        let x = Math.floor(x1);
        let z = Math.floor(z1);
        
        while (true) {
            // Check current position
            if (x >= 0 && x < this.mazeSize && z >= 0 && z < this.mazeSize) {
                // Monster can see through crouch beams (type 4) but not regular walls (type 1)
                if (this.grid[z][x] === 1) {
                    return false; // Wall blocks line of sight
                }
            } else {
                return false; // Out of bounds
            }
            
            // Check if we reached the target
            if (Math.floor(x2) === x && Math.floor(z2) === z) {
                return true;
            }
            
            const e2 = 2 * err;
            if (e2 > -dz) {
                err -= dz;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                z += sz;
            }
        }
    }
    
    // Helper method to compare paths
    pathsAreEqual(path1, path2) {
        if (path1.length !== path2.length) return false;
        for (let i = 0; i < path1.length; i++) {
            if (path1[i][0] !== path2[i][0] || path1[i][1] !== path2[i][1]) return false;
        }
        return true;
    }
    
    // Update monster's target position based on current path index
    updateMonsterTarget() {
        if (this.monsterPath.length > 0 && this.currentPathIndex < this.monsterPath.length) {
            const targetCell = this.monsterPath[this.currentPathIndex];
            this.monsterTargetPosition = new THREE.Vector3(targetCell[0], 0.5, targetCell[1]);
        } else {
            this.monsterTargetPosition = null;
        }
    }
    
    handleGameOver() {
        this.isGameOver = true;
        this.controls.unlock();
        document.getElementById('game-over').style.display = 'block';
        
        // Show control buttons when game is over
        document.getElementById('mute-btn').style.display = 'flex';
        document.getElementById('fullscreen-btn').style.display = 'flex';
        
        // Calculate final statistics
        const timeElapsed = this.startTime ? (Date.now() - this.startTime + this.totalPausedDuration) : 0;
        
        // Update session score and total score
        this.sessionPlayTime = timeElapsed;
        this.totalPlayTime += (this.sessionPlayTime / 1000); // Store total in seconds for consistency
        localStorage.setItem('totalPlayTime', this.totalPlayTime);

        const formatTime = (secondsTotal) => {
            const hrs = Math.floor(secondsTotal / 3600);
            const mins = Math.floor((secondsTotal % 3600) / 60);
            const secs = Math.floor(secondsTotal % 60);
            let result = "";
            if (hrs > 0) result += hrs.toString().padStart(2, '0') + ":";
            result += mins.toString().padStart(2, '0') + ":" + secs.toString().padStart(2, '0');
            return result;
        };

        const sessionTimeString = formatTime(this.sessionPlayTime / 1000);
        const totalTimeString = formatTime(this.totalPlayTime);
        
        // Update death statistics
        document.getElementById('death-level').textContent = this.level;
        document.getElementById('death-time').textContent = sessionTimeString;
        document.getElementById('total-death-time').textContent = totalTimeString;
        document.getElementById('death-mazes').textContent = this.mazesCompleted;
        
        this.playDeathScream();
        // Monster sound intentionally keeps playing here — creepy effect during death screen

        // Reset Game state without instantly restarting
        const previousLevel = this.level; // Store for stats before reset
        this.level = 1; 
        this.mazeSize = this.baseMazeSize; // Reset to base size
        this.slowPowerupRemaining = 0;
        this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
        this.mazesCompleted = 0; // Reset completed mazes
        
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
        const radius = 1.5;
        
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
        ctx.fillStyle = '#00ff00'; // Green player
        ctx.beginPath();
        ctx.arc(px, py, cellSize / 2, 0, Math.PI * 2);
        ctx.fill();

        // Draw Monster if Radar is active
        if (this.radarPowerupRemaining > 0 && this.monster && this.monsterSpawned) {
            const mx = (this.monster.position.x * cellSize) + cellSize/2;
            const my = (this.monster.position.z * cellSize) + cellSize/2;
            ctx.fillStyle = '#ff0000'; // Red monster
            ctx.beginPath();
            ctx.arc(mx, my, cellSize / 2, 0, Math.PI * 2);
            ctx.fill();
            
            // Pulsating glow for monster
            ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(mx, my, (cellSize / 2) + Math.sin(Date.now() / 100) * 2, 0, Math.PI * 2);
            ctx.stroke();
        }

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
        try {
            this.level++;
            this.mazesCompleted++; // Increment completed mazes counter
            
            this.startTime = Date.now();
            
            // Don't null out this.monster — it's permanently in scene, just hide it
            if (this.monsterSpawned) {
                if (this.monsterSound && this.monsterSound.isPlaying) {
                    this.stopAudioSafely(this.monsterSound);
                }
                this.monster.visible = false;
                this.monsterSpawned = false;
            }
            
            // Reset spawn conditions for new level
            this.playerLeftStartArea = false;
            this.leftStartTime = null;
            this.monsterSpawnDelay = this.getMonsterSpawnDelay(); // Update delay for new level
            
            // Reset hint flags for new level (but keep them shown if already displayed)
            if (this.level === 2) {
                // Moving to level 2, reset flashlight hint for level 4
                this.flashlightHintShown = false;
            }
            if (this.level > 1) {
                // Moving past level 1, fullscreen hint won't be shown again anyway
                // No need to reset fullscreenHintShown as it's level 1 only
            }
            
            this.clearMaze();
            this.updateLighting();
            this.buildMaze();
        } catch (error) {
            console.error('Error in nextLevel():', error);
            // Fallback: reload the page if level transition fails
            setTimeout(() => {
                alert('Level transition failed. Reloading game...');
                location.reload();
            }, 1000);
        }
    }

    toggleMenu() {
        if (this.controls.isLocked) {
            this.controls.unlock();
        } else {
            this.controls.lock();
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        localStorage.setItem('isMuted', this.isMuted);
        const volume = this.isMuted ? 0 : 1;
        if (this.listener) this.listener.setMasterVolume(volume);
        const muteIcon = document.getElementById('mute-icon');
        if (muteIcon) muteIcon.textContent = this.isMuted ? '🔇' : '🔊';
    }

    // Optimized audio utilities
    playAudioSafely(audio, audioKey = null) {
        if (!audio || this.isMuted) return;
        
        // Debounce check if key provided
        if (audioKey) {
            const now = performance.now();
            if (now - (this.audioDebounceTime[audioKey] || 0) < this.audioDebounceDelay) {
                return;
            }
            this.audioDebounceTime[audioKey] = now;
        }
        
        setTimeout(() => {
            try {
                if (audio?.context?.state === 'suspended') {
                    audio.context.resume();
                }
                if (!audio.isPlaying) {
                    audio.play();
                }
            } catch (e) {
                console.warn(`Audio play failed (${audioKey || 'unknown'}):`, e);
            }
        }, 0);
    }

    stopAudioSafely(audio) {
        if (!audio) return;
        
        setTimeout(() => {
            try {
                if (audio.isPlaying) {
                    audio.stop();
                }
            } catch (e) {
                console.warn('Audio stop failed:', e);
            }
        }, 0);
    }

    applyPowerup(type) {
        if (type === 'speed') {
            this.speedPowerupRemaining = 15;
            this.playerSpeed = this.basePlayerSpeed * 1.5;
            document.getElementById('bonus-speed-indicator').style.display = 'block';
            document.getElementById('bonus-speed-time').innerText = '15s';
        } else if (type === 'slow') {
            this.slowPowerupRemaining = 20;
            this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty] * 0.5;
            document.getElementById('bonus-indicator').style.display = 'block';
            document.getElementById('bonus-time').innerText = '20s';
        } else if (type === 'radar') {
            this.radarPowerupRemaining = 30;
            document.getElementById('bonus-radar-indicator').style.display = 'block';
            document.getElementById('bonus-radar-time').innerText = '30s';
            if (this.monsterTrackerBeam) {
                this.monsterTrackerBeam.visible = true;
            }
        }
    }
}

new Game();
