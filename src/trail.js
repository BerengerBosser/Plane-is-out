// Traînées de condensation en bout d'ailes : rubans qui s'élargissent et s'effacent
// Calculées localement à partir du mouvement de l'avion (identique pour l'hôte et les invités).
import * as THREE from 'three';

const N = 110;          // échantillons par ruban
const STEP = 0.045;     // s entre deux échantillons
const LIFE = N * STEP;  // durée de vie d'un échantillon

function ribbon(scene) {
  const pos = new Float32Array(N * 2 * 3);
  const col = new Float32Array(N * 2 * 4);
  const idx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true }));
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  // échantillons : position, largeur latérale, âge, actif
  const S = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), side: new THREE.Vector3(), age: LIFE + 1, on: false }));
  return { mesh, geo, pos, col, S, head: 0 };
}

export function createTrails(scene, tips = [new THREE.Vector3(-9.5, 4.15, 0.9), new THREE.Vector3(9.5, 4.15, 0.9)], width = 1) {
  const rs = [ribbon(scene), ribbon(scene)];
  const last = new THREE.Vector3();
  let acc = 0, speed = 0, has = false;
  const tmp = new THREE.Vector3(), right = new THREE.Vector3();

  return {
    update(dt, root, { active = true, tint = null } = {}) {
      root.updateMatrixWorld(true);
      // vitesse estimée depuis le déplacement de l'avion
      if (has && dt > 0) speed = speed * 0.85 + (root.position.distanceTo(last) / dt) * 0.15;
      last.copy(root.position); has = true;
      const emit = active && speed > 12 && root.position.y > 2.5;
      acc += dt;
      const sample = acc >= STEP;
      if (sample) acc = 0;
      right.set(1, 0, 0).applyQuaternion(root.quaternion).setY(0).normalize();
      for (let r = 0; r < 2; r++) {
        const R = rs[r];
        for (const s of R.S) s.age += dt;
        if (sample) {
          const s = R.S[R.head];
          s.p.copy(root.localToWorld(tmp.copy(tips[r])));
          s.side.copy(right);
          s.age = 0; s.on = emit;
          R.head = (R.head + 1) % N;
        }
        // on écrit du plus récent au plus ancien
        let visible = false;
        for (let k = 0; k < N; k++) {
          const s = R.S[(R.head - 1 - k + N * 2) % N];
          const u = Math.min(1, s.age / LIFE);
          const w = (0.12 + u * 1.6) * width;
          let a = s.on ? (1 - u) * (1 - u) * 0.55 : 0;
          if (k === 0) a = 0; // bout fondu
          if (a > 0) visible = true;
          const o = k * 6, c = k * 8;
          R.pos[o] = s.p.x - s.side.x * w; R.pos[o + 1] = s.p.y + u * 0.6; R.pos[o + 2] = s.p.z - s.side.z * w;
          R.pos[o + 3] = s.p.x + s.side.x * w; R.pos[o + 4] = s.p.y + u * 0.6; R.pos[o + 5] = s.p.z + s.side.z * w;
          const cr = tint ? tint.r : 1, cg = tint ? tint.g : 1, cb = tint ? tint.b : 1;
          R.col[c] = cr; R.col[c + 1] = cg; R.col[c + 2] = cb; R.col[c + 3] = a;
          R.col[c + 4] = cr; R.col[c + 5] = cg; R.col[c + 6] = cb; R.col[c + 7] = a;
        }
        R.mesh.visible = visible;
        R.geo.attributes.position.needsUpdate = true;
        R.geo.attributes.color.needsUpdate = true;
      }
    },
    clear() { for (const R of rs) for (const s of R.S) { s.on = false; s.age = LIFE + 1; } },
  };
}
