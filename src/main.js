import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Maze } from './maze.js';
import { OptionsManager } from './options-manager.js';
import { findPathAStar, getAccessibleArea } from './utils.js';
import { translations } from './translations.js';
import { MonsterController } from './core/ai/MonsterController.js';

const MONSTER_DATA = [
    {
        name: 'The Hollow',
        texture: '/textures/monster_face_1.png',
        ability: '+10% Speed',
        description: 'Moves 10% faster'
    },
    {
        name: 'Crimson Eye',
        texture: '/textures/monster_face_2.png',
        ability: '-12% Player Speed',
        description: 'Reduces player movement speed'
    },
    {
        name: 'Skull Wraith',
        texture: '/textures/ghost_skull_1.png',
        ability: '+15% Speed',
        description: 'Moves 15% faster than normal'
    },
    {
        name: 'The Shade',
        texture: '/textures/ghost_skull_2.png',
        ability: '-40% Light Intensity',
        description: 'Dims flashlight and moonlight'
    }
];

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        // Добавляем начальный туман с первого уровня
        this.scene.fog = new THREE.Fog(0x040804, 2, 15);
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

        this.textures = {}; // Will be populated in init()
        
        // Monster
        this.monster = null;
        this.isGameOver = false;
        this.monsterSpawned = false;
        this.monsterTextures = [];
        this.basePlayerSpeed = 19.6; // Base player speed
        this.playerSpeed = this.basePlayerSpeed;

        // Difficulty settings (moved here to fix initialization order)
        this.difficulty = 'normal'; // Default difficulty (Normal as requested)
        this.difficultyMultipliers = {
            super_easy: 0.35, // 35% monster speed
            easy: 0.5,       // 50% monster speed
            normal: 0.8,     // 80% monster speed (original default)
            hard: 0.9        // 90% monster speed
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
        
        // Red orbs for monster collection
        this.redOrbs = [];
        this.redOrbSpawnTimer = 0;
        this.redOrbSpawnInterval = 15000; // Спавн каждые 15 секунд
        this.maxRedOrbs = 5; // Максимум 5 шариков одновременно
        
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
        this.activeGameTime = 0; // Time spent actively playing (excluding pause)
        this.gameStartTime = null; // Start time for current active game session

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
        this.flashlightOnSound = null;
        this.flashlightOffSound = null;
        this.isMuted = localStorage.getItem('isMuted') === 'true';
        this.listener.setMasterVolume(this.isMuted ? 0 : 1);
        
        // Monster Ability Multipliers
        this.monsterSpeedMultiplier = 1.0;
        this.playerSpeedMultiplier = 1.0;
        this.lightIntensityMultiplier = 1.0;
        
        // Web Audio API для простых звуков
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

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

        // Initialize Options Manager
        this.optionsManager = new OptionsManager(this);
        
        // Set initial values from options manager
        this.startingLevel = this.optionsManager.getStartingLevel();
        this.difficulty = this.optionsManager.getDifficulty();
        this.shadowQuality = this.optionsManager.getShadowQuality();
        this.renderScale = this.optionsManager.getRenderScale();
        this.effectsEnabled = this.optionsManager.getEffectsEnabled();
        this.masterVolume = this.optionsManager.getMasterVolume();
        this.showFPS = this.optionsManager.getShowFPS();
        this.fogOfWar = this.optionsManager.getFogOfWar();
        this.currentLanguage = this.optionsManager.getLanguage();
        this.audioGroups = this.optionsManager.getAudioGroups();
        this.selectedMonsterIndex = this.optionsManager.getSelectedMonster();

        // Loading Progress
        this.loadingManager = new THREE.LoadingManager();
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
        
        this.setupLoadingManager();
        this.monsterController = new MonsterController(this);
        this.init();

    }

    init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setClearColor(0x040804); // Изменен цвет для соответствия туману
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Better shadow quality
        this.renderer.powerPreference = "high-performance";
        this.renderer.antialias = window.devicePixelRatio <= 1;
        
        // Initial technical settings - now handled by OptionsManager
        // this.applyLanguage(this.currentLanguage);
        this.applyAudioSettings();
        this.toggleBloodDrops(true);
        this.toggleMenuBackdrop(true);
        
        // Set FPS limit to 144
        this.targetFPS = 144;
        this.frameInterval = 1000 / this.targetFPS;
        this.then = performance.now();
        
        // Try to enable high refresh rate
        this.enableHighFPS = true;
        this.displayRefreshRate = 60; // Default fallback
        
        if (this.enableHighFPS) {
            // Try to unlock frame rate for high refresh displays
            this.renderer.setAnimationLoop(() => this.animate());
        }
        
        document.body.appendChild(this.renderer.domElement);

        // Preload essential textures with tracking
        this.initTextureLoading();

        // Cool Flashlight (SpotLight attached to camera)
        this.flashlight = new THREE.SpotLight(0xc0d0ff, 2.5, 20, Math.PI / 6, 0.5, 2);
        this.flashlight.position.set(0.3, -0.2, -0.2);
        this.flashlight.castShadow = true;
        
        // Flashlight shadow settings based on quality
        let flashlightSize = 512;
        let flashlightBias = -0.001;
        
        if (this.shadowQuality === 'medium') {
            flashlightSize = 1024;
            flashlightBias = -0.0007;
        } else if (this.shadowQuality === 'high') {
            flashlightSize = 1536;
            flashlightBias = -0.0004;
        } else if (this.shadowQuality === 'ultra') {
            flashlightSize = 2048;
            flashlightBias = -0.0001;
        }
        
        this.flashlight.shadow.mapSize.width = flashlightSize;
        this.flashlight.shadow.mapSize.height = flashlightSize;
        this.flashlight.shadow.bias = flashlightBias;
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
        const starPhases = new Float32Array(STAR_COUNT);
        
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
            // Phase for twinkling
            starPhases[i] = Math.random() * Math.PI * 2;
        }
        
        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeo.setAttribute('customColor', new THREE.BufferAttribute(starColors, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
        starGeo.setAttribute('phase', new THREE.BufferAttribute(starPhases, 1));
        
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
        
        this.starUniforms = {
            time: { value: 0.0 },
            pointTexture: { value: starSpriteTex }
        };

        this.starMaterial = new THREE.ShaderMaterial({
            uniforms: this.starUniforms,
            vertexShader: `
                attribute float size;
                attribute float phase;
                attribute vec3 customColor;
                varying vec3 vColor;
                varying float vPhase;
                void main() {
                    vColor = customColor;
                    vPhase = phase;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    // Fixed point size suitable for typical screen resolution without depth attenuation vanishing
                    gl_PointSize = size * 2.0;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform sampler2D pointTexture;
                varying vec3 vColor;
                varying float vPhase;
                void main() {
                    vec4 texColor = texture2D(pointTexture, gl_PointCoord);
                    float alpha = 0.5 + 0.5 * sin(time + vPhase);
                    gl_FragColor = vec4(vColor * texColor.rgb * alpha, texColor.a * alpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
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
        this.moon.scale.set(30, 30, 1); // Increased scale for "closer" look
        this.moon.renderOrder = 1;
        this.moon.position.set(0, 150, -250); // Moved closer and aligned with moonLight
        this.scene.add(this.moon);

        // Removed volumetric fog - was causing visual artifacts outside level

        this.controls = new PointerLockControls(this.camera, document.body);

        // Pre-build the monster so spawning it later has zero cost
        this.initMonsterTextures();
        
        // Wait for textures to load before building cache
        setTimeout(() => {
            this.buildMonsterMeshCache();
            
            // Add monster to scene immediately but hide it to pre-warm all shaders and shadows
            // This completely eliminates the lag spike when it "spawns" because the engine
            // already knows about its material and geometry bounds within the scene.
            this.monster = this.monsterMeshCache;
            this.monster.visible = false;
            
            // Add a pulsing point light to the monster
            this.monsterLight = new THREE.PointLight(0xff0000, 2, 3);
            this.monsterLight.castShadow = true;
            this.monsterLight.shadow.bias = -0.005;
            this.monsterLight.shadow.camera.near = 0.05; // Was default 0.5 — too large → causes blocky shadow projection close to walls
            this.monsterLight.shadow.camera.far = 6;     // Covers full light range (distance=3) with margin
            this.monsterLight.shadow.radius = 2;         // PCF softening for smooth shadow edges
            this.monster.add(this.monsterLight);

            // Ensure NO child mesh of the monster casts shadows — the light comes from inside the group
            // and we want rays to pass through the monster's own geometry unobstructed
            this.monster.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = false;
                    child.receiveShadow = false;
                }
            });

            // Pre-init monster sound to avoid audio-context freeze on first spawn
            this.initMonsterSound();
            if (this.monsterSound) {
                this.monster.add(this.monsterSound);
            }
            
            this.scene.add(this.monster);
            this.renderer.compile(this.scene, this.camera);
        }, 1000); // Wait 1 second for textures to load
        
        // Initial lighting setup based on level
        this.updateLighting();

        // Sync mute icon
        const muteIcon = document.getElementById('mute-icon');
        if (muteIcon) muteIcon.textContent = this.isMuted ? '🔇' : '🔊';

        const optionsBtn = document.getElementById('options-btn');
        const helpBtn = document.getElementById('help-btn');
        const backBtns = document.querySelectorAll('.back-btn');
        const menuMain = document.getElementById('menu-main');
        const menuOptions = document.getElementById('menu-options');
        const menuHelp = document.getElementById('menu-help');
        const continueBtn = document.getElementById('continue-btn');

        const menuTitle = document.getElementById('menu-title');

        const showPage = (page) => {
            menuMain.style.display = 'none';
            menuOptions.style.display = 'none';
            menuHelp.style.display = 'none';
            page.style.display = 'block';
            
            // Hide game title in Options and Help menus, show in Main menu
            if (page === menuMain) {
                menuTitle.style.display = 'block';
            } else {
                menuTitle.style.display = 'none';
            }
        };

        if (optionsBtn) optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPage(menuOptions);
        });

        if (helpBtn) helpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showPage(menuHelp);
        });

        backBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                showPage(menuMain);
            });
        });

        const startBtn = document.getElementById('start-btn');
        const restartBtn = document.getElementById('restart-btn');

        const startGame = () => {
            if (!this.gameStarted) {
                this.gameStarted = true;
                this.level = this.startingLevel; // Set level from selector
                this.updateLighting(); // Apply lighting based on selected level
                document.body.classList.remove('menu-visible'); // Remove menu-visible class
                startBtn.style.display = 'none';
                continueBtn.style.display = 'block';
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
                // Reset active game timer for new game
                this.activeGameTime = 0;
                this.gameStartTime = null;
                
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
            
            this.controls.lock();
        };

        const toggleMute = this.toggleMute;

        continueBtn.addEventListener('click', startGame);

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

        // Difficulty selection - handled by OptionsManager
        // setupDifficultySelection();
        
        // Checkbox buttons - handled by OptionsManager  
        // setupCheckboxButtons();
        // Level selection
        this.setupLevelSelection();
        // Technical settings
        this.setupSettingsListeners();

        // Initialize game
        this.buildMaze();
        this.animate();
        
        // Show control buttons in menu initially
        document.getElementById('mute-btn').style.display = 'flex';
        document.getElementById('fullscreen-btn').style.display = 'flex';

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
            document.body.classList.remove('menu-visible'); // Remove menu-visible class
            document.getElementById('hud').style.display = 'flex';
            document.getElementById('crosshair').style.display = 'block';
            
            // Hide control buttons when playing
            document.getElementById('mute-btn').style.display = 'none';
            document.getElementById('fullscreen-btn').style.display = 'none';
            
            // Hide menu effects during gameplay
            this.toggleBloodDrops(false);
            this.toggleMenuBackdrop(false);
            
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
        });

        this.controls.addEventListener('unlock', () => {
            // Only show menu if not game over and NOT toggling fullscreen
            if (!this.isGameOver && !this.isFullscreenToggling) {
                this.isPaused = true;
                this.pauseTime = Date.now();
                this.lastUnlockTime = Date.now();
                
                // Stop active game time counting when paused
                this.gameStartTime = null;
                
                document.getElementById('menu').style.display = 'block';
                document.body.classList.add('menu-visible'); // Add menu-visible class
                
                // Reset menu to main page on pause
                showPage(menuMain);
                
                // Show control buttons when paused
                document.getElementById('mute-btn').style.display = 'flex';
                document.getElementById('fullscreen-btn').style.display = 'flex';
                
                // Show menu effects when paused
                this.toggleBloodDrops(true);
                this.toggleMenuBackdrop(true);
                
                // Play menu music
            } else if (!this.isGameOver && this.isFullscreenToggling) {
                // We're toggling fullscreen, so hide HUD but don't show menu
                this.isPaused = true;
                this.pauseTime = Date.now();
                this.lastUnlockTime = Date.now();
                
                // Stop active game time counting when paused
                this.gameStartTime = null;
                
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


        // Load flashlight sound
        this.flashlightSoundBuffer = null;
        audioLoader.load('/sounds/light.mp3', (buffer) => {
            console.log('[Flashlight] Sound loaded successfully, duration:', buffer.duration);
            this.flashlightSoundBuffer = buffer;
            
            // Set buffer for flashlight sounds if they already exist
            if (this.flashlightOnSound && this.flashlightOffSound) {
                console.log('[Flashlight] Setting buffer to existing sounds');
                this.flashlightOnSound.setBuffer(buffer);
                this.flashlightOffSound.setBuffer(buffer);
                this.flashlightOnSound.setVolume(0.5);
                this.flashlightOffSound.setVolume(0.3);
            }
        }, undefined, (err) => {
            console.error('[Flashlight] Sound loading failed:', err);
        });

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

    }

    setupLoadingManager() {
        const barFill = document.getElementById('preloader-bar-fill');
        const loadingStatus = document.getElementById('loading-status');

        this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
            const progress = (itemsLoaded / itemsTotal) * 100;
            if (barFill) barFill.style.width = `${progress}%`;
            if (loadingStatus) {
                const fileName = url.split('/').pop();
                loadingStatus.textContent = `Loading ${fileName}... (${Math.round(progress)}%)`;
            }
        };

        this.loadingManager.onLoad = () => {
            if (loadingStatus) loadingStatus.textContent = "READY TO ENTER";
            
            const preloader = document.getElementById('preloader');
            if (preloader) {
                preloader.style.animation = 'fadeOut 1s ease-in-out forwards';
                setTimeout(() => {
                    preloader.style.display = 'none';
                }, 1000);
            }
        };

        this.loadingManager.onError = (url) => {
            console.error('Error loading:', url);
        };
    }

    applyLanguage(lang) {
        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        const dict = translations[lang] || translations.en;
        
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                // If it contains HTML tags (like <em> or <strong>), use innerHTML
                if (dict[key].includes('<')) {
                    el.innerHTML = dict[key];
                } else {
                    el.textContent = dict[key];
                }
            }
        });
        
        // Update document title
        if (dict.game_title) {
            document.title = `${dict.game_title} | 3D Maze`;
        }

        // Special case for dynamic text like monster speed
        const difficultyDescription = document.querySelector('.difficulty-description');
        if (difficultyDescription) {
            const speedPercentage = Math.round(this.difficultyMultipliers[this.difficulty] * 100);
            const displayName = this.difficulty.replace('_', ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
            difficultyDescription.innerHTML = `<span data-i18n="monster_speed">${dict.monster_speed}</span> ${speedPercentage}% (${displayName})`;
        }

        // Update language button selection - now handled by OptionsManager
        // document.querySelectorAll('.lang-btn').forEach(btn => {
        //     btn.classList.toggle('selected', btn.dataset.lang === lang);
        // });
    }

    // Toggle persistent blood drops visibility
    toggleBloodDrops(visible) {
        const container = document.getElementById('blood-drops-container');
        if (container) {
            container.classList.toggle('visible', visible);
        }
    }

    // Toggle menu backdrop for better focus
    toggleMenuBackdrop(visible) {
        const backdrop = document.getElementById('menu-backdrop');
        if (backdrop) {
            backdrop.classList.toggle('visible', visible);
        }
    }

    // Graphics presets removed - using advanced granular settings only

    // Apply individual graphics parameters (English comments)
    applyGranularGraphics() {
        if (!this.renderer) return;

        localStorage.setItem('renderScale', this.renderScale);
        localStorage.setItem('shadowQuality', this.shadowQuality);
        localStorage.setItem('effectsEnabled', this.effectsEnabled);

        // Update lighting to ensure moonLight has correct shadow settings
        this.updateLighting();

        // 1. Handle Resolution / Render Scale
        let pixelRatio = 1;
        switch (this.renderScale) {
            case 'performance': pixelRatio = 0.5; break;      // 50% for max performance
            case 'balanced': pixelRatio = 0.75; break;     // 75% for good performance
            case 'high': pixelRatio = 1.0; break;          // 100% standard quality
            default: pixelRatio = 1.0; break;              // Default to high quality
        }
        
        console.log(`[Resolution] Setting pixelRatio: ${pixelRatio} (DPR: ${window.devicePixelRatio}, Mode: ${this.renderScale})`);
        this.renderer.setPixelRatio(pixelRatio);

        // 2. Handle Shadow Quality
        // ENABLED - Clean shadows
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Set shadow map type: Ultra uses PCFSoft for maximum quality
        this.renderer.shadowMap.type = (this.shadowQuality === 'ultra') 
            ? THREE.PCFSoftShadowMap 
            : THREE.PCFShadowMap;

        const updateLightShadow = (light, size) => {
            if (light) {
                light.castShadow = true;
                light.shadow.mapSize.set(size, size);
                if (light.shadow.map) light.shadow.map.dispose();
            }
        };

        let shadowSize = 256; // Low quality default
        let shadowType = THREE.PCFShadowMap;
        let shadowBias = -0.002; // More bias for low quality
        let shadowRadius = 0.3;
        let flashlightSize = 256;
        let monsterSize = 128;
        let frustumSize = 15;
        let frustumDistance = 60;
        
        if (this.shadowQuality === 'low') {
            shadowSize = 256;
            shadowBias = -0.002;
            shadowRadius = 0.3;
            flashlightSize = 256;
            monsterSize = 512;   // Increased from 128 — avoids blocky texels at close range
            frustumSize = 15;
            frustumDistance = 60;
        } else if (this.shadowQuality === 'medium') {
            shadowSize = 1024;
            shadowBias = -0.0007;
            shadowRadius = 1;
            flashlightSize = 1024;
            monsterSize = 1024;  // Increased from 512
            frustumSize = 25;
            frustumDistance = 100;
        } else if (this.shadowQuality === 'high') {
            shadowSize = 2048;
            shadowType = THREE.PCFSoftShadowMap;
            shadowBias = -0.0004;
            shadowRadius = 1.5;
            flashlightSize = 1536;
            monsterSize = 2048;  // Increased from 1024 — PointLight uses 6 faces, so effective res per face stays reasonable
            frustumSize = 30;
            frustumDistance = 120;
        } else if (this.shadowQuality === 'ultra') {
            shadowSize = 4096;
            shadowType = THREE.PCFSoftShadowMap;
            shadowBias = -0.0001;
            shadowRadius = 2.5;
            flashlightSize = 2048;
            monsterSize = 2048;  // Kept at 2048 — PointLight cube faces; 2048 is practical max before VRAM hit
            frustumSize = 40;
            frustumDistance = 160;
        }

        // Set shadow map type
        this.renderer.shadowMap.type = shadowType;

        updateLightShadow(this.flashlight, flashlightSize);
        updateLightShadow(this.monsterLight, monsterSize);
        updateLightShadow(this.moonLight, shadowSize);
        
        // Remove duplicate moon light updates - shadows are now static

        // 3. Toggle visual effects
        if (this.stars) this.stars.visible = this.effectsEnabled;
        if (this.clouds1) this.clouds1.visible = this.effectsEnabled;
        if (this.clouds2) this.clouds2.visible = this.effectsEnabled;

        // Sync individual buttons in Options UI
        this.updateAdvancedButtonsUI();
        
        // Final compile for consistency
        if (this.gameStarted) {
            this.renderer.compile(this.scene, this.camera);
        }
    }

    // Sync individual setting button states in the UI
    updateAdvancedButtonsUI() {
        document.querySelectorAll('.adv-btn').forEach(btn => {
            const type = btn.dataset.type;
            const val = btn.dataset.adv;
            let isSelected = false;

            // Skip shadow quality - handled by OptionsManager
            if (type === 'shadow') return;
            
            if (type === 'resolution') isSelected = (this.renderScale === val);
            if (type === 'effects') isSelected = (this.effectsEnabled ? (val === 'on') : (val === 'off'));

            btn.classList.toggle('selected', isSelected);
        });
    }

    applyAudioSettings() {
        if (this.listener) {
            this.listener.setMasterVolume(this.isMuted ? 0 : this.masterVolume);
        }
        
        localStorage.setItem('masterVolume', this.masterVolume);
        localStorage.setItem('audio_monster', this.audioGroups.monster);
        localStorage.setItem('audio_facula', this.audioGroups.facula);

        // Update UI elements
        const volumeSlider = document.getElementById('master-volume');
        if (volumeSlider) volumeSlider.value = this.masterVolume;


        const monsterToggle = document.getElementById('toggle-monster');
        if (monsterToggle) monsterToggle.checked = this.audioGroups.monster;

        const faculaToggle = document.getElementById('toggle-facula');
        if (faculaToggle) faculaToggle.checked = this.audioGroups.facula;

        // Apply immediately to running sounds
        if (this.monsterSound && !this.audioGroups.monster) {
            this.monsterSound.setVolume(0);
        } else if (this.monsterSound && this.monsterSpawned) {
            this.monsterSound.setVolume(this.monsterVolume);
        }

        this.torchLights.forEach(t => {
            if (t.fireSound) {
                t.fireSound.setVolume(this.audioGroups.facula ? 0.8 : 0);
            }
        });
    }

    setupSettingsListeners() {
        // Graphics hooks - now handled by OptionsManager
        // document.querySelectorAll('.quality-btn').forEach(btn => {
        //     btn.addEventListener('click', (e) => {
        //         e.stopPropagation();
        //         this.applyGraphicsSettings(btn.dataset.quality);
        //     });
        // });

        // Audio hooks
        const volumeSlider = document.getElementById('master-volume');
        if (volumeSlider) volumeSlider.addEventListener('input', (e) => {
            this.masterVolume = parseFloat(e.target.value);
            this.applyAudioSettings();
        });

        const monsterToggle = document.getElementById('toggle-monster');
        if (monsterToggle) monsterToggle.addEventListener('change', (e) => {
            this.audioGroups.monster = e.target.checked;
            this.applyAudioSettings();
        });

        const faculaToggle = document.getElementById('toggle-facula');
        if (faculaToggle) faculaToggle.addEventListener('change', (e) => {
            this.audioGroups.facula = e.target.checked;
            this.applyAudioSettings();
        });

        // FPS hook
        const fpsToggle = document.getElementById('fps-toggle');
        if (fpsToggle) {
            fpsToggle.checked = this.showFPS;
            fpsToggle.addEventListener('change', (e) => {
                this.showFPS = e.target.checked;
                localStorage.setItem('showFPS', this.showFPS);
            });
        }

        // Language hooks - now handled by OptionsManager
        // document.querySelectorAll('.lang-btn').forEach(btn => {
        //     btn.addEventListener('click', (e) => {
        //         e.stopPropagation();
        //         this.applyLanguage(btn.dataset.lang);
        //     });
        // });

        // Advanced Graphics Toggle
        const advToggle = document.getElementById('adv-settings-toggle');
        const advContent = document.getElementById('adv-settings-content');
        if (advToggle && advContent) {
            advToggle.addEventListener('click', () => {
                advContent.classList.toggle('open');
                const icon = advToggle.querySelector('.toggle-icon');
                if (icon) icon.textContent = advContent.classList.contains('open') ? '▲' : '▼';
            });
        }

        // Advanced Settings Individual Buttons
        document.querySelectorAll('.adv-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const val = btn.dataset.adv;

                if (type === 'resolution') this.renderScale = val;
                // Shadow quality is now handled by OptionsManager
                if (type === 'effects') this.effectsEnabled = (val === 'on');
                
                this.applyGranularGraphics();
            });
        });
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
        const configTex = (url, repeatX, repeatY) => {
            return this.textureLoader.load(url, (tex) => {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                if (repeatX) tex.repeat.set(repeatX, repeatY);
            });
        };

        this.textures.brick = configTex('/textures/brick.png', 1, 1);
        this.textures.floor = configTex('/textures/floor.png', 10, 10);
        this.textures.moon = configTex('/textures/moon.png');
    }
    
    clearMaze() {
        try {
            // Remove all objects except camera and sky
            const toRemove = [];
            this.scene.traverse((object) => {
                let isProtected = false;
                let current = object;
                while (current) {
                    if (current === this.camera || 
                        current === this.sky || 
                        current === this.moon || 
                        current === this.stars || 
                        current === this.moonLight || 
                        current === this.monster || 
                        current === this.monsterSound || 
                        current === this.monsterLight || 
                        current === this.flashlight || 
                        current === this.flashlightHalo || 
                        current === this.flashlightTarget || 
                        current === this.goal || 
                        current === this.goalLight || 
                        current === this.startGlow || 
                        current === this.startGlowLight) {
                        isProtected = true;
                        break;
                    }
                    current = current.parent;
                }
                
                // Do not remove the scene itself
                if (!isProtected && object !== this.scene && !object.isAmbientLight && !object.isHemisphereLight) {
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
            this.startGlow = null;
            this.startGlowLight = null;
            this.torchLights = [];
            
            // Очищаем красные шарики
            this.clearRedOrbs();
        } catch (error) {
            console.error('Error in clearMaze():', error);
            // Reset arrays even if disposal fails
            this.walls = [];
            this.powerups = [];
            this.lockedDoors = [];
            this.crouchBeams = [];
            this.goal = null;
            this.goalLight = null;
            this.startGlow = null;
            this.startGlowLight = null;
            this.torchLights = [];
        }
    }

    getMoonPositionForLevel(level) {
        // Pseudo-random angle based on level number for consistent positioning
        const seed = level * 1337;
        const x = Math.sin(seed) * 10000;
        const randomFraction = x - Math.floor(x);
        const angle = randomFraction * Math.PI * 2;
        
        const distance = 250;
        // height between 100 and 200
        const y2 = Math.sin(seed + 1) * 10000;
        const randomHeightFraction = y2 - Math.floor(y2);
        const height = 100 + randomHeightFraction * 100;
        
        return {
            x: Math.cos(angle) * distance,
            y: height,
            z: Math.sin(angle) * distance
        };
    }

    updateLighting() {
        // Remove old lights if present (English comments)
        const lightsToRemove = [];
        this.scene.traverse((object) => {
            if (object.isAmbientLight || object.isHemisphereLight || object.isPointLight || 
                (this.moonLight && object === this.moonLight) ||
                (this.moonGlow && object === this.moonGlow) ||
                (this.moonAmbientGlow && object === this.moonAmbientGlow)) {
                lightsToRemove.push(object);
            }
        });
        
        lightsToRemove.forEach(light => {
            this.scene.remove(light);
        });

        // 1. DYNAMIC FOG BASED ON LEVEL - Увеличивается с каждым уровнем
        const fogColor = 0x040804;
        const baseFogNear = 2;
        const baseFogFar = 15;
        
        // Увеличиваем плотность тумана с каждым уровнем
        const levelMultiplier = Math.min(this.level * 0.15, 0.75); // Максимум 75% увеличение
        const fogNear = baseFogNear - (levelMultiplier * 1.5);
        const fogFar = baseFogFar - (levelMultiplier * 4);
        
        this.scene.fog = new THREE.Fog(fogColor, Math.max(fogNear, 0.5), Math.max(fogFar, 5));
        this.renderer.setClearColor(fogColor);

        // 2. Уменьшаем ambient light с уровнем (темнее становится)
        const ambientIntensity = Math.max(0.32 - (this.level * 0.05), 0.12) * this.lightIntensityMultiplier;
        const ambientLight = new THREE.AmbientLight(0x404040, ambientIntensity);
        ambientLight.isAmbientLight = true;
        this.scene.add(ambientLight);

        // 3. Hemisphere light тоже уменьшается с уровнем
        const hemiIntensity = Math.max(0.24 - (this.level * 0.03), 0.08) * this.lightIntensityMultiplier;
        const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x2F4F2F, hemiIntensity);
        this.scene.add(hemiLight);

        const moonPos = this.getMoonPositionForLevel(this.level);

        // 4. УЛУЧШЕННОЕ moon light с тенями и эффектом свечения
        this.moonLight = new THREE.DirectionalLight(0xffffff, 0.64);
        this.moonLight.castShadow = true;
        this.moonLight.position.set(moonPos.x, moonPos.y, moonPos.z);
        this.moonLight.target.position.set(0, 0, 0);
        this.scene.add(this.moonLight.target);
        this.scene.add(this.moonLight);

        // 5. ДОБАВЛЯЕМ MOON GLOW EFFECT (свечение от Луны)
        if (this.moonGlow) {
            this.scene.remove(this.moonGlow);
        }
        
        // Создаем мягкий свет для эффекта свечения Луны
        this.moonGlow = new THREE.PointLight(0x87CEEB, 0.24 * this.lightIntensityMultiplier, 100);
        this.moonGlow.position.set(moonPos.x, moonPos.y, moonPos.z);
        this.moonGlow.decay = 0.5; // Медленное затухание для эффекта ореола
        this.scene.add(this.moonGlow);

        // Update the visual moon sprite position
        if (this.moon) {
            this.moon.position.set(moonPos.x, moonPos.y, moonPos.z);
        }

        // 6. Добавляем дополнительный мягкий свет для атмосферного свечения
        if (this.moonAmbientGlow) {
            this.scene.remove(this.moonAmbientGlow);
        }
        
        this.moonAmbientGlow = new THREE.AmbientLight(0x4169E1, 0.04 * this.lightIntensityMultiplier);
        this.scene.add(this.moonAmbientGlow);

        // Обновляем настройки теней для Луны
        this.updateMoonLightShadows();
    }

    updateMoonLightShadows() {
        if (!this.moonLight) return;
        
        let shadowSize = 256;
        let shadowBias = -0.002;
        let shadowRadius = 0.3;
        let frustumSize = 15;
        let frustumDistance = 60;
        let shadowType = THREE.PCFShadowMap;
        
        switch (this.shadowQuality) {
            case 'low':
                shadowSize = 256;
                shadowBias = -0.002;
                shadowRadius = 0.3;
                frustumSize = 30;
                frustumDistance = 350;
                break;
            case 'medium':
                shadowSize = 1024;
                shadowBias = -0.0007;
                shadowRadius = 1;
                frustumSize = 40;
                frustumDistance = 400;
                break;
            case 'high':
                shadowSize = 2048;
                shadowType = THREE.PCFSoftShadowMap;
                shadowBias = -0.0004;
                shadowRadius = 1.5;
                frustumSize = 60;
                frustumDistance = 450;
                break;
            case 'ultra':
                shadowSize = 4096;
                shadowType = THREE.PCFSoftShadowMap;
                shadowBias = -0.0001;
                shadowRadius = 2.5;
                frustumSize = 80;
                frustumDistance = 500;
                break;
        }
        
        // Apply shadow settings
        this.moonLight.shadow.mapSize.width = shadowSize;
        this.moonLight.shadow.mapSize.height = shadowSize;
        this.moonLight.shadow.bias = shadowBias;
        this.moonLight.shadow.normalBias = shadowBias * 20;
        this.moonLight.shadow.radius = shadowRadius;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = frustumDistance;
        this.moonLight.shadow.camera.left = -frustumSize;
        this.moonLight.shadow.camera.right = frustumSize;
        this.moonLight.shadow.camera.top = frustumSize;
        this.moonLight.shadow.camera.bottom = -frustumSize;
        this.moonLight.shadow.camera.updateProjectionMatrix();
        
        // Update renderer shadow type
        if (this.renderer) {
            this.renderer.shadowMap.type = shadowType;
        }
    }

    createVolumetricFog() {
        // Создаем систему частиц для объемной дымки (оптимизированная)
        const fogParticleCount = 50; // Уменьшили с 200 до 50 для производительности
        const fogPositions = new Float32Array(fogParticleCount * 3);
        const fogSizes = new Float32Array(fogParticleCount);
        const fogOpacities = new Float32Array(fogParticleCount);
        
        for (let i = 0; i < fogParticleCount; i++) {
            // Распределяем частицы в радиусе от игрока
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * 20 + 8; // 8-28 единиц от игрока
            const height = Math.random() * 2 - 0.5; // Низко над землей
            
            fogPositions[i * 3] = Math.cos(angle) * radius;
            fogPositions[i * 3 + 1] = height;
            fogPositions[i * 3 + 2] = Math.sin(angle) * radius;
            
            // Размеры частиц
            fogSizes[i] = Math.random() * 3 + 2; // Чуть больше для видимости
            
            // Прозрачность зависит от уровня (больше уровень = больше дымки)
            const baseOpacity = 0.03 + (this.level * 0.008);
            fogOpacities[i] = Math.min(baseOpacity, 0.1); // Максимум 10% прозрачности
        }
        
        const fogGeometry = new THREE.BufferGeometry();
        fogGeometry.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3));
        fogGeometry.setAttribute('size', new THREE.BufferAttribute(fogSizes, 1));
        fogGeometry.setAttribute('opacity', new THREE.BufferAttribute(fogOpacities, 1));
        
        // Создаем материал для дымки с более простым blending
        const fogMaterial = new THREE.PointsMaterial({
            size: 4,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
            blending: THREE.NormalBlending, // Менее ресурсоемкое чем AdditiveBlending
            color: 0x87CEEB, // Голубоватый цвет для лунной дымки
            fog: false // Частицы дымки не должны затуманиваться
        });
        
        this.volumetricFog = new THREE.Points(fogGeometry, fogMaterial);
        this.scene.add(this.volumetricFog);
        
        // Сохраняем исходные данные для анимации
        this.fogPositions = fogPositions;
        this.fogTime = 0;
    }

    updateVolumetricFog() {
        if (!this.volumetricFog || !this.fogPositions) return;
        
        // Обновляем позицию всей системы частиц относительно камеры
        if (this.camera) {
            this.volumetricFog.position.copy(this.camera.position);
            this.volumetricFog.position.y -= 0.5; // Смещаем немного ниже уровня глаз
        }
        
        // Упрощенная анимация - обновляем реже для производительности
        this.fogTime += 0.005; // Увеличили шаг анимации
        
        // Обновляем позиции частиц только каждый N-ный кадр
        if (Math.floor(this.fogTime * 100) % 3 === 0) {
            const positions = this.volumetricFog.geometry.attributes.position.array;
            
            for (let i = 0; i < positions.length; i += 3) {
                // Медленное дрейфование частиц относительно локальной системы
                positions[i] += Math.sin(this.fogTime + i) * 0.02;
                positions[i + 2] += Math.cos(this.fogTime + i) * 0.02;
                
                // Возвращаем частицы в зону видимости если они ушли слишком далеко
                const distFromPlayer = Math.sqrt(
                    positions[i] * positions[i] + 
                    positions[i + 2] * positions[i + 2]
                );
                
                if (distFromPlayer > 30) {
                    const angle = Math.random() * Math.PI * 2;
                    const radius = 8 + Math.random() * 8;
                    positions[i] = Math.cos(angle) * radius;
                    positions[i + 2] = Math.sin(angle) * radius;
                }
            }
            
            this.volumetricFog.geometry.attributes.position.needsUpdate = true;
        }
        
        // Обновляем прозрачность в зависимости от уровня
        const baseOpacity = Math.min(0.03 + (this.level * 0.008), 0.1);
        this.volumetricFog.material.opacity = baseOpacity;
    }

    createRedOrb(x, z) {
        // Создаем красный шарик среднего размера
        const orbGeometry = new THREE.SphereGeometry(0.3, 16, 16); // Средний размер
        const orbMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 0.8,
            shininess: 100,
            transparent: true,
            opacity: 0.9
        });
        
        const orb = new THREE.Mesh(orbGeometry, orbMaterial);
        orb.position.set(x, 0.5, z);
        orb.castShadow = true;
        orb.receiveShadow = true;
        
        // Добавляем светящееся ядро
        const glowGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xff6666,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        orb.add(glow);
        
        // Добавляем точечный свет для эффекта свечения
        const orbLight = new THREE.PointLight(0xff0000, 0.5, 3);
        orbLight.position.set(0, 0, 0);
        orb.add(orbLight);
        
        // Сохраняем данные о шарике
        orb.userData = {
            type: 'redOrb',
            spawnTime: Date.now(),
            floatOffset: Math.random() * Math.PI * 2
        };
        
        this.scene.add(orb);
        this.redOrbs.push(orb);
        
        return orb;
    }

    spawnRedOrbInMaze() {
        if (this.redOrbs.length >= this.maxRedOrbs) return;
        
        // Ищем случайную свободную клетку в лабиринте
        const attempts = 50;
        for (let i = 0; i < attempts; i++) {
            const x = Math.floor(Math.random() * (this.mazeSize - 2)) + 1;
            const z = Math.floor(Math.random() * (this.mazeSize - 2)) + 1;
            
            // Проверяем что клетка свободна (не стена)
            if (this.maze && this.maze.grid && this.maze.grid[z] && this.maze.grid[z][x] === 0) {
                // Проверяем что там уже нет других объектов
                const position = new THREE.Vector3(x, 0.5, z);
                const tooClose = this.redOrbs.some(orb => 
                    orb.position.distanceTo(position) < 2
                );
                
                if (!tooClose) {
                    this.createRedOrb(x, z);
                    break;
                }
            }
        }
    }

    updateRedOrbs(deltaTime) {
        // Обновляем таймер спавна
        if (this.monsterSpawned) {
            this.redOrbSpawnTimer += deltaTime * 1000;
            if (this.redOrbSpawnTimer >= this.redOrbSpawnInterval) {
                this.redOrbSpawnTimer = 0;
                this.spawnRedOrbInMaze();
            }
        }
        
        // Анимация и проверка сбора шариков монстром
        const time = Date.now() * 0.001;
        
        for (let i = this.redOrbs.length - 1; i >= 0; i--) {
            const orb = this.redOrbs[i];
            
            // Анимация парения
            const floatY = Math.sin(time + orb.userData.floatOffset) * 0.1;
            orb.position.y = 0.5 + floatY;
            
            // Вращение
            orb.rotation.y += deltaTime * 2;
            
            // Проверка сбора монстром
            if (this.monster && this.monster.visible) {
                const distance = orb.position.distanceTo(this.monster.position);
                if (distance < 1.5) { // Радиус сбора
                    this.collectRedOrb(orb, i);
                }
            }
        }
    }

    collectRedOrb(orb, index) {
        // Удаляем шарик со сцены
        this.scene.remove(orb);
        this.redOrbs.splice(index, 1);
        
        // Увеличиваем скорость монстра на короткое время
        if (this.monster) {
            const originalSpeed = this.monsterSpeed;
            this.monsterSpeed *= 1.5; // Увеличиваем скорость на 50%
            
            // Возвращаем исходную скорость через 10 секунд
            setTimeout(() => {
                this.monsterSpeed = originalSpeed;
            }, 10000);
        }
        
        // Воспроизводим звук сбора
        this.playCollectOrbSound();
    }

    playCollectOrbSound() {
        // Создаем простой звук сбора
        if (this.audioContext && !this.isMuted) {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.2);
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.2);
        }
    }

    clearRedOrbs() {
        this.redOrbs.forEach(orb => {
            this.scene.remove(orb);
        });
        this.redOrbs = [];
        this.redOrbSpawnTimer = 0;
    }

    updateSunFrustum() {
        if (!this.moonLight) return;
        
        // Dynamic frustum size based on shadow quality
        let frustumSize = 30;
        let frustumDistance = 350;
        let shadowResolution = 512;
        
        if (this.shadowQuality === 'medium') {
            frustumSize = 40;
            frustumDistance = 400;
            shadowResolution = 1024;
        } else if (this.shadowQuality === 'high') {
            frustumSize = 60;
            frustumDistance = 450;
            shadowResolution = 2048;
        } else if (this.shadowQuality === 'ultra') {
            frustumSize = 80;
            frustumDistance = 500;
            shadowResolution = 4096;
        }
        
        this.moonLight.shadow.camera.left = -frustumSize;
        this.moonLight.shadow.camera.right = frustumSize;
        this.moonLight.shadow.camera.top = frustumSize;
        this.moonLight.shadow.camera.bottom = -frustumSize;
        this.moonLight.shadow.camera.near = 0.1;
        this.moonLight.shadow.camera.far = frustumDistance;
        this.moonLight.shadow.camera.updateProjectionMatrix();
        
        // Update shadow resolution
        this.moonLight.shadow.mapSize.width = shadowResolution;
        this.moonLight.shadow.mapSize.height = shadowResolution;
    }

    createGlowEffect(x, z, color, lightColor, lightIntensity, lightDistance, enableParticles = true) {
        const glow = new THREE.Group();
        
        // Main glow layer - positioned exactly at floor level
        const mainGlowGeometry = new THREE.CylinderGeometry(0.28, 0.28, 0.035, 32);
        const mainGlowMaterial = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 2.0,
            roughness: 0.2,
            metalness: 0.1,
            transparent: true,
            opacity: 0.4
        });
        const mainGlow = new THREE.Mesh(mainGlowGeometry, mainGlowMaterial);
        mainGlow.position.set(0, -0.017, 0); // Half height below floor to sit exactly on floor
        glow.add(mainGlow);
        
        // Inner bright core
        const coreGeometry = new THREE.CylinderGeometry(0.14, 0.14, 0.021, 32);
        const coreMaterial = new THREE.MeshStandardMaterial({
            color: this.lightenColor(color, 0.5),
            emissive: color,
            emissiveIntensity: 3.0,
            roughness: 0.0,
            metalness: 0.2,
            transparent: true,
            opacity: 0.8
        });
        const core = new THREE.Mesh(coreGeometry, coreMaterial);
        core.position.set(0, -0.017, 0); // Same level as main glow
        glow.add(core);
        
        // Create particles only if enabled
        if (enableParticles) {
            const particleCount = 6;
            for (let i = 0; i < particleCount; i++) {
                const particleGeometry = new THREE.SphereGeometry(0.014, 8, 8);
                const particleMaterial = new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: color,
                    emissiveIntensity: 1.5,
                    transparent: true,
                    opacity: 0.7
                });
                const particle = new THREE.Mesh(particleGeometry, particleMaterial);
                
                // Start ALL particles from exact center
                particle.position.set(0, -0.017, 0);
                
                // Store animation data
                particle.userData = {
                    angle: (i / particleCount) * Math.PI * 2,
                    baseRadius: 0,
                    spiralSpeed: 0.3,
                    riseSpeed: 0.15,
                    maxHeight: 1.4,
                    startTime: performance.now() + (i * 300),
                    glowPosition: { x: x, z: z },
                    particleIndex: i,
                    initialY: -0.017 // Store initial Y position
                };
                
                glow.add(particle);
            }
        }
        
        // Position the entire glow group
        glow.position.set(x, 0, z); // Group at floor level
        
        // Add to scene
        this.scene.add(glow);
        
        // Add point light with reduced range
        const glowLight = new THREE.PointLight(lightColor, lightIntensity, lightDistance * 0.5);
        glowLight.position.set(x, 0.1, z); // Very low position
        this.scene.add(glowLight);
        
        return { glow, glowLight };
    }
    
    // Helper function to lighten a color
    lightenColor(color, factor) {
        const c = new THREE.Color(color);
        c.r = Math.min(1, c.r + (1 - c.r) * factor);
        c.g = Math.min(1, c.g + (1 - c.g) * factor);
        c.b = Math.min(1, c.b + (1 - c.b) * factor);
        return c.getHex();
    }

    animateGlowEffect(glow, time) {
        if (!glow) return;
        
        const currentTime = performance.now();
        const pulseIntensity = Math.sin(currentTime * 0.002) * 0.4 + 0.6;
        
        // Animate main glow and core
        if (glow.children[0]) { // Main glow
            glow.children[0].material.emissiveIntensity = 2.0 * pulseIntensity;
        }
        if (glow.children[1]) { // Core
            glow.children[1].material.emissiveIntensity = 3.0 * pulseIntensity;
            glow.children[1].rotation.y = time * 0.5;
        }
        
        // Animate ALL particles with IDENTICAL behavior
        for (let i = 2; i < glow.children.length; i++) {
            const particle = glow.children[i];
            const userData = particle.userData;
            
            // Always visible
            particle.visible = true;
            
            // Calculate elapsed time
            const elapsed = (currentTime - userData.startTime) * 0.001;
            
            // Spiral motion from center
            const spiralProgress = elapsed * userData.spiralSpeed;
            const currentRadius = userData.baseRadius + (spiralProgress * 0.03);
            const currentHeight = elapsed * userData.riseSpeed;
            const rotationAngle = userData.angle + spiralProgress * 1.5;
            
            // Calculate position
            const particleX = Math.cos(rotationAngle) * currentRadius;
            const particleZ = Math.sin(rotationAngle) * currentRadius;
            
            // Boundary checking
            const glowX = userData.glowPosition.x;
            const glowZ = userData.glowPosition.z;
            const worldX = glowX + particleX;
            const worldZ = glowZ + particleZ;
            
            const boundedX = Math.max(0.5, Math.min(this.mazeSize - 0.5, worldX));
            const boundedZ = Math.max(0.5, Math.min(this.mazeSize - 0.5, worldZ));
            
            // Apply position relative to glow group
            particle.position.x = boundedX - glowX;
            particle.position.z = boundedZ - glowZ;
            particle.position.y = userData.initialY + currentHeight;
            
            // Reset cycle
            if (currentHeight >= userData.maxHeight) {
                userData.startTime = currentTime;
                particle.material.opacity = 0.7;
            }
            
            // Uniform pulsing
            const pulsePhase = (userData.particleIndex / 6) * Math.PI * 2;
            particle.material.emissiveIntensity = 1.5 + Math.sin(currentTime * 0.003 + pulsePhase) * 0.3;
        }
        
        // No floating - keep static
    }

    ensurePathToExit(exitX, exitZ) {
        // Only ensure the exit position itself is clear
        // Don't create extra empty spaces around it
        
        // Just make sure the exit position is accessible
        this.grid[exitZ][exitX] = 0;
        
        // Create a minimal path towards center - only clear necessary cells
        const centerX = Math.floor(this.mazeSize / 2);
        const centerZ = Math.floor(this.mazeSize / 2);
        
        let currentX = exitX;
        let currentZ = exitZ;
        
        // Clear only one path towards center (not all directions)
        while (Math.abs(currentX - centerX) > 2 || Math.abs(currentZ - centerZ) > 2) {
            // Prefer moving towards center in one direction
            if (Math.abs(currentX - centerX) > Math.abs(currentZ - centerZ)) {
                // Move horizontally
                if (currentX < centerX) {
                    currentX++;
                } else {
                    currentX--;
                }
            } else {
                // Move vertically
                if (currentZ < centerZ) {
                    currentZ++;
                } else {
                    currentZ--;
                }
            }
            
            // Only clear if within bounds
            if (currentX >= 0 && currentX < this.mazeSize && currentZ >= 0 && currentZ < this.mazeSize) {
                this.grid[currentZ][currentX] = 0;
            }
        }
    }

    buildMaze() {
        // Force remove old glow effects to prevent duplication
        if (this.goal && this.goal.parent) {
            this.scene.remove(this.goal);
            this.goal = null;
        }
        if (this.goalLight && this.goalLight.parent) {
            this.scene.remove(this.goalLight);
            this.goalLight = null;
        }
        if (this.startGlow && this.startGlow.parent) {
            this.scene.remove(this.startGlow);
            this.startGlow = null;
        }
        if (this.startGlowLight && this.startGlowLight.parent) {
            this.scene.remove(this.startGlowLight);
            this.startGlowLight = null;
        }
        
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
        
        // Remove updateSunFrustum() call - shadows are now static
        const mazeGen = new Maze(this.mazeSize, this.mazeSize);
        this.grid = mazeGen.generate();
        
        // Initialize exploration grid
        this.explorationGrid = Array(this.mazeSize).fill().map(() => Array(this.mazeSize).fill(false));

        const wallMaterial = new THREE.MeshStandardMaterial({ 
            map: this.textures.brick,
            color: 0xa0b0a0, // Subtle green-grey tint (mossy/forest look)
            roughness: 0.8, // Add roughness for better material response
            metalness: 0.0, // Walls are not metallic
            shadowSide: THREE.DoubleSide
        });

        const floorGeometry = new THREE.PlaneGeometry(this.mazeSize, this.mazeSize);
        const floorMaterial = new THREE.MeshStandardMaterial({ 
            map: this.textures.floor,
            color: 0x90a090 // Slightly darker green tint for floor
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(this.mazeSize / 2 - 0.5, -0.5, this.mazeSize / 2 - 0.5);
        floor.receiveShadow = true; // ENABLED - Clean shadows
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
        
        // ENSURE DIRECT PATH TO EXIT - Prevent diagonal blocking
        this.ensurePathToExit(exitX, exitZ);
        
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
        this.wallInstancedMesh.castShadow = true; // ENABLED - Clean shadows
        this.wallInstancedMesh.receiveShadow = true; // ENABLED - Clean shadows
        this.wallInstancedMesh.frustumCulled = true;
        this.scene.add(this.wallInstancedMesh);

        const brickGeo = new THREE.BoxGeometry(0.4, 1, 0.25); // Height will be scaled
        this.brickInstancedMesh = new THREE.InstancedMesh(brickGeo, wallMaterial, decorBrickCount);
        this.brickInstancedMesh.castShadow = true; // ENABLED - Clean shadows
        this.brickInstancedMesh.receiveShadow = true; // ENABLED - Clean shadows
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
        const mainPath = findPathAStar(this.grid, this.mazeSize, this.mazeSize, exitX, exitZ, startPathX, startPathY); // Reverse to get from exit to start
        


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

        // 2. Spawn Batteries (only from level 6 onwards)
        let numBatteries = 0;
        if (this.level >= 6) {
            numBatteries = Math.min(3, this.level - 5); // Level 6: 1, Level 7: 2, Level 8+: 3
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

        // Create beautiful green exit glow using universal function
        const greenGlow = this.createGlowEffect(exitX, exitZ, 0x00ff00, 0x00ff00, 1, 3, true); // With particles for green glow
        this.goal = greenGlow.glow;
        this.goalLight = greenGlow.glowLight;

        // Create beautiful red start glow using universal function
        const redGlow = this.createGlowEffect(0, 1, 0xff0000, 0xff0000, 0.8, 2.5, false); // No particles for red glow
        this.startGlow = redGlow.glow;
        this.startGlowLight = redGlow.glowLight;

        document.getElementById('level').textContent = this.level;

        this.camera.position.set(0, this.baseHeight, 1);
        this.camera.lookAt(2, this.baseHeight, 1); // Look further into the maze
        
        // Compile scene to ensure shadows are properly initialized after maze is built
        if (this.renderer) {
            this.renderer.compile(this.scene, this.camera);
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
        
        // Filter spaces that are at least minDistance from start AND within maze bounds
        const farFromStartSpaces = availableSpaces.filter(space => {
            const distance = Math.sqrt(
                Math.pow(space.x - startX, 2) + 
                Math.pow(space.y - startZ, 2)
            );
            
            // Ensure position is within maze boundaries (1 unit margin from walls)
            const withinBounds = space.x >= 1 && space.x < this.mazeSize - 1 && 
                                space.y >= 1 && space.y < this.mazeSize - 1;
            
            return distance >= minDistance && withinBounds;
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
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0x00ff00 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // Battery cap
        const capGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8);
        const capMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.15;
        group.add(cap);

        // Add percentage text above battery
        const percentTex = this.createCoinTexture('+25%', '#ffffff');
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
                    console.log('[Flashlight] Toggle:', willTurnOn ? 'ON' : 'OFF');
                    
                    // Batch light visibility changes for performance
                    this.flashlight.visible = willTurnOn;
                    if (this.flashlightHalo) this.flashlightHalo.visible = willTurnOn;

                    // Optimize audio operations - use async to prevent blocking
                    if (!this.isMuted) {
                        console.log('[Flashlight] Audio available:', !!this.flashlightOnSound, !!this.flashlightOffSound);
                        console.log('[Flashlight] Sound buffer loaded:', !!this.flashlightSoundBuffer);
                        
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
                                    console.log('[Flashlight] Playing ON sound');
                                    this.flashlightOnSound.play();
                                } else if (!willTurnOn && this.flashlightOffSound) {
                                    console.log('[Flashlight] Playing OFF sound');
                                    this.flashlightOffSound.play();
                                }
                            } catch (e) {
                                console.warn('[Flashlight] Sound failed:', e);
                            }
                        }, 0);
                    } else {
                        console.log('[Flashlight] Game is muted');
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

            // Update FPS counter every second
            if (time - this.fpsPrevTime >= 1000) {
                const fps = this.fpsFrameCount;
                this.fpsFrameCount = 0;
                this.fpsPrevTime = time;
                
                const fpsDisplay = document.getElementById('fps-display');
                if (fpsDisplay && this.showFPS) {
                    fpsDisplay.style.display = 'block';
                    fpsDisplay.textContent = `FPS: ${fps}`;
                } else if (fpsDisplay) {
                    fpsDisplay.style.display = 'none';
                }
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
            this.flashlight.intensity = 2.5 * this.lightIntensityMultiplier; 
        }
        if (this.flashlightHalo) {
            this.flashlightHalo.intensity = 0.8 * this.lightIntensityMultiplier;
        }

        // Removed volumetric fog effect - was causing visual artifacts

        // Update red orbs
        this.updateRedOrbs(delta);

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

        // Moon movement and animation completely stopped - light is now static


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
                this.monsterController.update(delta);
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
            if (this.goal && distToGoal < 1.0) { // Slightly larger distance for new glow
                this.nextLevel();
            }


            if (this.startTime) {
                this.sessionPlayTime = Date.now() - this.startTime + this.totalPausedDuration;
                
                // Track active game time (only when controls are locked and game is not over)
                if (this.controls.isLocked && !this.isGameOver) {
                    if (!this.gameStartTime) {
                        this.gameStartTime = Date.now();
                    }
                    this.activeGameTime = Date.now() - this.gameStartTime;
                    
                    // Update timer display with active game time
                    const timerElement = document.getElementById('timer');
                    if (timerElement) {
                        const activeSeconds = Math.floor(this.activeGameTime / 1000);
                        const minutes = Math.floor(activeSeconds / 60);
                        const seconds = activeSeconds % 60;
                        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    }
                }
            }
        }

        // Animate glow effects
        const glowTime = performance.now() * 0.001;
        if (this.goal) {
            this.animateGlowEffect(this.goal, glowTime);
        }
        if (this.startGlow) {
            this.animateGlowEffect(this.startGlow, -glowTime);
        }

        // Animate stars
        if (this.starUniforms) {
            this.starUniforms.time.value = performance.now() * 0.002;
        }

        this.renderer.render(this.scene, this.camera);
        } // Close FPS limiting block
    }

    spawnMonster() {
        if (this.monsterSpawned) return;
        
        // Check if monster is created yet (it might still be loading)
        if (!this.monster) {
            console.warn('Monster spawn attempted but monster not created yet, retrying in 500ms...');
            setTimeout(() => this.spawnMonster(), 500);
            return;
        }

        console.log('=== MONSTER SPAWN START ===');

        // Spawn monster at player start position
        this.monster.position.set(0, 0.8, 1);
        this.monster.visible = true;

        // --- Monster Selection & Abilities ---
        this.resetMonsterAbilities();

        let monsterIndex = this.selectedMonsterIndex;
        if (monsterIndex === -1) {
            monsterIndex = Math.floor(Math.random() * MONSTER_DATA.length);
        }
        
        const data = MONSTER_DATA[monsterIndex];
        const randomTex = this.monsterTextures[monsterIndex];
        
        // Apply textures
        const mesh = this.monster.children.find(child => child.isMesh);
        if (mesh && randomTex) {
            mesh.material.map = randomTex;
            mesh.material.needsUpdate = true;
        }

        // Apply Ability Effects
        if (monsterIndex === 0) { // The Hollow: +10% Speed
            this.monsterSpeedMultiplier = 1.1;
            this.monsterSpeed *= this.monsterSpeedMultiplier;
        } else if (monsterIndex === 1) { // Crimson Eye: -12% Player Speed
            this.playerSpeedMultiplier = 0.88;
            this.playerSpeed = this.basePlayerSpeed * this.playerSpeedMultiplier;
        } else if (monsterIndex === 2) { // Skull Wraith: +15% Speed
            this.monsterSpeedMultiplier = 1.15;
            this.monsterSpeed *= this.monsterSpeedMultiplier;
        } else if (monsterIndex === 3) { // The Shade: -40% Light Intensity
            this.lightIntensityMultiplier = 0.6;
            this.updateLighting(); // Re-apply lighting with the new multiplier
        }

        // Independently pick a glow color for visual variety
        const glowColors = [0xff2222, 0xaa00ff, 0xffcc00, 0x0088ff];
        const glowCssColors = ['#ff2222', '#aa00ff', '#ffcc00', '#0088ff'];
        const glowIndex = Math.floor(Math.random() * glowColors.length);

        const light = this.monster.children.find(child => child.isPointLight);
        if (light) {
            light.color.setHex(glowColors[glowIndex]);
        }

        // Update monster name badge in the HUD
        const namePanel = document.getElementById('monster-name-panel');
        const nameDisplay = document.getElementById('monster-name-display');
        const abilityDisplay = document.getElementById('monster-ability-display');
        const faceThumb = document.getElementById('monster-face-thumb');

        if (namePanel && nameDisplay) {
            nameDisplay.textContent = data.name;
            nameDisplay.style.color = glowCssColors[glowIndex];
            nameDisplay.style.textShadow = `0 0 10px ${glowCssColors[glowIndex]}`;
            
            if (abilityDisplay) {
                abilityDisplay.textContent = data.ability;
                abilityDisplay.style.color = glowCssColors[glowIndex];
            }
            
            if (faceThumb) {
                faceThumb.src = data.texture;
                faceThumb.style.borderColor = glowCssColors[glowIndex];
                faceThumb.style.boxShadow = `0 0 8px ${glowCssColors[glowIndex]}`;
            }
            namePanel.style.display = 'flex';
        }
        
        // Force all children to be visible
        this.monster.traverse((child) => {
            child.visible = true;
        });
        
        console.log(`✓ Monster spawned: ${data.name}`);
        
        // Reset pathfinding state when spawning
        this.monsterPath = [];
        this.currentPathIndex = 0;
        this.monsterTargetPosition = null;
        this.lastPathUpdateTime = 0;
        
        // Reset crouch animation state
        this.monsterCrouchHeight = 0;
        this.monsterTargetCrouchHeight = 0;
        
        // Pre-calculate initial path
        this.monsterController.recalculateAStarPath();
        
        // Delayed audio start
        setTimeout(() => {
            if (this.monsterSound) {
                if (this.monsterSound.context.state === 'suspended') {
                    this.monsterSound.context.resume();
                }
                if (!this.monsterSound.isPlaying) {
                    this.playAudioSafely(this.monsterSound, 'monster');
                }
                this.monsterVolume = 0;
                this.monsterVolumeTarget = this.monsterBaseVolume * 1.2;
            }
        }, 800);
        
        this.monsterSpawned = true;
    }

    resetMonsterAbilities() {
        // Reset all multipliers and base values
        this.monsterSpeedMultiplier = 1.0;
        this.playerSpeedMultiplier = 1.0;
        this.lightIntensityMultiplier = 1.0;
        
        // Reset speeds to their defaults (considering difficulty)
        this.playerSpeed = this.basePlayerSpeed;
        this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
        
        // Reset UI effects
        if (this.minimapCanvas) this.minimapCanvas.style.opacity = '1.0';
        
        // Reset lighting if it was dimmed
        this.updateLighting();
        
        // Hide name panel
        const namePanel = document.getElementById('monster-name-panel');
        if (namePanel) namePanel.style.display = 'none';
    }

    buildMonsterMeshCache() {
        this.monsterMeshCache = new THREE.Group();
        
        // --- 1. Edge-fading Alpha Map ---
        // Generates a soft radial gradient canvas to fade out the bounding box hard edges
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(0.65, 'white');
        gradient.addColorStop(1, 'black'); // Alpha maps treat black as totally transparent
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 512, 512);
        const alphaTexture = new THREE.CanvasTexture(canvas);
        
        // --- 2. Curved (Volumetric) Geometry ---
        // Instead of a flat Sprite, we use a slice of a cylinder so the texture "bulges" convexly
        // radius=0.5, height=1.0, 16 segments, openEnded=true, thetaStart=-72deg, thetaLength=144deg
        const radius = 0.5;
        const aspectHeight = 1.0;
        const geometry = new THREE.CylinderGeometry(radius, radius, aspectHeight, 16, 1, true, -Math.PI / 2.5, Math.PI / 1.25);
        
        const curvedMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // Prevents clipping artifacts when near walls
            depthTest: true,
            alphaMap: alphaTexture,
            side: THREE.DoubleSide
        });
        
        const monsterMesh = new THREE.Mesh(geometry, curvedMaterial);
        monsterMesh.scale.set(0.75, 0.75, 0.75); // Size scaling
        // Monster mesh must NOT cast or receive shadows — the light originates from inside it
        // and we want it to spread evenly without the mesh geometry blocking the rays
        monsterMesh.castShadow = false;
        monsterMesh.receiveShadow = false;
        this.monsterMeshCache.add(monsterMesh);
        // NOTE: The main red PointLight (monsterLight) is added separately in the setTimeout after buildMonsterMeshCache()
        // The old duplicate glowLight (blue, castShadow=true) has been removed — it was interfering with clean shadow projection
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
        // Load monster textures based on MONSTER_DATA
        console.log('=== MONSTER TEXTURE LOADING START ===');
        
        this.monsterTextures = [];
        MONSTER_DATA.forEach((data, index) => {
            const texture = this.textureLoader.load(data.texture, (tex) => {
                console.log(`✓ Monster texture ${index + 1} loaded:`, data.texture);
            }, undefined, (err) => {
                console.error(`✗ Error loading monster texture ${index + 1}:`, data.texture, err);
            });
            this.monsterTextures.push(texture);
        });
        
        console.log('Monster textures array length:', this.monsterTextures.length);
        console.log('=== MONSTER TEXTURE LOADING END ===');
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
    
    // Check if there's a clear line of sight between two points
    checkLineOfSight(x1, z1, x2, z2) {
        const dx = Math.abs(x2 - x1);
        const dz = Math.abs(z2 - z1);
        const sx = x1 < x2 ? 1 : -1;
        const sz = z1 < z2 ? 1 : -1;
        let err = dx - dz;
        let x = Math.floor(x1 + 0.5);
        let z = Math.floor(z1 + 0.5);
        
        while (true) {
            // Check current position and its neighbors (thick line check)
            const cx = Math.floor(x + 0.5);
            const cz = Math.floor(z + 0.5);
            
            // Check a 2x2 or 3x3 area around the point to ensure the monster fits
            const radius = 0.3; // Check slightly around the point
            const checkPoints = [
                {x: x, z: z},
                {x: x + radius, z: z}, {x: x - radius, z: z},
                {x: x, z: z + radius}, {x: x, z: z - radius}
            ];

            for (const p of checkPoints) {
                const px = Math.floor(p.x + 0.5);
                const pz = Math.floor(p.z + 0.5);
                if (px >= 0 && px < this.mazeSize && pz >= 0 && pz < this.mazeSize) {
                    if (this.grid[pz][px] === 1) return false; // Wall blocks line of sight
                } else {
                    return false;
                }
            }
            
            // Check if we reached the target
            if (Math.floor(x2 + 0.5) === cx && Math.floor(z2 + 0.5) === cz) {
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
    
    handleGameOver() {
        this.resetMonsterAbilities();
        this.isGameOver = true;
        this.controls.unlock();
        document.getElementById('game-over').style.display = 'block';
        document.body.classList.add('menu-visible'); // Add menu-visible class
        
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
            
            let result = '';
            if (hrs > 0) result += `${hrs}:`;
            result += `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            return result;
        };

        // Use active game time for "Time Survived" (excludes pause time)
        const activeTimeString = formatTime(this.activeGameTime / 1000);
        const totalTimeString = formatTime(this.totalPlayTime);
        
        // Update death statistics
        document.getElementById('death-level').textContent = this.level;
        document.getElementById('death-time').textContent = activeTimeString;
        document.getElementById('total-death-time').textContent = totalTimeString;
        document.getElementById('death-mazes').textContent = this.mazesCompleted;
        
        // Monster sound intentionally keeps playing here — creepy effect during death screen

        // Reset Game state without instantly restarting
        const previousLevel = this.level; // Store for stats before reset
        this.level = 1; 
        this.mazeSize = this.baseMazeSize; // Reset to base size
        this.slowPowerupRemaining = 0;
        this.monsterSpeed = this.baseMonsterSpeed * this.difficultyMultipliers[this.difficulty];
        this.mazesCompleted = 0; // Reset completed mazes
        
        // Reset active game timer for next game
        this.activeGameTime = 0;
        this.gameStartTime = null;
        
        document.getElementById('monster-timer').textContent = "5.0s";
        document.getElementById('timer').textContent = "00:00";
        document.getElementById('bonus-indicator').style.display = 'none';

        // Hide monster name badge on restart
        const namePanel = document.getElementById('monster-name-panel');
        if (namePanel) namePanel.style.display = 'none';
        
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
        this.resetMonsterAbilities();
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

            // Hide monster name badge for the new level
            const namePanel = document.getElementById('monster-name-panel');
            if (namePanel) namePanel.style.display = 'none';
            
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
            
            // Removed volumetric fog recreation - was causing artifacts
            
            // Очищаем красные шарики при смене уровня
            this.clearRedOrbs();
            
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

        // Group-based muting
        if (audioKey === 'monster' && !this.audioGroups.monster) return;
        if (audioKey === 'torch' && !this.audioGroups.facula) return;
        if (audioKey === 'menu' && !this.audioGroups.facula) return; // Background menu music under facula/env
        
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
