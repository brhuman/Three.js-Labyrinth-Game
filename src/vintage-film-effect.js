import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { vertexShader, fragmentShader } from './shaders.js';

export class VintageFilmEffect {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.enabled = false;
        this.intensity = 0.4;
        
        this.init();
    }

    init() {
        // Создаем composer для пост-обработки
        this.composer = new EffectComposer(this.renderer);
        
        // Добавляем основной проход рендеринга
        this.renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(this.renderPass);
        
        // Создаем материалы и текстуры для эффекта
        this.createTextures();
        this.createFilmPass();
        
        // Настраиваем composer
        this.composer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    }

    createTextures() {
        // Создаем текстуру шума
        const noiseCanvas = document.createElement('canvas');
        noiseCanvas.width = 512;
        noiseCanvas.height = 512;
        const noiseCtx = noiseCanvas.getContext('2d');
        
        // Генерируем более качественный шум с размытием
        const imageData = noiseCtx.createImageData(512, 512);
        const data = imageData.data;
        
        // Создаем базовый шум
        for (let i = 0; i < data.length; i += 4) {
            const value = Math.random() * 255;
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
        
        noiseCtx.putImageData(imageData, 0, 0);
        
        // Применяем размытие для более органичного вида
        noiseCtx.filter = 'blur(1px)';
        noiseCtx.drawImage(noiseCanvas, 0, 0);
        noiseCtx.filter = 'none';
        
        // Добавляем второй слой шума для глубины
        for (let i = 0; i < data.length; i += 4) {
            const value = Math.random() * 128; // Меньшая интенсивность второго слоя
            data[i] = Math.min(255, data[i] + value);
            data[i + 1] = Math.min(255, data[i + 1] + value);
            data[i + 2] = Math.min(255, data[i + 2] + value);
        }
        
        noiseCtx.putImageData(imageData, 0, 0);
        
        this.noiseTexture = new THREE.CanvasTexture(noiseCanvas);
        this.noiseTexture.wrapS = THREE.RepeatWrapping;
        this.noiseTexture.wrapT = THREE.RepeatWrapping;
        
        // Создаем текстуру царапин
        const scratchesCanvas = document.createElement('canvas');
        scratchesCanvas.width = 512;
        scratchesCanvas.height = 512;
        const scratchesCtx = scratchesCanvas.getContext('2d');
        
        // Заполняем черным цветом
        scratchesCtx.fillStyle = '#000000';
        scratchesCtx.fillRect(0, 0, 512, 512);
        
        // Добавляем тонкие случайные царапины
        for (let i = 0; i < 30; i++) {
            const opacity = Math.random() * 0.15 + 0.05; // Меньшая прозрачность
            scratchesCtx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            scratchesCtx.lineWidth = Math.random() * 1 + 0.2; // Тонкие линии
            scratchesCtx.beginPath();
            
            // Создаем более реалистичные царапины с изгибами
            const startX = Math.random() * 512;
            const startY = Math.random() * 512;
            scratchesCtx.moveTo(startX, startY);
            
            // Добавляем несколько сегментов для изогнутых царапин
            let currentX = startX;
            let currentY = startY;
            const segments = Math.floor(Math.random() * 3) + 2;
            
            for (let j = 0; j < segments; j++) {
                currentX += (Math.random() - 0.5) * 100;
                currentY += (Math.random() - 0.5) * 100;
                scratchesCtx.lineTo(currentX, currentY);
            }
            
            scratchesCtx.stroke();
        }
        
        // Добавляем вертикальные линии для эффекта пленки (более тонкие)
        for (let i = 0; i < 15; i++) {
            const opacity = Math.random() * 0.08 + 0.02; // Очень тонкие
            scratchesCtx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            scratchesCtx.lineWidth = Math.random() * 0.3 + 0.1;
            scratchesCtx.beginPath();
            const x = Math.random() * 512;
            scratchesCtx.moveTo(x, 0);
            scratchesCtx.lineTo(x, 512);
            scratchesCtx.stroke();
        }
        
        // Добавляем горизонтальные царапины для разнообразия
        for (let i = 0; i < 10; i++) {
            const opacity = Math.random() * 0.06 + 0.01;
            scratchesCtx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
            scratchesCtx.lineWidth = Math.random() * 0.2 + 0.1;
            scratchesCtx.beginPath();
            const y = Math.random() * 512;
            scratchesCtx.moveTo(0, y);
            scratchesCtx.lineTo(512, y);
            scratchesCtx.stroke();
        }
        
        this.scratchesTexture = new THREE.CanvasTexture(scratchesCanvas);
        this.scratchesTexture.wrapS = THREE.RepeatWrapping;
        this.scratchesTexture.wrapT = THREE.RepeatWrapping;
    }

    createFilmPass() {
        // Создаем шейдерный материал
        this.filmMaterial = new THREE.ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                tNoise: { value: this.noiseTexture },
                tScratches: { value: this.scratchesTexture },
                uTime: { value: 0 },
                uIntensity: { value: this.intensity },
                uResolution: { 
                    value: new THREE.Vector2(window.innerWidth, window.innerHeight) 
                }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader
        });

        // Создаем проход для эффекта
        this.filmPass = new ShaderPass(this.filmMaterial);
        this.filmPass.renderToScreen = true;
        this.composer.addPass(this.filmPass);
    }

    render(deltaTime) {
        if (this.enabled) {
            // Время больше не нужно для анимаций, но оставляем для совместимости
            // this.filmMaterial.uniforms.uTime.value += deltaTime;
            
            // Рендерим с пост-эффектом
            this.composer.render();
        } else {
            // Обычный рендеринг
            this.renderer.render(this.scene, this.camera);
        }
    }

    setIntensity(value) {
        this.intensity = Math.max(0, Math.min(1, value));
        this.filmMaterial.uniforms.uIntensity.value = this.intensity;
    }

    enable() {
        this.enabled = true;
    }

    disable() {
        this.enabled = false;
    }

    toggle() {
        this.enabled = !this.enabled;
    }

    resize(width, height) {
        this.composer.setSize(width, height);
        this.filmMaterial.uniforms.uResolution.value.set(width, height);
    }

    dispose() {
        // Очистка ресурсов
        if (this.noiseTexture) this.noiseTexture.dispose();
        if (this.scratchesTexture) this.scratchesTexture.dispose();
        if (this.filmMaterial) this.filmMaterial.dispose();
        if (this.composer) this.composer.dispose();
    }
}
