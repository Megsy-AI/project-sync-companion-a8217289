# Three.js Mobile Optimization: Garena Free Fire Style

## 1. Renderer & Pixel Ratio
Low-end Android devices struggle with fill rate. Capping resolution is mandatory.
```javascript
const renderer = new THREE.WebGLRenderer({ 
    antialias: false, // Use FXAA instead
    powerPreference: 'high-performance',
    precision: 'mediump' // Crucial for mobile performance
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.8)); // 0.7-0.8 for low-end
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
```

## 2. Lighting Setup
Free Fire uses a "Sun + Sky" model. 
* **HemisphereLight**: Ground: `0x443333`, Sky: `0x88bbff`, Intensity: `0.6`.
* **DirectionalLight**: `0xffffff`, Intensity: `1.0`.
* **Shadows**: Single directional light, 512x512 map, `THREE.PCFShadowMap`.

```javascript
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.set(512, 512); // Low res
sun.shadow.camera.left = -50;
sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.bias = -0.0005; // Prevent shadow acne
scene.add(sun);

const hemi = new THREE.HemisphereLight(0x88bbff, 0x443333, 0.6);
scene.add(hemi);
```

## 3. Materials: "Stylized-Realistic"
Avoid `MeshStandardMaterial` (PBR) on low-end. Use `MeshLambertMaterial` or a custom `ShaderMaterial` with simple N•L lighting and a ramp.

```javascript
// Toon-hybrid trick: Simple Lambert with a ramp or step
const mobileMaterial = new THREE.MeshLambertMaterial({
    map: texture,
    color: 0xeeeeee,
    reflectivity: 0.1
});

// Custom Shader snippet for "stylized" boost
const customShader = {
    uniforms: {
        tDiffuse: { value: null },
        saturation: { value: 1.2 },
        contrast: { value: 1.1 }
    },
    fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D tDiffuse;
        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            // Saturation boost
            float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));
            tex.rgb = mix(vec3(gray), tex.rgb, 1.2); 
            // Contrast boost
            tex.rgb = (tex.rgb - 0.5) * 1.1 + 0.5;
            gl_FragColor = tex;
        }
    `
};
```

## 4. Cheap Post-Processing Stack
Avoid `EffectComposer` chains. Merge into a single "Uber-Shader" pass.
* **FXAA**: Mandatory if `antialias: false`.
* **Bloom**: Use a small (256px) downscaled blur pass and additive blend. Threshold: `0.8`.
* **Vignette**: Simple `1.0 - length(uv - 0.5)`.

## 5. Atmosphere & Fog
Use `THREE.FogExp2` for better depth perception at distance.
```javascript
scene.fog = new THREE.FogExp2(0x88bbff, 0.002);
scene.background = new THREE.Color(0x88bbff);
```

## 6. Procedural Normal Detail
To save memory, use a tiny 64x64 noise tile and triplanar-ish mapping for terrain detail instead of huge unique normal maps.

```glsl
// Detail Normal Trick
vec3 detailNormal = texture2D(detailMap, vUv * 20.0).rgb * 2.0 - 1.0;
normal = normalize(normal + detailNormal * 0.2);
```

## 7. Performance Budget
* **Draw Calls**: < 100 per frame.
* **Triangles**: < 100k - 200k.
* **Textures**: Max 1024px, use KTX2/Basis compression.
* **Target**: 30-60 FPS on Adreno 500/600 series.
