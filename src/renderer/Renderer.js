import { EventBus } from '../core/EventBus.js';
import { ResourceManager } from '../core/ResourceManager.js';

export class Renderer {
    constructor(options = {}) {
        this.options = {
            width: window.innerWidth,
            height: window.innerHeight,
            antialias: options.antialias !== false,
            shadows: options.shadows !== false,
            pixelRatio: options.pixelRatio || Math.min(window.devicePixelRatio, 1.5),
            ...options
        };
        
        this.eventBus = options.eventBus || new EventBus();
        this.resourceManager = options.resourceManager || new ResourceManager(this.eventBus);
        
        this.scene = null;
        this.camera = null;
        this.webglRenderer = null;
        this.composer = null;
        this.controls = null;
        
        this.lights = new Map();
        this.postProcessingEffects = new Map();
        
        this.performanceMonitor = {
            frameCount: 0,
            lastTime: performance.now(),
            fps: 60,
            frameTime: 0
        };
        
        this.init();
        this.setupEventListeners();
    }
    
    init() {
        this.createScene();
        this.createCamera();
        this.createRenderer();
        this.setupLighting();
        this.setupPostProcessing();
        
        this.eventBus.emit('renderer_initialized', {
            width: this.options.width,
            height: this.options.height
        });
    }
    
    createScene() {
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.Fog(0x020502, 10, 100);
        
        // Добавляем sky
        this.createSky();
        
        this.eventBus.emit('scene_created');
    }
    
    createCamera() {
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.options.width / this.options.height,
            0.1,
            1000
        );
        
        this.camera.position.set(0, 0.7, 0);
        
        this.eventBus.emit('camera_created');
    }
    
    createRenderer() {
        this.webglRenderer = new THREE.WebGLRenderer({
            antialias: this.options.antialias,
            powerPreference: "high-performance"
        });
        
        this.webglRenderer.setSize(this.options.width, this.options.height);
        this.webglRenderer.setPixelRatio(this.options.pixelRatio);
        this.webglRenderer.setClearColor(0x020502);
        
        // Настройка теней
        if (this.options.shadows) {
            this.webglRenderer.shadowMap.enabled = true;
            this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
        }
        
        // Добавляем canvas в DOM
        document.body.appendChild(this.webglRenderer.domElement);
        
        this.eventBus.emit('renderer_created');
    }
    
    createSky() {
        // Sky sphere
        const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x020208,
            side: THREE.BackSide,
        });
        
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        sky.renderOrder = -2;
        this.scene.add(sky);
        
        // Stars
        this.createStars();
        
        // Moon
        this.createMoon();
    }
    
    createStars() {
        const STAR_COUNT = 1500;
        const starPositions = new Float32Array(STAR_COUNT * 3);
        const starColors = new Float32Array(STAR_COUNT * 3);
        const starSizes = new Float32Array(STAR_COUNT);
        
        for (let i = 0; i < STAR_COUNT; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 490;
            
            starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            starPositions[i * 3 + 2] = r * Math.cos(phi);
            
            const colorRoll = Math.random();
            if (colorRoll < 0.15) {
                starColors[i * 3] = 0.7;
                starColors[i * 3 + 1] = 0.8;
                starColors[i * 3 + 2] = 1.0;
            } else if (colorRoll < 0.25) {
                starColors[i * 3] = 1.0;
                starColors[i * 3 + 1] = 0.95;
                starColors[i * 3 + 2] = 0.7;
            } else {
                starColors[i * 3] = 1.0;
                starColors[i * 3 + 1] = 1.0;
                starColors[i * 3 + 2] = 1.0;
            }
            
            starSizes[i] = Math.random() < 0.05 ? 2.5 + Math.random() : 0.5 + Math.random() * 1.5;
        }
        
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
        starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
        
        // Создаём текстуру для звёзд
        const starCanvas = document.createElement('canvas');
        starCanvas.width = starCanvas.height = 32;
        const starCtx = starCanvas.getContext('2d');
        const gradient = starCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        starCtx.fillStyle = gradient;
        starCtx.fillRect(0, 0, 32, 32);
        
        const starTexture = new THREE.CanvasTexture(starCanvas);
        
        const starMaterial = new THREE.PointsMaterial({
            size: 1.5,
            map: starTexture,
            vertexColors: true,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        stars.renderOrder = -1;
        this.scene.add(stars);
        
        this.lights.set('stars', stars);
    }
    
    createMoon() {
        // Загружаем текстуру луны через ResourceManager
        this.resourceManager.loadTexture('/textures/moon.png').then(texture => {
            const moonMaterial = new THREE.SpriteMaterial({
                map: texture,
                color: 0xffffff,
                blending: THREE.AdditiveBlending,
                fog: false,
                depthWrite: false
            });
            
            const moon = new THREE.Sprite(moonMaterial);
            moon.scale.set(30, 30, 1);
            moon.renderOrder = 1;
            moon.position.set(0, 150, -250);
            
            this.scene.add(moon);
            this.lights.set('moon', moon);
            
            this.eventBus.emit('moon_created');
        }).catch(error => {
            console.warn('Failed to load moon texture, creating fallback');
            
            // Fallback moon without texture
            const moonMaterial = new THREE.SpriteMaterial({
                color: 0xffffcc,
                fog: false,
                depthWrite: false
            });
            
            const moon = new THREE.Sprite(moonMaterial);
            moon.scale.set(30, 30, 1);
            moon.renderOrder = 1;
            moon.position.set(0, 150, -250);
            
            this.scene.add(moon);
            this.lights.set('moon', moon);
        });
    }
    
    setupLighting() {
        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
        this.scene.add(ambientLight);
        this.lights.set('ambient', ambientLight);
        
        // Moon light
        const moonLight = new THREE.DirectionalLight(0x406080, 0.5);
        moonLight.position.set(-50, 100, -50);
        moonLight.castShadow = true;
        moonLight.shadow.mapSize.width = 1024;
        moonLight.shadow.mapSize.height = 1024;
        moonLight.shadow.camera.near = 0.5;
        moonLight.shadow.camera.far = 500;
        moonLight.shadow.camera.left = -100;
        moonLight.shadow.camera.right = 100;
        moonLight.shadow.camera.top = 100;
        moonLight.shadow.camera.bottom = -100;
        
        this.scene.add(moonLight);
        this.lights.set('moonLight', moonLight);
        
        this.eventBus.emit('lighting_setup_complete');
    }
    
    setupPostProcessing() {
        // Заглушка для пост-обработки
        // В будущем можно добавить эффекты: bloom, DOF, motion blur
        this.eventBus.emit('post_processing_setup_complete');
    }
    
    setupEventListeners() {
        this.eventBus.on('resize', (data) => {
            this.resize(data.width, data.height);
        });
        
        this.eventBus.on('graphics_quality_changed', (data) => {
            this.updateGraphicsQuality(data.quality);
        });
        
        this.eventBus.on('shadow_quality_changed', (data) => {
            this.updateShadowQuality(data.quality);
        });
    }
    
    render() {
        this.updatePerformanceMonitor();
        
        if (this.composer) {
            this.composer.render();
        } else {
            this.webglRenderer.render(this.scene, this.camera);
        }
        
        this.performanceMonitor.frameCount++;
    }
    
    updatePerformanceMonitor() {
        const now = performance.now();
        const delta = now - this.performanceMonitor.lastTime;
        
        if (delta >= 1000) {
            this.performanceMonitor.fps = Math.round(
                (this.performanceMonitor.frameCount * 1000) / delta
            );
            this.performanceMonitor.frameCount = 0;
            this.performanceMonitor.lastTime = now;
            
            this.eventBus.emit('fps_updated', {
                fps: this.performanceMonitor.fps,
                frameTime: this.performanceMonitor.frameTime
            });
        }
        
        this.performanceMonitor.frameTime = delta;
    }
    
    resize(width, height) {
        this.options.width = width;
        this.options.height = height;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.webglRenderer.setSize(width, height);
        
        if (this.composer) {
            this.composer.setSize(width, height);
        }
        
        this.eventBus.emit('renderer_resized', { width, height });
    }
    
    updateGraphicsQuality(quality) {
        switch (quality) {
            case 'low':
                this.webglRenderer.setPixelRatio(1);
                this.webglRenderer.antialias = false;
                break;
            case 'medium':
                this.webglRenderer.setPixelRatio(1.5);
                this.webglRenderer.antialias = true;
                break;
            case 'high':
                this.webglRenderer.setPixelRatio(2);
                this.webglRenderer.antialias = true;
                break;
            case 'ultra':
                this.webglRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
                this.webglRenderer.antialias = true;
                break;
        }
        
        this.eventBus.emit('graphics_quality_updated', { quality });
    }
    
    updateShadowQuality(quality) {
        if (!this.options.shadows) return;
        
        const moonLight = this.lights.get('moonLight');
        if (!moonLight) return;
        
        switch (quality) {
            case 'low':
                moonLight.shadow.mapSize.width = 256;
                moonLight.shadow.mapSize.height = 256;
                break;
            case 'medium':
                moonLight.shadow.mapSize.width = 1024;
                moonLight.shadow.mapSize.height = 1024;
                break;
            case 'high':
                moonLight.shadow.mapSize.width = 2048;
                moonLight.shadow.mapSize.height = 2048;
                break;
            case 'ultra':
                moonLight.shadow.mapSize.width = 4096;
                moonLight.shadow.mapSize.height = 4096;
                break;
        }
        
        moonLight.shadow.map?.dispose();
        moonLight.shadow.map = null;
        
        this.eventBus.emit('shadow_quality_updated', { quality });
    }
    
    // Управление объектами сцены
    addObject(object) {
        this.scene.add(object);
        this.eventBus.emit('object_added', { object });
    }
    
    removeObject(object) {
        this.scene.remove(object);
        this.eventBus.emit('object_removed', { object });
    }
    
    // Управление освещением
    updateLightIntensity(lightName, intensity) {
        const light = this.lights.get(lightName);
        if (light) {
            light.intensity = intensity;
            this.eventBus.emit('light_updated', { lightName, intensity });
        }
    }
    
    // Получение статистики
    getStats() {
        return {
            scene: {
                objects: this.scene.children.length,
                lights: this.lights.size
            },
            renderer: {
                info: this.webglRenderer.info,
                capabilities: this.webglRenderer.capabilities
            },
            performance: {
                fps: this.performanceMonitor.fps,
                frameTime: this.performanceMonitor.frameTime
            }
        };
    }
    
    // Очистка
    dispose() {
        if (this.webglRenderer) {
            this.webglRenderer.dispose();
        }
        
        if (this.composer) {
            this.composer.dispose();
        }
        
        this.scene?.clear();
        this.lights.clear();
        
        this.eventBus.emit('renderer_disposed');
    }
}
