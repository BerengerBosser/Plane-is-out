// Coéquipiers : personnage low poly animé (marche, assis, à terre, porte), étiquette de nom, bulle de discussion
import * as THREE from 'three';
import { prep, flatMat } from './terrain.js';

const SKIN = ['#e0a982', '#c98b62', '#8d5a3c', '#f1c7a4'];

function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function label(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.6, 0.4, 1);
  sp.renderOrder = 50;
  const draw = (t, hp = 1, bubble = '') => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 64);
    g.font = 'bold 26px "Bricolage Grotesque", "Trebuchet MS", sans-serif';
    const w = Math.min(240, g.measureText(t).width + 28);
    g.fillStyle = '#10162b';
    g.beginPath(); g.roundRect((256 - w) / 2, 4, w, 36, 18); g.fill();
    g.fillStyle = color;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 128, 23);
    g.fillStyle = '#26305a'; g.fillRect(78, 46, 100, 8);
    g.fillStyle = hp > 0.3 ? '#5ef2c2' : '#ff6b5b'; g.fillRect(78, 46, 100 * Math.max(0, hp), 8);
    tex.needsUpdate = true;
    void bubble;
  };
  draw(text);
  return { sprite: sp, draw };
}

function bubbleSprite() {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(3.2, 0.8, 1);
  sp.renderOrder = 51;
  sp.visible = false;
  const draw = (text) => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 512, 128);
    g.font = 'bold 30px "Bricolage Grotesque", "Trebuchet MS", sans-serif';
    let t = text;
    while (g.measureText(t).width > 470 && t.length > 4) t = `${t.slice(0, -2)}…`;
    const w = g.measureText(t).width + 40;
    g.fillStyle = '#fff4e0';
    g.beginPath(); g.roundRect((512 - w) / 2, 10, w, 70, 22); g.fill();
    g.beginPath(); g.moveTo(236, 78); g.lineTo(256, 108); g.lineTo(276, 78); g.fill();
    g.fillStyle = '#10162b'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t, 256, 46);
    tex.needsUpdate = true;
  };
  return { sprite: sp, draw };
}

export function buildAvatar(name, color, idx = 0) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = SKIN[idx % SKIN.length];
  const hips = new THREE.Group();
  hips.position.y = 0.9;
  body.add(hips);
  const legs = [];
  for (const sx of [-0.12, 0.12]) {
    const leg = new THREE.Group();
    leg.position.set(sx, 0, 0);
    leg.add(box(0.16, 0.85, 0.18, '#33373f', 0, -0.42, 0));
    leg.add(box(0.18, 0.12, 0.28, '#6d4b37', 0, -0.86, -0.04));
    hips.add(leg);
    legs.push(leg);
  }
  const torso = new THREE.Group();
  torso.position.y = 0.05;
  hips.add(torso);
  torso.add(box(0.46, 0.62, 0.28, color, 0, 0.32, 0));        // blouson
  torso.add(box(0.48, 0.08, 0.3, '#10162b', 0, 0.02, 0));     // ceinture
  torso.add(box(0.36, 0.44, 0.16, '#8a6a4a', 0, 0.34, 0.2));  // sac à dos
  torso.add(box(0.06, 0.4, 0.02, '#fff4e0', -0.12, 0.34, -0.15)); // bande réfléchissante
  const head = new THREE.Group();
  head.position.y = 0.72;
  torso.add(head);
  head.add(box(0.26, 0.28, 0.26, skin, 0, 0.14, 0));
  head.add(box(0.3, 0.1, 0.3, color, 0, 0.3, 0.01));           // casquette
  head.add(box(0.3, 0.04, 0.18, color, 0, 0.26, -0.2));        // visière
  head.add(box(0.2, 0.06, 0.02, '#10162b', 0, 0.17, -0.135));  // lunettes
  const arms = [];
  for (const sx of [-0.3, 0.3]) {
    const arm = new THREE.Group();
    arm.position.set(sx, 0.58, 0);
    arm.add(box(0.13, 0.55, 0.14, color, 0, -0.26, 0));
    arm.add(box(0.11, 0.12, 0.12, skin, 0, -0.58, 0));
    torso.add(arm);
    arms.push(arm);
  }
  const tag = label(name, color);
  tag.sprite.position.y = 2.25;
  root.add(tag.sprite);
  const bub = bubbleSprite();
  bub.sprite.position.y = 2.75;
  root.add(bub.sprite);
  let walk = 0, bubbleT = 0;

  return {
    root,
    setName(n, c) { tag.draw(n); void c; },
    // étiquettes plus discrètes de près (cabine)
    near(d) {
      const k = Math.max(0.3, Math.min(1, d / 12));
      tag.sprite.scale.set(1.6 * k, 0.4 * k, 1);
      bub.sprite.scale.set(3.2 * Math.max(0.45, k), 0.8 * Math.max(0.45, k), 1);
      tag.sprite.position.y = 2.25 - (1 - k) * 0.25;
    },
    say(text) { bub.draw(text); bub.sprite.visible = true; bubbleT = 5; },
    hp(v, n) { tag.draw(n, v); },
    // s : { moving, sprint, seat, lying, down, carry, slot }
    animate(dt, s) {
      walk += dt * (s.moving ? (s.sprint ? 11 : 7.5) : 0);
      const a = s.moving ? Math.sin(walk) * 0.7 : 0;
      legs[0].rotation.x = a; legs[1].rotation.x = -a;
      arms[0].rotation.x = -a * 0.8; arms[1].rotation.x = a * 0.8;
      body.rotation.set(0, 0, 0);
      body.position.set(0, s.moving ? Math.abs(Math.sin(walk)) * 0.04 : 0, 0);
      if (s.carry) { arms[0].rotation.x = -1.2; arms[1].rotation.x = -1.2; }
      if (s.slot === 3) arms[0].rotation.x = -0.9;
      if (s.slot >= 4) { arms[1].rotation.x = -1.5; arms[0].rotation.x = -1.3; }
      if (s.attack > 0) arms[1].rotation.x = -1.8;
      if (s.seat) {
        legs[0].rotation.x = legs[1].rotation.x = -1.45;
        body.position.y = -0.42;
        arms[0].rotation.x = arms[1].rotation.x = -0.5;
      }
      if (s.lying || s.down) {
        body.rotation.x = -Math.PI / 2;
        body.position.set(0, 0.25, 0.85);
        legs[0].rotation.x = legs[1].rotation.x = 0;
        if (s.down) { arms[0].rotation.x = -2.6; arms[1].rotation.x = -0.4; }
      }
      if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) bub.sprite.visible = false; }
    },
  };
}
