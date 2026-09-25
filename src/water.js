// Eau stylisée : dégradé de profondeur, écume du rivage, reflets du soleil, vagues
import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { CFG } from './config.js';

// Carte des profondeurs de l'île (pour le shader) : 256 × 256 sur la zone de l'île
function depthTexture() {
  const N = 256, S = CFG.island.size;
  const data = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * S, z = (j / (N - 1) - 0.5) * S;
      const h = heightAt(x, z);
      const v = Math.max(0, Math.min(255, Math.round(((h + 16) / 20) * 255)));
      const k = (j * N + i) * 4;
      data[k] = v; data[k + 1] = v; data[k + 2] = v; data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export function createWater(scene) {
  const uniforms = {
    uTime: { value: 0 },
    uDepth: { value: depthTexture() },
    uSize: { value: CFG.island.size },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color('#fff4d6') },
    uSunI: { value: 1 },
    uSky: { value: new THREE.Color('#9fd3ef') },
    uAmb: { value: 1 },
    uShallow: { value: new THREE.Color('#5fd3c9') },
    uDeep: { value: new THREE.Color('#12506e') },
    uFogColor: { value: new THREE.Color() },
    uFogNear: { value: 100 },
    uFogFar: { value: 1000 },
    uBrume: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vW;
      varying float vFogDepth;
      float wave(vec2 p, vec2 d, float f, float s, float a){ return sin(dot(p, d) * f + uTime * s) * a; }
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float h = wave(w.xz, vec2(0.8,0.6), 0.09, 1.1, 0.10) + wave(w.xz, vec2(-0.3,0.95), 0.13, 1.6, 0.06) + wave(w.xz, vec2(0.95,-0.2), 0.21, 2.1, 0.03);
        w.y += h;
        vW = w.xyz;
        vec4 mv = viewMatrix * w;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uSize, uSunI, uAmb, uFogNear, uFogFar, uBrume;
      uniform sampler2D uDepth;
      uniform vec3 uSunDir, uSunColor, uSky, uShallow, uDeep, uFogColor;
      varying vec3 vW;
      varying float vFogDepth;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        // profondeur sous la surface
        vec2 uv = vW.xz / uSize + 0.5;
        float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
        float bed = texture2D(uDepth, clamp(uv, 0.0, 1.0)).r * 20.0 - 16.0;
        bed = mix(-16.0, bed, inside);
        float depth = max(0.0, vW.y - bed);

        // normale : dérivées des vagues + petites rides
        vec2 p = vW.xz;
        float n1 = noise(p * 0.35 + uTime * 0.25), n2 = noise(p * 0.9 - uTime * 0.4);
        float near = 1.0 - smoothstep(40.0, 260.0, vFogDepth);
        vec3 N = normalize(vec3(((n1 - 0.5) * 0.35 + (n2 - 0.5) * 0.15) * near, 1.0, (n2 - 0.5) * 0.35 * near));

        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        float dk = smoothstep(0.0, 9.0, depth);
        vec3 col = mix(uShallow, uDeep, dk);
        col = mix(col, uSky, fres * 0.55);
        col *= mix(0.35, 1.0, uAmb);

        // bandes de couleur (look low poly)
        col = floor(col * 14.0) / 14.0;

        // reflet du soleil
        vec3 H = normalize(uSunDir + V);
        float spec = pow(max(dot(N, H), 0.0), mix(60.0, 220.0, near)) * uSunI * mix(0.35, 1.0, near);
        col += uSunColor * spec * 1.6;

        // écume sur le rivage et autour des rochers
        float foamBand = 1.0 - smoothstep(0.0, 0.55, depth);
        float foamN = noise(p * 1.4 + vec2(uTime * 0.6, uTime * 0.3));
        float wavesIn = 0.5 + 0.5 * sin(depth * 9.0 - uTime * 2.2);
        float foam = step(0.55, foamBand * (0.6 + 0.6 * wavesIn) + foamN * 0.35 * foamBand);
        col = mix(col, vec3(0.96, 0.97, 0.95) * mix(0.35, 1.0, uAmb), foam * 0.9);

        float alpha = mix(0.55, 0.93, smoothstep(0.0, 3.0, depth));
        alpha = max(alpha, foam * 0.9);

        // la Brume assombrit la mer
        col = mix(col, vec3(0.03, 0.02, 0.05), uBrume * 0.6);

        float fog = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fog);
        gl_FragColor = vec4(col, mix(alpha, 1.0, fog));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  const geo = new THREE.PlaneGeometry(3900, 3900, 240, 240);   // maille de 16,25 m (voir le recalage ci-dessous)
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    mesh,
    update(t, camPos, sky, sunDir, fog, brume) {
      uniforms.uTime.value = t;
      mesh.position.x = Math.round(camPos.x / 16.25) * 16.25;
      mesh.position.z = Math.round(camPos.z / 16.25) * 16.25;
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uSunColor.value.copy(sky.sun);
      uniforms.uSunI.value = Math.min(1, sky.si);
      uniforms.uSky.value.copy(sky.hor).lerp(sky.top, 0.35);
      uniforms.uAmb.value = Math.min(1, sky.amb * 1.25);
      uniforms.uFogColor.value.copy(fog.color);
      uniforms.uFogNear.value = fog.near;
      uniforms.uFogFar.value = fog.far;
      uniforms.uBrume.value = brume;
    },
  };
}

// Hauteur des vagues côté CPU (pour faire flotter l'avion avec l'eau)
export function waveHeight(x, z, t) {
  const w = (dx, dz, f, s, a) => Math.sin((x * dx + z * dz) * f + t * s) * a;
  return w(0.8, 0.6, 0.09, 1.1, 0.1) + w(-0.3, 0.95, 0.13, 1.6, 0.06) + w(0.95, -0.2, 0.21, 2.1, 0.03);
}
