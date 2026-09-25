// Ciel animé : dégradé, soleil, nuages, lumières et ombres selon l'heure
import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, smoothstep, rng } from './noise.js';

// Clés de couleur (heure → ciel haut, horizon, lumière, intensités)
const KEYS = [
  { h: 0.0, top: '#070d2e', hor: '#1a2a5e', sun: '#9ab8ff', si: 0.0, amb: 0.3 },
  { h: 5.6, top: '#0b1438', hor: '#2a2f6a', sun: '#9ab8ff', si: 0.0, amb: 0.32 },
  { h: 6.6, top: '#3a55b8', hor: '#ff9d6b', sun: '#ffb07a', si: 1.0, amb: 0.55 },
  { h: 8.0, top: '#2f8ff0', hor: '#a8e4ff', sun: '#fff0d2', si: 2.9, amb: 0.95 },
  { h: 12.0, top: '#2a86f2', hor: '#9fe0ff', sun: '#fff8ea', si: 3.2, amb: 1.0 },
  { h: 16.0, top: '#3a8ae8', hor: '#ffe3a6', sun: '#ffdc98', si: 3.0, amb: 0.95 },
  { h: 18.0, top: '#4d6fd6', hor: '#ffa45a', sun: '#ffa050', si: 2.4, amb: 0.8 },
  { h: 18.8, top: '#5a44b0', hor: '#ff5f7a', sun: '#ff6a44', si: 1.4, amb: 0.62 },
  { h: 19.3, top: '#27206a', hor: '#8a3a86', sun: '#c86aa0', si: 0.3, amb: 0.42 },
  { h: 20.2, top: '#080f34', hor: '#1c2660', sun: '#9ab8ff', si: 0.0, amb: 0.3 },
  { h: 24.0, top: '#070d2e', hor: '#1a2a5e', sun: '#9ab8ff', si: 0.0, amb: 0.3 },
];
const cA = new THREE.Color(), cB = new THREE.Color();
function sample(hour) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((hour - a.h) / (b.h - a.h), 0, 1);
  const mix = (ka, kb) => cA.set(ka).lerp(cB.set(kb), t).clone();
  return { top: mix(a.top, b.top), hor: mix(a.hor, b.hor), sun: mix(a.sun, b.sun), si: lerp(a.si, b.si, t), amb: lerp(a.amb, b.amb, t) };
}

// Facteur de nuit : 0 le jour, 1 la nuit (montée entre 18:45 et 19:15)
export function brumeFactor(hour) {
  const { nightHour, dawnHour } = CFG.time;
  if (hour >= nightHour - 0.25) return smoothstep(nightHour - 0.25, nightHour + 0.25, hour);
  if (hour < dawnHour + 0.5) return 1 - smoothstep(dawnHour, dawnHour + 0.5, hour);
  return 0;
}

export function createSky(scene) {
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color() },
      hor: { value: new THREE.Color() },
      bot: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      sunCol: { value: new THREE.Color() },
      stars: { value: 0 },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; varying vec3 vP;
      void main(){
        float y = vP.y;
        vec3 c = y > 0.0 ? mix(hor, top, pow(clamp(y*1.5,0.0,1.0), 0.65)) : mix(hor, bot, clamp(-y*4.0,0.0,1.0));
        float s = max(dot(normalize(vP), sunDir), 0.0);
        c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.5);
        if (stars > 0.01 && y > 0.02) {
          vec3 q = floor(normalize(vP) * 260.0);
          float h = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          c += vec3(0.85, 0.9, 1.0) * step(0.9965, h) * stars * (0.6 + 0.4 * fract(h * 97.0));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), skyMat);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  // nuages low poly
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.95, fog: false });
  const r = rng(314);
  for (let i = 0; i < 22; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const rad = (k === Math.floor(n / 2) ? 22 : 12) + r() * 10;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 1), cloudMat);
      m.position.set((k - n / 2) * 16 + r() * 6, (k === Math.floor(n / 2) ? 6 : 0) + r() * 4, r() * 14 - 7);
      m.scale.y = 0.6;
      c.add(m);
    }
    const a = r() * Math.PI * 2, d = 150 + r() * 700;
    c.position.set(Math.cos(a) * d, 170 + r() * 90, Math.sin(a) * d);
    c.rotation.y = r() * 6;
    clouds.add(c);
  }
  scene.add(clouds);

  const hemi = new THREE.HemisphereLight('#cfe6ff', '#7a6a48', 0.8);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1d6', 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun);
  scene.add(sun.target);

  scene.fog = new THREE.Fog('#cfe7f3', 150, 1100);
  const nightFog = new THREE.Color('#0d1638');
  const seaTint = new THREE.Color('#4f9db3');
  const sunDir = new THREE.Vector3();
  const snap = new THREE.Vector3();

  function update(hour, camPos, t, dt, focus) {
    const s = sample(hour);
    const b = brumeFactor(hour);
    skyMat.uniforms.top.value.copy(s.top);
    skyMat.uniforms.hor.value.copy(s.hor);
    skyMat.uniforms.bot.value.copy(s.hor).multiplyScalar(0.55);
    dome.position.copy(camPos);

    // Soleil : lever 6h30 à l'est, coucher 19h à l'ouest
    const k = clamp((hour - 6.4) / (19.1 - 6.4), 0, 1);
    const elev = Math.sin(k * Math.PI) * 1.0 - 0.06;
    const az = k * Math.PI; // est (+x) → sud (+z) → ouest (-x)
    sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az) * 0.7).normalize();
    skyMat.uniforms.sunDir.value.copy(sunDir);
    skyMat.uniforms.sunCol.value.copy(s.sun).multiplyScalar(clamp(elev * 5 + 0.4, 0, 1) * (1 - b));

    // ombres : la caméra d'ombre suit le point d'intérêt, alignée sur les texels
    const f = focus || camPos;
    const texel = 140 / 2048;
    snap.set(Math.round(f.x / texel) * texel, Math.round(f.y / texel) * texel, Math.round(f.z / texel) * texel);
    sun.position.copy(snap).addScaledVector(sunDir, 180);
    sun.target.position.copy(snap);
    sun.color.copy(s.sun);
    sun.intensity = s.si * (elev > -0.02 ? 1 : 0);
    sun.castShadow = elev > 0.04;

    hemi.intensity = s.amb * 1.5;
    hemi.color.copy(s.hor).lerp(new THREE.Color('#ffffff'), 0.4);
    hemi.groundColor.set('#7a6a48').multiplyScalar(0.5 + s.amb * 0.5);

    // nuages : dérive lente, teintés par le ciel, noyés dans la nuit
    clouds.children.forEach((c, i) => {
      c.position.x += dt * (1.5 + (i % 3));
      if (c.position.x > 900) c.position.x = -900;
    });
    cloudMat.color.copy(s.hor).lerp(new THREE.Color('#ffffff'), 0.55).multiplyScalar(0.35 + s.amb * 0.75);
    cloudMat.emissive.copy(cloudMat.color).multiplyScalar(0.6);
    cloudMat.opacity = 0.92 * (1 - b * 0.6);

    // nuit : lune bleutée (la lumière directionnelle passe à l'opposé du soleil), étoiles, brouillard bleu nuit
    if (elev < -0.02) {
      sun.position.copy(snap).addScaledVector(new THREE.Vector3(-0.35, 0.8, -0.45).normalize(), 180);
      sun.color.set('#9ab8ff');
      sun.intensity = 0.55 * b;
      sun.castShadow = b > 0.6;
    }
    skyMat.uniforms.stars.value = b;
    scene.fog.color.copy(s.hor).lerp(seaTint, 0.2 * (1 - b)).lerp(nightFog, b * 0.7);
    scene.fog.near = lerp(170, 35, b);
    scene.fog.far = lerp(1250, 300, b);
    return { brume: b, sky: s, sunDir, fog: scene.fog };
  }

  return { update, sun };
}
