// Вертексный шейдер для пост-эффекта
export const vertexShader = `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Фрагментный шейдер для эффекта старой пленки
export const fragmentShader = `
uniform float uTime;
uniform float uIntensity;
uniform sampler2D tDiffuse;
uniform sampler2D tNoise;
uniform sampler2D tScratches;
uniform vec2 uResolution;
varying vec2 vUv;

// Функция для создания сепия-эффекта
vec3 sepia(vec3 color) {
    vec3 sepiaColor;
    sepiaColor.r = dot(color, vec3(0.393, 0.769, 0.189));
    sepiaColor.g = dot(color, vec3(0.349, 0.686, 0.168));
    sepiaColor.b = dot(color, vec3(0.272, 0.534, 0.131));
    return sepiaColor;
}

// Функция для создания виньетирования (статическое)
float vignette(vec2 uv) {
    vec2 center = vec2(0.5, 0.5);
    float dist = distance(uv, center);
    return 1.0 - smoothstep(0.4, 0.85, dist);
}

// Функция для создания эффекта царапин (статические)
float scratches(vec2 uv) {
    vec2 scratchUv = uv * 2.0;
    float scratch1 = texture2D(tScratches, scratchUv).r;
    vec2 scratchUv2 = uv * 1.5;
    float scratch2 = texture2D(tScratches, scratchUv2).r;
    
    return (scratch1 + scratch2) * 0.03;
}

// Функция для создания эффекта пыли/зерна (статическое)
float dust(vec2 uv) {
    vec2 noiseUv = uv * 6.0;
    float noise = texture2D(tNoise, noiseUv).r;
    
    vec2 noiseUv2 = uv * 12.0;
    float noise2 = texture2D(tNoise, noiseUv2).r;
    
    return (noise * 0.06 + noise2 * 0.03);
}

// Функция для создания эффекта цветовых смещений (статическое)
vec3 chromaticAberration(vec2 uv, sampler2D tex) {
    float aberration = 0.001;
    vec3 color;
    color.r = texture2D(tex, uv + vec2(aberration, 0.0)).r;
    color.g = texture2D(tex, uv).g;
    color.b = texture2D(tex, uv - vec2(aberration, 0.0)).b;
    return color;
}

// Функция для добавления эффекта старой пленки (статическое)
float filmGrain(vec2 uv) {
    vec2 grainUv = uv * 16.0;
    float grain = texture2D(tNoise, grainUv).r;
    return (grain - 0.5) * 0.04;
}

void main() {
    vec2 uv = vUv;
    
    // Получаем базовый цвет с хроматической аберрацией
    vec3 color = chromaticAberration(uv, tDiffuse);
    
    // Применяем сепия-эффект с меньшей интенсивностью
    color = mix(color, sepia(color), uIntensity * 0.6);
    
    // Добавляем виньетирование
    float vignetteFactor = vignette(uv);
    color *= vignetteFactor;
    
    // Добавляем эффект пленки (grain)
    float grainEffect = filmGrain(uv);
    color += grainEffect * uIntensity;
    
    // Добавляем царапины
    float scratchEffect = scratches(uv);
    color += scratchEffect * uIntensity;
    
    // Добавляем шум/пыль
    float dustEffect = dust(uv);
    color += dustEffect * uIntensity;
    
    // Легкое затемнение для старой пленки
    color *= 0.95;
    
    // Более сбалансированная цветовая температура
    color.r *= 1.05;
    color.g *= 1.02;
    color.b *= 0.95;
    
    gl_FragColor = vec4(color, 1.0);
}
`;
