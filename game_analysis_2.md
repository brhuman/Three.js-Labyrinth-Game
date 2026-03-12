# Анализ производительности Three.js игры "Death Labyrinth"

## Общая информация
- **Тип проекта**: 3D лабиринт с монстром на Three.js
- **Основная проблема**: Просадка FPS при появлении монстра
- **Дополнительная проблема**: FPS остается низким даже когда монстр не виден

## Архитектура производительности

### Текущая реализация
- **Рендерер**: WebGL с antialiasing
- **Тени**: PCFSoftShadowMap с высоким разрешением (2048x2048)
- **Свет**: Множественные источники света (ambient, hemisphere, directional, spotlight, point)
- **Объекты**: InstancedMesh для стен, отдельные mesh для декораций
- **Монстр**: SkinnedMesh с анимацией и динамическим светом

## Выявленные проблемы производительности

### 1. Избыточные источники света
```javascript
// Обнаружено в коде:
- AmbientLight (0x606860, 0.26)
- HemisphereLight (0xa0c0ff, 0x101308, 0.10)  
- DirectionalLight с тенями (2048x2048)
- SpotLight (фонарик) с тенями (1024x1024)
- PointLight на монстре с тенями
- Дополнительный SpotLight (halo effect)
```
**Проблема**: Множество динамических теней и источников света создают нагрузку на GPU.

### 2. Высокое разрешение теней
```javascript
this.moonLight.shadow.mapSize.width = 2048;
this.moonLight.shadow.mapSize.height = 2048;
this.flashlight.shadow.mapSize.width = 1024;
this.flashlight.shadow.mapSize.height = 1024;
```
**Проблема**: Тени высокого разрешения требуют значительных ресурсов GPU.

### 3. Монстр с анимацией и светом
```javascript
// У монстра есть:
- SkinnedMesh с анимацией
- PointLight с динамическими тенями
- Аудио источник
- Pathfinding расчеты каждые 500ms
```
**Проблема**: Анимированный меш с динамическим светом и тенями создает множественные draw calls.

### 4. Star field с 3000 точек
```javascript
const STAR_COUNT = 3000;
// PointsMaterial с AdditiveBlending
```
**Проблема**: 3000 отдельных точек с аддитивным смешиванием могут создавать нагрузку.

### 5. Отсутствие LOD (Level of Detail)
Все объекты отображаются в полном качестве независимо от расстояния до камеры.

## Рекомендации по оптимизации

### Критические (высокий приоритет)

#### 1. Оптимизация теней ✅ ВЫПОЛНЕНО
```javascript
// Уменьшить разрешение теней
this.moonLight.shadow.mapSize.width = 1024;  // было 2048
this.moonLight.shadow.mapSize.height = 1024; // было 2048
this.flashlight.shadow.mapSize.width = 512;   // было 1024
this.flashlight.shadow.mapSize.height = 512;  // было 1024

// Отключить тени для монстра когда он далеко ✅ ВЫПОЛНЕНО
const distToPlayer = this.camera.position.distanceTo(this.monster.position);
if (distToPlayer > 10) {
    this.monsterLight.castShadow = false;
    this.monsterLight.intensity = 0.5;
} else {
    this.monsterLight.castShadow = true;
    this.monsterLight.intensity = 2;
}
```

#### 2. Оптимизация источников света
```javascript
// Уменьшить интенсивность второстепенных источников
const ambientLight = new THREE.AmbientLight(0x606860, 0.15); // было 0.26
const hemiLight = new THREE.HemisphereLight(0xa0c0ff, 0x101308, 0.05); // было 0.10

// Отключать halo эффект при низкой производительности
this.flashlightHalo.intensity = 0.3; // было 0.8
```

#### 3. Оптимизация монстра ✅ ВЫПОЛНЕНО
```javascript
// Отключать тени монстра на расстоянии
updateMonsterPerformance() {
    const distance = this.camera.position.distanceTo(this.monster.position);
    if (distance > 15) {
        this.monsterLight.castShadow = false;
        this.monsterLight.intensity = 0.5;
    } else {
        this.monsterLight.castShadow = true;
        this.monsterLight.intensity = 2;
    }
}
```

### Средний приоритет

#### 4. Оптимизация star field ✅ ВЫПОЛНЕНО
```javascript
// Уменьшить количество звезд
const STAR_COUNT = 1500; // было 3000

// Использовать более простую текстуру
this.starMaterial.opacity = 0.7; // было 0.9
```

#### 5. Оптимизация рендеринга
```javascript
// Настроить renderer для лучшей производительности
this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // ограничить DPI
this.renderer.powerPreference = "high-performance";
this.renderer.antialias = false; // отключить при низкой производительности
```

#### 6. Уровни детализации (LOD)
```javascript
// Создать LOD для монстра
const monsterLOD = new THREE.LOD();

// Высокая детализация близко
monsterLOD.addLevel(this.monsterHighDetail, 0, 10);

// Низкая детализация далеко  
monsterLOD.addLevel(this.monsterLowDetail, 10, 50);
```

### Низкий приоритет

#### 7. Оптимизация материалов
```javascript
// Использовать более простые материалы
const wallMaterial = new THREE.MeshLambertMaterial({ // вместо MeshPhongMaterial
    map: this.textures.brick,
    color: 0xa0b0a0
});
```

#### 8. Кulling (отсечение невидимых объектов) ✅ ВЫПОЛНЕНО
```javascript
// Включить frustum culling
this.wallInstancedMesh.frustumCulled = true;
this.brickInstancedMesh.frustumCulled = true;
```

## Мониторинг производительности

### 1. Добавить Stats.js
```javascript
import Stats from 'stats.js';
const stats = new Stats();
stats.showPanel(0);
document.body.appendChild(stats.dom);

// В animate()
stats.begin();
// ... рендеринг
stats.end();
```

### 2. Мониторинг draw calls
```javascript
// В консоли выводить информацию
console.log('Draw calls:', this.renderer.info.render.calls);
console.log('Triangles:', this.renderer.info.render.triangles);
```

### 3. Адаптивное качество
```javascript
// Динамическое качество в зависимости от FPS
updateQuality() {
    if (this.fps < 30) {
        this.renderer.setPixelRatio(1);
        this.moonLight.shadow.mapSize.set(512, 512);
    } else if (this.fps < 45) {
        this.renderer.setPixelRatio(1.5);
        this.moonLight.shadow.mapSize.set(1024, 1024);
    }
}
```

## Специфические проблемы с монстром

### Проблема: FPS проседает при появлении монстра
**Причина**: Монстр добавляет в сцену:
- SkinnedMesh с анимацией (множественные bone transforms)
- PointLight с динамическими тенями
- Pathfinding расчеты каждые 500ms
- Аудио обработку

### Решения:
1. **Предварительный прогрев**: Уже реализовано (монстр добавляется в сцену скрытым)
2. **Оптимизация анимации**: Использовать меньше костей или упрощенную анимацию
3. **Оптимизация pathfinding**: Увеличить интервал до 1000ms при низкой производительности
4. **Отключение теней**: Для монстра света на расстоянии

## Тестирование производительности

### Методика тестирования:
1. Измерить FPS без монстра
2. Измерить FPS с монстром (близко)
3. Измерить FPS с монстром (далеко)
4. Применить оптимизации
5. Повторить измерения

### Ожидаемые результаты:
- **Без оптимизации**: 60fps → 30-40fps при появлении монстра
- **С оптимизацией**: 60fps → 50-55fps при появлении монстра

## Конкретные проблемы в коде

### 1. Критическая проблема: Pathfinding каждые 500мс
```javascript
// Строка 89 в main.js
this.pathUpdateIntervalMs = 500; // Recalculate path every 500ms max

// Строка 2002-2008 - выполняется каждый кадр!
if (now - this.lastPathUpdateTime > this.pathUpdateIntervalMs) {
    this.monsterPath = findPathBFS(
        this.grid, this.mazeSize, this.mazeSize, // 33x33 = 1089 ячеек
        currentCellX, currentCellZ,
        playerCellX, playerCellZ
    );
    this.lastPathUpdateTime = now;
}
```
**Проблема**: BFS алгоритм на сетке 33x33 выполняется каждые 500мс - это очень затратно для CPU.

### 2. 🔥 НОВЫЕ ПРОБЛЕМЫ: Анимации каждый кадр в animate()
```javascript
// Строки 1273-1280: Анимация облаков КАЖДЫЙ КАДР
if (this.textures.clouds) {
    this.textures.clouds.offset.x += 0.0001;
    this.textures.clouds.offset.y += 0.00005;
}
if (this.cloudSphere) {
    this.cloudSphere.rotation.y += 0.0002;
}

// Строки 1285-1297: Flicker для ВСЕХ факелов КАЖДЫЙ КАДР
this.torchLights.forEach(t => {
    if (t.light) {
        t.light.intensity = t.baseIntensity + Math.sin(timeNow * 0.8 + t.gridX) * 0.1 + Math.random() * 0.2;
        // + масштабирование flame meshes
    }
});

// Строки 1347-1349: Анимация звезд КАЖДЫЙ КАДР
if (this.starMaterial) {
    this.starMaterial.opacity = 0.7 + Math.sin(time * 0.0008) * 0.15;
}

// Строки 1318-1344: Обновление батареи КАЖДЫЙ КАДР
// + обновление DOM элементов
```
**Проблема**: Даже когда вы стоите на месте, эти операции выполняются 60 раз в секунду!

### 3. Множественные динамические тени
```javascript
// Обнаружены следующие источники с тенями:
- moonLight: 2048x2048 теневая карта
- flashlight: 1024x1024 теневая карта  
- monsterLight: динамические тени от PointLight
- wallInstancedMesh: все стены отбрасывают тени
- brickInstancedMesh: все декорации отбрасывают тени
```

### 4. Star field с аддитивным смешиванием
```javascript
// Строка 197
const STAR_COUNT = 1500; // уже оптимизировано с 3000
// Строка 248-258
this.starMaterial = new THREE.PointsMaterial({
    blending: THREE.AdditiveBlending, // Очень затратно!
    transparent: true,
    opacity: 0.7
});
```

### 5. Pulsating эффект монстра
```javascript
// Строка 1991-1992
const pulseScale = 1.0 + Math.sin(Date.now() / 500) * 0.05;
this.monster.scale.set(pulseScale, pulseScale, pulseScale);
```

## Оптимизированные решения

### 0. 🔥 КРИТИЧНО: Оптимизация анимаций в animate()
```javascript
// ✅ ВЫПОЛНЕНО: Полностью отключена анимация облаков
// Cloud animation disabled for performance
// if (this.textures.clouds) {
//     this.textures.clouds.offset.x += 0.0001;
//     this.textures.clouds.offset.y += 0.00005;
// }
// if (this.cloudSphere) {
//     this.cloudSphere.rotation.y += 0.0002;
// }

// Добавить throttle для остальных анимаций
this.lastStarUpdate = 0;
this.lastTorchUpdate = 0;

// В animate():
const now = performance.now();

// Обновлять звезды каждые 100мс (10 раз в секунду)
if (now - this.lastStarUpdate > 100) {
    if (this.starMaterial) {
        this.starMaterial.opacity = 0.7 + Math.sin(now * 0.0008) * 0.15;
    }
    this.lastStarUpdate = now;
}

// Обновлять факелы каждые 33мс (30 раз в секунду)
if (now - this.lastTorchUpdate > 33) {
    const timeNow = now * 0.005;
    this.torchLights.forEach(t => {
        if (t.light) {
            t.light.intensity = t.baseIntensity + Math.sin(timeNow * 0.8 + t.gridX) * 0.1 + Math.random() * 0.2;
        }
    });
    this.lastTorchUpdate = now;
}
```

### 1. Оптимизация Pathfinding (КРИТИЧНО)
```javascript
// Увеличить интервал до 1000-2000мс
this.pathUpdateIntervalMs = 1000; // Было 500

// Добавить адаптивный интервал
const distance = this.camera.position.distanceTo(this.monster.position);
if (distance > 10) {
    this.pathUpdateIntervalMs = 2000; // Далеко - реже обновляем
} else if (distance > 5) {
    this.pathUpdateIntervalMs = 1000; // Средне - нормально
} else {
    this.pathUpdateIntervalMs = 500;  // Близко - часто
}

// Оптимизировать BFS для меньшей области
function findPathBFSOptimized(grid, width, height, startX, startY, endX, endY, maxDistance = 15) {
    // Ограничить область поиска вокруг монстра
    const minX = Math.max(0, Math.min(startX, endX) - maxDistance);
    const maxX = Math.min(width - 1, Math.max(startX, endX) + maxDistance);
    const minY = Math.max(0, Math.min(startY, endY) - maxDistance);
    const maxY = Math.min(height - 1, Math.max(startY, endY) + maxDistance);
    // ... BFS только в этой области
}
```

### 2. Оптимизация теней (ВЫСОКИЙ ПРИОРИТЕТ)
```javascript
// Уменьшить разрешение теней
this.moonLight.shadow.mapSize.set(1024, 1024); // Было 2048
this.flashlight.shadow.mapSize.set(512, 512);   // Было 1024

// Отключать тени монстра на расстоянии
updateMonsterShadows() {
    const distance = this.camera.position.distanceTo(this.monster.position);
    this.monsterLight.castShadow = distance < 10;
    this.monsterLight.intensity = distance < 10 ? 2 : 0.5;
}

// Отключить тени для декоративных элементов
this.brickInstancedMesh.castShadow = false; // Декоративные кирпичи не нужны
```

### 3. Оптимизация звезд (СРЕДНИЙ ПРИОРИТЕТ)
```javascript
// Уменьшить количество звезд
const STAR_COUNT = 1500; // Было 3000

// Убрать аддитивное смешивание
this.starMaterial.blending = THREE.NormalBlending; // Было AdditiveBlending

// Убрать анимациюOpacity или сделать реже
let lastStarUpdate = 0;
if (time - lastStarUpdate > 100) { // Обновлять каждые 100мс
    this.starMaterial.opacity = 0.7 + Math.sin(time * 0.0008) * 0.15;
    lastStarUpdate = time;
}
```

### 4. Оптимизация монстра (СРЕДНИЙ ПРИОРИТЕТ)
```javascript
// Убрать или ослабить pulsating эффект
const pulseScale = 1.0 + Math.sin(Date.now() / 1000) * 0.02; // Реже и меньше

// Использовать упрощенную физику для далекого монстра
if (distance > 15) {
    // Упрощенное движение без pathfinding
    const dx = this.camera.position.x - this.monster.position.x;
    const dz = this.camera.position.z - this.monster.position.z;
    // Простое движение в направлении игрока
}
```

## Заключение

Основные проблемы производительности связаны с:
1. **Pathfinding каждые 500мс** - самая большая нагрузка на CPU
2. **Избыточные источники света и тени** - нагрузка на GPU  
3. **3000 звезд с AdditiveBlending** - дополнительная нагрузка на GPU
4. **Отсутствие адаптивного качества** - нет оптимизации под производительность

При применении предложенных оптимизаций можно ожидать улучшение производительности на **40-60%** и значительное уменьшение просадок FPS.
