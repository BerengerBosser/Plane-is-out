// Vue à la première personne : bras gauche avec montre et post-it, poings, clé à molette, lanterne
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';

const SKIN = '#e0a982', SLEEVE = '#3d5566', CUFF = '#2c3f4b';

function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z);
  return m;
}

function watchFaceCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  return cv;
}
function drawWatch(cv, hour, alarm, blink) {
  const g = cv.getContext('2d');
  const c = 128;
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = '#c9a24c'; g.beginPath(); g.arc(c, c, 126, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f6efdc'; g.beginPath(); g.arc(c, c, 110, 0, Math.PI * 2); g.fill();
  // secteur 18h30 → 19h en rouge (danger)
  const ang = (h) => ((h % 12) / 12) * Math.PI * 2 - Math.PI / 2;
  g.fillStyle = alarm && blink ? 'rgba(200,60,40,0.55)' : 'rgba(200,60,40,0.25)';
  g.beginPath(); g.moveTo(c, c); g.arc(c, c, 108, ang(18.5), ang(19)); g.closePath(); g.fill();
  g.strokeStyle = '#3a2f25';
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    g.lineWidth = big ? 6 : 2;
    const r1 = big ? 86 : 96;
    g.beginPath();
    g.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    g.lineTo(c + Math.cos(a) * 104, c + Math.sin(a) * 104);
    g.stroke();
  }
  g.fillStyle = '#3a2f25';
  g.font = 'bold 26px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  [[12, 0, -64], [3, 64, 0], [6, 0, 64], [9, -64, 0]].forEach(([n, x, y]) => g.fillText(String(n), c + x, c + y));
  const h = ((hour % 24) + 24) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  g.font = '18px monospace'; g.fillStyle = '#8a6d2a';
  g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, c, c + 34);
  const hand = (a, len, w, col) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a) * len, c + Math.sin(a) * len); g.stroke();
  };
  hand(ang(h), 58, 9, '#2c2622');
  hand((mm / 60) * Math.PI * 2 - Math.PI / 2, 84, 5, '#2c2622');
  g.fillStyle = '#c8553d'; g.beginPath(); g.arc(c, c, 8, 0, Math.PI * 2); g.fill();
}

function postItCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffe066'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 256, 40);
  g.fillStyle = '#2d2a6e';
  g.textAlign = 'center';
  g.font = '700 74px Caveat, "Segoe Print", "Comic Sans MS", cursive';
  g.save(); g.translate(128, 110); g.rotate(-0.06); g.fillText('18h30', 0, 0); g.restore();
  g.font = '600 44px Caveat, "Segoe Print", "Comic Sans MS", cursive';
  g.save(); g.translate(128, 175); g.rotate(0.03); g.fillText("c'est la merde !", 0, 0); g.restore();
  g.strokeStyle = '#c8553d'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(40, 200); g.quadraticCurveTo(128, 212, 220, 196); g.stroke();
  g.beginPath(); g.moveTo(30, 60); g.lineTo(80, 60); g.stroke();
  return cv;
}

export function createViewmodel() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  const hemi = new THREE.HemisphereLight('#ffffff', '#806850', 1.2);
  scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff4e0', 1.6);
  key.position.set(0.5, 1, 0.8);
  scene.add(key);
  const lampLight = new THREE.PointLight('#ffb35a', 0, 3, 1.5);
  scene.add(lampLight);
  // tout ce qui est tenu est posé sur un « rig » qui suit la souris avec un léger retard
  const rig = new THREE.Group();
  scene.add(rig);
  let swayX = 0, swayY = 0, breathe = 0;

  // ── bras gauche + montre + post-it ──
  const arm = new THREE.Group();
  const fore = new THREE.Group();
  arm.add(fore);
  fore.add(box(0.5, 0.13, 0.13, SLEEVE, 0.05, 0, 0));
  fore.add(box(0.06, 0.145, 0.145, CUFF, 0.3, 0, 0));
  fore.add(box(0.16, 0.1, 0.11, SKIN, 0.4, 0, 0));      // poignet
  fore.add(box(0.13, 0.09, 0.14, SKIN, 0.53, 0.0, 0));  // main
  fore.add(box(0.1, 0.05, 0.05, SKIN, 0.53, -0.03, 0.09)); // pouce
  // bracelet et boîtier
  fore.add(box(0.07, 0.112, 0.122, '#5a3b2a', 0.405, 0, 0));
  const caseM = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.058, 0.058, 0.025, 20), '#c9a24c'), flatMat);
  caseM.position.set(0.405, 0.066, 0);
  fore.add(caseM);
  const faceCv = watchFaceCanvas();
  const faceTex = new THREE.CanvasTexture(faceCv);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.052, 32), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false }));
  face.rotation.x = -Math.PI / 2;
  face.position.set(0.405, 0.08, 0);
  fore.add(face);
  const crown = box(0.02, 0.012, 0.012, '#c9a24c', 0.47, 0.066, 0);
  fore.add(crown);
  // post-it collé sur l'avant-bras
  const postTex = new THREE.CanvasTexture(postItCanvas());
  postTex.colorSpace = THREE.SRGBColorSpace;
  const post = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.15), new THREE.MeshLambertMaterial({ map: postTex, side: THREE.DoubleSide }));
  post.rotation.x = -Math.PI / 2;
  post.rotation.z = 0.12;
  post.position.set(0.17, 0.068, 0.005);
  fore.add(post);
  rig.add(arm);
  const ARM_HIDE = { p: new THREE.Vector3(-0.55, -0.7, -0.35), r: new THREE.Euler(0.3, 0.2, -0.6) };
  const ARM_SHOW = { p: new THREE.Vector3(-0.42, -0.2, -0.66), r: new THREE.Euler(1.0, 0.32, 0.2) };

  // ── poings ──
  const fist = (side) => {
    const g = new THREE.Group();
    g.add(box(0.12, 0.12, 0.42, SLEEVE, 0, 0, 0.22));
    g.add(box(0.13, 0.13, 0.05, CUFF, 0, 0, 0.02));
    g.add(box(0.11, 0.1, 0.12, SKIN, 0, 0, -0.06));
    g.add(box(0.1, 0.04, 0.03, '#d69a72', 0, 0.035, -0.12)); // phalanges
    g.add(box(0.04, 0.05, 0.08, SKIN, side * 0.06, -0.02, -0.05)); // pouce
    rig.add(g);
    return g;
  };
  const fistR = fist(-1), fistL = fist(1);
  const REST_R = new THREE.Vector3(0.32, -0.3, -0.72), REST_L = new THREE.Vector3(-0.32, -0.32, -0.74);

  // ── clé à molette ──
  const wrench = new THREE.Group();
  wrench.add(box(0.11, 0.1, 0.12, SKIN, 0, 0, 0.02));
  wrench.add(box(0.12, 0.12, 0.35, SLEEVE, 0, -0.01, 0.24));
  const handle = box(0.035, 0.035, 0.36, '#7f858c', 0, 0.02, -0.14);
  wrench.add(handle);
  const head = box(0.1, 0.04, 0.08, '#9aa1a8', 0, 0.02, -0.34);
  wrench.add(head);
  wrench.add(box(0.03, 0.04, 0.05, '#9aa1a8', 0.045, 0.02, -0.39));
  wrench.add(box(0.03, 0.04, 0.05, '#9aa1a8', -0.045, 0.02, -0.39));
  rig.add(wrench);

  // ── lanterne ──
  const lantern = new THREE.Group();
  lantern.add(box(0.1, 0.09, 0.11, SKIN, 0, 0.16, 0));
  lantern.add(box(0.11, 0.11, 0.2, SLEEVE, 0, 0.18, 0.14));
  lantern.add(box(0.02, 0.1, 0.02, '#3b3f45', 0, 0.06, 0));
  lantern.add(box(0.14, 0.02, 0.14, '#3b3f45', 0, 0.0, 0));
  lantern.add(box(0.14, 0.02, 0.14, '#3b3f45', 0, -0.2, 0));
  const glassMat = new THREE.MeshBasicMaterial({ color: '#ffcf6b', transparent: true, opacity: 0.85, toneMapped: false });
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.17, 0.11), glassMat);
  glass.position.y = -0.1;
  lantern.add(glass);
  for (const [x, z] of [[-0.06, -0.06], [0.06, -0.06], [-0.06, 0.06], [0.06, 0.06]]) lantern.add(box(0.015, 0.2, 0.015, '#3b3f45', x, -0.1, z));
  lantern.scale.setScalar(0.85);
  rig.add(lantern);

  // ── pistolet de détresse ──
  const flareGun = new THREE.Group();
  flareGun.add(box(0.11, 0.1, 0.12, SKIN, 0, -0.06, 0.05));
  flareGun.add(box(0.12, 0.12, 0.34, SLEEVE, 0, -0.08, 0.26));
  flareGun.add(box(0.07, 0.16, 0.08, '#ff6b5b', 0, -0.02, -0.02));
  const barrel = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.055, 0.06, 0.34, 10).rotateX(Math.PI / 2), '#ff6b5b'), flatMat);
  barrel.position.set(0, 0.07, -0.16);
  flareGun.add(barrel);
  flareGun.add(box(0.07, 0.03, 0.12, '#33373f', 0, 0.13, -0.05));
  const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 10).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd166', toneMapped: false }));
  muzzle.position.set(0, 0.07, -0.34);
  flareGun.add(muzzle);
  rig.add(flareGun);
  // ── fusil-harpon ──
  const harp = new THREE.Group();
  harp.add(box(0.11, 0.1, 0.12, SKIN, 0.02, -0.08, 0.12));
  harp.add(box(0.12, 0.12, 0.34, SLEEVE, 0.02, -0.1, 0.32));
  harp.add(box(0.1, 0.1, 0.7, '#b98b5e', 0, 0, -0.1));
  harp.add(box(0.07, 0.14, 0.12, '#6d4b37', 0, -0.1, 0.05));
  harp.add(box(0.05, 0.05, 0.5, '#33373f', 0, 0.06, -0.45));
  const spear = new THREE.Group();
  spear.add(box(0.025, 0.025, 0.7, '#c9ccd2', 0, 0.1, -0.5));
  const sTip = new THREE.Mesh(prep(new THREE.ConeGeometry(0.045, 0.16, 5).rotateX(-Math.PI / 2), '#ff6b5b'), flatMat);
  sTip.position.set(0, 0.1, -0.9);
  spear.add(sTip);
  harp.add(spear);
  for (const sx of [-0.08, 0.08]) harp.add(box(0.02, 0.02, 0.45, '#1a1d22', sx, 0.08, -0.3));
  rig.add(harp);

  // canne à pêche
  const rod = new THREE.Group();
  rod.add(box(0.11, 0.1, 0.12, SKIN, 0.02, -0.08, 0.12));
  rod.add(box(0.12, 0.12, 0.34, SLEEVE, 0.02, -0.1, 0.32));
  const pole = box(0.03, 0.03, 1.5, '#6d4b37', 0, 0.02, -0.7);
  rod.add(pole);
  rod.add(box(0.012, 0.012, 0.6, '#ffd166', 0, 0.02, -1.6));
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#c9ccd2' }));
  reel.position.set(0.05, -0.04, -0.05);
  rod.add(reel);
  rod.rotation.x = 0.35;
  rig.add(rod);
  let recoil = 0;

  let punchT = 1, punchSide = 1, swingT = 1, armK = 0, bobT = 0, faceTimer = 0, blink = false;

  return {
    scene, camera,
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    attack(kind) {
      if (kind === 'flare' || kind === 'harpoon') { recoil = 1; return; }
      if (kind === 'wrench') swingT = 0;
      else { punchT = 0; punchSide *= -1; }
    },
    update(dt, s) {
      // s : { slot, watchUp, carrying, moving, sprint, hour, alarm, lanternOn, light, hidden }
      bobT += dt * (s.moving ? (s.sprint ? 13 : 9) : 2);
      // retard à la souris et respiration
      swayX += ((s.mdx || 0) * -0.0009 - swayX) * Math.min(1, dt * 10);
      swayY += ((s.mdy || 0) * 0.0009 - swayY) * Math.min(1, dt * 10);
      breathe += dt;
      rig.position.set(Math.max(-0.05, Math.min(0.05, swayX)), Math.max(-0.05, Math.min(0.05, swayY)) + Math.sin(breathe * 1.6) * 0.004, 0);
      rig.rotation.set(Math.max(-0.08, Math.min(0.08, swayY)) * 0.6, Math.max(-0.08, Math.min(0.08, swayX)), 0);
      const bobA = s.moving ? 0.018 : 0.005;
      const bx = Math.cos(bobT * 0.5) * bobA, by = Math.abs(Math.sin(bobT)) * bobA;
      hemi.intensity = 0.5 + s.light * 1.0;
      key.intensity = 0.3 + s.light * 1.5;

      // bras + montre
      armK += ((s.watchUp && !s.hidden ? 1 : 0) - armK) * Math.min(1, dt * 10);
      const e = armK * armK * (3 - 2 * armK);
      arm.visible = armK > 0.01;
      arm.position.lerpVectors(ARM_HIDE.p, ARM_SHOW.p, e);
      arm.position.x += bx; arm.position.y += by;
      arm.rotation.set(
        ARM_HIDE.r.x + (ARM_SHOW.r.x - ARM_HIDE.r.x) * e,
        ARM_HIDE.r.y + (ARM_SHOW.r.y - ARM_HIDE.r.y) * e,
        ARM_HIDE.r.z + (ARM_SHOW.r.z - ARM_HIDE.r.z) * e,
      );
      if (arm.visible) {
        faceTimer -= dt;
        if (faceTimer <= 0) {
          faceTimer = 0.25;
          blink = !blink;
          drawWatch(faceCv, s.hour, s.alarm, blink);
          faceTex.needsUpdate = true;
        }
      }

      const handsFree = !s.carrying && !s.hidden;
      // poings
      punchT = Math.min(1, punchT + dt * 3.2);
      const pk = punchT < 0.35 ? punchT / 0.35 : 1 - (punchT - 0.35) / 0.65;
      const punchOut = Math.max(0, Math.sin(Math.min(1, pk) * Math.PI / 2));
      const showFists = handsFree && s.slot === 0;
      fistR.visible = showFists;
      fistL.visible = showFists && armK < 0.3 && !s.lanternOn;
      fistR.position.copy(REST_R).add(new THREE.Vector3(bx, by, 0));
      fistL.position.copy(REST_L).add(new THREE.Vector3(bx, by, 0));
      const target = punchSide > 0 ? fistR : fistL;
      if (punchT < 1) {
        target.position.z -= punchOut * 0.38;
        target.position.x += (punchSide > 0 ? -1 : 1) * punchOut * 0.12;
        target.position.y += punchOut * 0.08;
      }
      fistR.rotation.set(0.25, 0.2, -0.35);
      fistL.rotation.set(0.25, -0.2, 0.35);

      // clé à molette
      swingT = Math.min(1, swingT + dt * 2.6);
      wrench.visible = handsFree && s.slot === 1;
      const sw = swingT < 0.3 ? swingT / 0.3 : 1 - (swingT - 0.3) / 0.7;
      const swing = Math.sin(Math.max(0, Math.min(1, sw)) * Math.PI / 2);
      wrench.position.set(0.3 + bx - swing * 0.14, -0.27 + by + swing * 0.05, -0.6 - swing * 0.2);
      wrench.rotation.set(0.35 - swing * 1.3, 0.25, -0.25 - swing * 0.6);

      // lanterne (main gauche)
      // armes à distance
      recoil = Math.max(0, recoil - dt * 4);
      const rk = Math.sin(Math.min(1, recoil) * Math.PI / 2);
      flareGun.visible = handsFree && s.slot === 4;
      flareGun.position.set(0.28 + bx, -0.25 + by + rk * 0.04, -0.58 + rk * 0.1);
      flareGun.rotation.set(rk * 0.5, 0.05, 0);
      muzzle.visible = (s.ammo ?? 1) > 0;
      rod.visible = handsFree && s.slot === 6;
      rod.position.set(0.26 + bx, -0.3 + by, -0.35);
      rod.rotation.set(0.35 + (s.rodPitch || 0), 0.05, 0);
      reel.rotation.x += s.reeling ? 0.5 : 0;
      harp.visible = handsFree && s.slot === 5;
      harp.position.set(0.24 + bx, -0.27 + by + rk * 0.02, -0.5 + rk * 0.12);
      harp.rotation.set(rk * 0.15, 0.04, 0);
      spear.visible = (s.ammo ?? 1) > 0 && recoil < 0.4;
      lantern.visible = !s.hidden && s.lanternOn && armK < 0.5;
      lantern.position.set(-0.36 + bx, -0.33 + by + Math.sin(bobT * 0.5) * 0.01, -0.85);
      lantern.rotation.set(0, 0, Math.sin(bobT * 0.5) * 0.08);
      glassMat.opacity = 0.7 + Math.random() * 0.2;
      lampLight.position.copy(lantern.position).add(new THREE.Vector3(0.1, 0, 0.1));
      lampLight.intensity = lantern.visible ? 1.2 : 0;
    },
    render(renderer) {
      const ac = renderer.autoClear;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.autoClear = ac;
    },
  };
}
