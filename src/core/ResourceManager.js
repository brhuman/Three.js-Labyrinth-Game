import { EventBus } from './EventBus.js';

export class ResourceManager {
    constructor(eventBus = null) {
        this.eventBus = eventBus || new EventBus();
        this.textures = new Map();
        this.sounds = new Map();
        this.models = new Map();
        this.loadingPromises = new Map();
        this.loadedCount = 0;
        this.totalCount = 0;
        this.loadingManager = null;
        this.textureLoader = null;
        this.audioLoader = null;
        
        this.setupLoaders();
    }
    
    setupLoaders() {
        // Создаём LoadingManager для отслеживания прогресса
        this.loadingManager = new THREE.LoadingManager();
        
        this.loadingManager.onLoad = () => {
            this.eventBus.emit('resources_loaded', {
                loaded: this.loadedCount,
                total: this.totalCount
            });
        };
        
        this.loadingManager.onProgress = (url, loaded, total) => {
            this.eventBus.emit('resource_progress', {
                url,
                loaded,
                total,
                percentage: (loaded / total) * 100
            });
        };
        
        this.loadingManager.onError = (url) => {
            console.error(`Failed to load resource: ${url}`);
            this.eventBus.emit('resource_error', { url });
        };
        
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.audioLoader = new THREE.AudioLoader(this.loadingManager);
    }
    
    async loadTexture(path, options = {}) {
        // Проверяем кэш
        if (this.textures.has(path)) {
            return this.textures.get(path);
        }
        
        // Проверяем, уже ли загружается
        if (this.loadingPromises.has(`texture:${path}`)) {
            return this.loadingPromises.get(`texture:${path}`);
        }
        
        const promise = new Promise((resolve, reject) => {
            this.textureLoader.load(
                path,
                (texture) => {
                    // Применяем опции
                    if (options.repeat) {
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(...options.repeat);
                    }
                    
                    if (options.flipY !== undefined) {
                        texture.flipY = options.flipY;
                    }
                    
                    if (options.encoding) {
                        texture.encoding = options.encoding;
                    }
                    
                    if (options.generateMipmaps !== undefined) {
                        texture.generateMipmaps = options.generateMipmaps;
                    }
                    
                    this.textures.set(path, texture);
                    this.loadedCount++;
                    
                    this.eventBus.emit('texture_loaded', {
                        path,
                        texture,
                        options
                    });
                    
                    resolve(texture);
                },
                (progress) => {
                    this.eventBus.emit('texture_progress', {
                        path,
                        progress
                    });
                },
                (error) => {
                    console.error(`Failed to load texture ${path}:`, error);
                    this.eventBus.emit('texture_error', { path, error });
                    reject(error);
                }
            );
        });
        
        this.loadingPromises.set(`texture:${path}`, promise);
        this.totalCount++;
        
        return promise;
    }
    
    async loadSound(path) {
        // Проверяем кэш
        if (this.sounds.has(path)) {
            return this.sounds.get(path);
        }
        
        // Проверяем, уже ли загружается
        if (this.loadingPromises.has(`sound:${path}`)) {
            return this.loadingPromises.get(`sound:${path}`);
        }
        
        const promise = new Promise((resolve, reject) => {
            this.audioLoader.load(
                path,
                (buffer) => {
                    this.sounds.set(path, buffer);
                    this.loadedCount++;
                    
                    this.eventBus.emit('sound_loaded', {
                        path,
                        buffer
                    });
                    
                    resolve(buffer);
                },
                undefined,
                (error) => {
                    console.error(`Failed to load sound ${path}:`, error);
                    this.eventBus.emit('sound_error', { path, error });
                    reject(error);
                }
            );
        });
        
        this.loadingPromises.set(`sound:${path}`, promise);
        this.totalCount++;
        
        return promise;
    }
    
    async loadModel(path, options = {}) {
        // Для простоты пока используем базовый загрузчик
        // В будущем можно интегрировать GLTFLoader
        
        if (this.models.has(path)) {
            return this.models.get(path);
        }
        
        if (this.loadingPromises.has(`model:${path}`)) {
            return this.loadingPromises.get(`model:${path}`);
        }
        
        const promise = new Promise((resolve, reject) => {
            // Заглушка для загрузки моделей
            // В реальной реализации здесь будет GLTFLoader или другой загрузчик
            setTimeout(() => {
                const model = { path, loaded: true }; // Заглушка
                this.models.set(path, model);
                this.loadedCount++;
                
                this.eventBus.emit('model_loaded', {
                    path,
                    model
                });
                
                resolve(model);
            }, 100);
        });
        
        this.loadingPromises.set(`model:${path}`, promise);
        this.totalCount++;
        
        return promise;
    }
    
    // Массовая загрузка ресурсов
    async loadResources(resourceList) {
        const promises = [];
        
        resourceList.forEach(resource => {
            switch (resource.type) {
                case 'texture':
                    promises.push(this.loadTexture(resource.path, resource.options));
                    break;
                case 'sound':
                    promises.push(this.loadSound(resource.path));
                    break;
                case 'model':
                    promises.push(this.loadModel(resource.path, resource.options));
                    break;
            }
        });
        
        try {
            const results = await Promise.all(promises);
            this.eventBus.emit('all_resources_loaded', {
                count: results.length,
                resources: resourceList
            });
            return results;
        } catch (error) {
            console.error('Failed to load some resources:', error);
            this.eventBus.emit('resources_load_failed', { error });
            throw error;
        }
    }
    
    // Предзагрузка основных игровых ресурсов
    async preloadGameResources() {
        const resources = [
            // Текстуры
            { type: 'texture', path: '/textures/brick.png', options: { repeat: [4, 4] } },
            { type: 'texture', path: '/textures/floor.png', options: { repeat: [8, 8] } },
            { type: 'texture', path: '/textures/clouds.png' },
            { type: 'texture', path: '/textures/moon.png' },
            
            // Звуки
            { type: 'sound', path: '/sounds/monster_ambient.mp3' },
            { type: 'sound', path: '/sounds/scream1.mp3' },
            { type: 'sound', path: '/sounds/scream2.mp3' },
            { type: 'sound', path: '/sounds/scream3.mp3' },
            { type: 'sound', path: '/sounds/light.mp3' },
            { type: 'sound', path: '/sounds/fire.mp3' }
        ];
        
        return this.loadResources(resources);
    }
    
    // Управление ресурсами
    getTexture(path) {
        return this.textures.get(path);
    }
    
    getSound(path) {
        return this.sounds.get(path);
    }
    
    getModel(path) {
        return this.models.get(path);
    }
    
    hasTexture(path) {
        return this.textures.has(path);
    }
    
    hasSound(path) {
        return this.sounds.has(path);
    }
    
    hasModel(path) {
        return this.models.has(path);
    }
    
    // Очистка ресурсов
    disposeTexture(path) {
        const texture = this.textures.get(path);
        if (texture) {
            texture.dispose();
            this.textures.delete(path);
            this.eventBus.emit('texture_disposed', { path });
        }
    }
    
    disposeSound(path) {
        this.sounds.delete(path);
        this.eventBus.emit('sound_disposed', { path });
    }
    
    disposeModel(path) {
        const model = this.models.get(path);
        if (model && model.dispose) {
            model.dispose();
        }
        this.models.delete(path);
        this.eventBus.emit('model_disposed', { path });
    }
    
    disposeAll() {
        // Очищаем текстуры
        this.textures.forEach((texture, path) => {
            texture.dispose();
        });
        this.textures.clear();
        
        // Очищаем модели
        this.models.forEach((model, path) => {
            if (model.dispose) {
                model.dispose();
            }
        });
        this.models.clear();
        
        // Очищаем звуки
        this.sounds.clear();
        
        // Очищаем промисы
        this.loadingPromises.clear();
        
        this.eventBus.emit('all_resources_disposed');
    }
    
    // Статистика
    getLoadProgress() {
        return {
            loaded: this.loadedCount,
            total: this.totalCount,
            percentage: this.totalCount > 0 ? (this.loadedCount / this.totalCount) * 100 : 0,
            isLoading: this.loadedCount < this.totalCount
        };
    }
    
    getResourceStats() {
        return {
            textures: this.textures.size,
            sounds: this.sounds.size,
            models: this.models.size,
            loading: this.loadingPromises.size,
            progress: this.getLoadProgress()
        };
    }
    
    // Отладка
    listLoadedResources() {
        return {
            textures: Array.from(this.textures.keys()),
            sounds: Array.from(this.sounds.keys()),
            models: Array.from(this.models.keys())
        };
    }
    
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
}
