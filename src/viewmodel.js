// Vue à la première personne : bras gauche avec montre et post-it, poings, clé à molette, lanterne
import * as THREE from 'three';
import { prep, flatMat, colorize } from './terrain.js';

const SKIN = '#e0a982', SLEEVE = '#3d5566', CUFF = '#2c3f4b';

function box(w, h, d, col, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(prep(new THREE.BoxGeometry(w, h, d), col), flatMat);
  m.position.set(x, y, z);
  m.userData.tone = col;   // pour recolorer selon le personnage choisi
  return m;
}

function watchFaceCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  return cv;
}
// montre numérique de baroudeur : écran LCD, grosse heure, compte à rebours avant la nuit
function drawWatch(cv, hour, alarm, blink) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  const h = ((hour % 24) + 24) % 24;
  const night = h >= 19 || h < 6.5;
  g.fillStyle = night ? '#1d2440' : '#a9c79a';
  g.fillRect(0, 0, 256, 256);
  // écran LCD
  g.fillStyle = night ? '#3a4cff' : 'rgba(0,0,0,0.06)';
  if (night) { g.globalAlpha = 0.25; g.fillRect(0, 0, 256, 256); g.globalAlpha = 1; }
  const ink = night ? '#d6e0ff' : '#17240f';
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 30px ui-monospace, Menlo, Consolas, monospace';
  g.fillText(night ? 'NUIT' : h >= 17.5 ? 'SOIR' : 'JOUR', 128, 40);
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  g.font = '900 96px ui-monospace, Menlo, Consolas, monospace';
  const sep = blink ? ':' : ' ';
  g.fillText(`${String(hh).padStart(2, '0')}${sep}${String(mm).padStart(2, '0')}`, 128, 128);
  const until = night ? ((6.5 - h) + 24) % 24 : 19 - h;
  g.font = '700 26px ui-monospace, Menlo, Consolas, monospace';
  const u = `${Math.floor(until)}h${String(Math.floor((until % 1) * 60)).padStart(2, '0')}`;
  g.fillStyle = alarm && blink ? '#c81e1e' : ink;
  g.fillText(night ? `AUBE ${u}` : `NUIT ${u}`, 128, 206);
  // barre de progression vers la nuit
  if (!night) {
    const k = Math.max(0, Math.min(1, (h - 7) / 12));
    g.strokeStyle = ink; g.lineWidth = 3; g.strokeRect(28, 226, 200, 14);
    g.fillStyle = k > 0.9 ? '#c81e1e' : ink; g.fillRect(31, 229, 194 * k, 8);
  }
}

// post-it : la règle de survie, écrite à la main par Marthe
function postItCanvas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#ffb8cf'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.06)'; g.fillRect(0, 0, 256, 34);
  g.fillStyle = '#2d2a6e';
  g.textAlign = 'left';
  const hand = (sz, w = 700) => `${w} ${sz}px Caveat, "Segoe Print", "Comic Sans MS", cursive`;
  g.font = hand(44); g.save(); g.translate(16, 80); g.rotate(-0.04); g.fillText('19h : zombies', 0, 0, 226); g.restore();
  g.font = hand(28, 600);
  g.fillText('□ avion SUR L\'EAU', 18, 130, 226);
  g.fillText('□ porte qui s\'ouvre', 18, 168, 226);
  g.fillText('sinon : feu + lanterne', 18, 206, 226);
  g.strokeStyle = '#c8553d'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(20, 96); g.quadraticCurveTo(128, 104, 236, 92); g.stroke();
  g.font = hand(24, 600); g.fillStyle = '#c8553d'; g.fillText('— M.', 190, 244);
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
  const caseM = box(0.12, 0.028, 0.13, '#2b2f36', 0.405, 0.066, 0);
  fore.add(caseM);
  fore.add(box(0.013, 0.02, 0.02, '#f2a33a', 0.467, 0.066, 0.04));   // boutons latéraux
  fore.add(box(0.013, 0.02, 0.02, '#8a93a0', 0.467, 0.066, -0.04));
  const faceCv = watchFaceCanvas();
  const faceTex = new THREE.CanvasTexture(faceCv);
  faceTex.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.108), new THREE.MeshBasicMaterial({ map: faceTex, toneMapped: false }));
  face.rotation.x = -Math.PI / 2;
  face.position.set(0.405, 0.08, 0);
  fore.add(face);

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

  // ── nouvelles armes et talkie ──
  const hand = (g, x = 0, y = -0.1, z = 0.06) => { g.add(box(0.11, 0.1, 0.12, SKIN, x, y, z)); g.add(box(0.12, 0.12, 0.34, SLEEVE, x, y - 0.02, z + 0.22)); };
  const pistol = new THREE.Group(); hand(pistol);
  pistol.add(box(0.06, 0.08, 0.3, '#2b2f36', 0, 0.0, -0.12));
  pistol.add(box(0.055, 0.17, 0.08, '#3a3f48', 0, -0.08, 0.0));
  pistol.add(box(0.015, 0.025, 0.02, '#ffd166', 0, 0.05, -0.25));
  pistol.add(box(0.015, 0.025, 0.02, '#ffd166', 0, 0.05, 0.01));
  rig.add(pistol);
  // main gauche sous le garde-main (armes longues)
  const leftHand = (g, z) => { g.add(box(0.1, 0.09, 0.13, SKIN, -0.01, -0.085, z)); const sl = box(0.11, 0.11, 0.36, SLEEVE, -0.12, -0.16, z + 0.2); sl.rotation.y = -0.55; sl.rotation.x = 0.3; g.add(sl); };
  const shotgun = new THREE.Group(); hand(shotgun, 0.02, -0.1, 0.1);
  shotgun.add(box(0.045, 0.045, 0.8, '#2b2f36', 0, 0.025, -0.47));
  shotgun.add(box(0.04, 0.04, 0.6, '#3a3f48', 0, -0.02, -0.4));
  const pump = box(0.075, 0.065, 0.2, '#8a5f3a', 0, -0.03, -0.5); shotgun.add(pump);
  shotgun.add(box(0.065, 0.085, 0.2, '#3a3f48', 0, 0.0, -0.04));
  shotgun.add(box(0.06, 0.1, 0.28, '#8a5f3a', 0, -0.04, 0.2));
  shotgun.add(box(0.012, 0.02, 0.012, '#ffd166', 0, 0.055, -0.85));
  leftHand(shotgun, -0.5);
  rig.add(shotgun);
  const rifle = new THREE.Group(); hand(rifle, 0.02, -0.12, 0.12);
  rifle.add(box(0.06, 0.1, 0.5, '#3a4a3a', 0, 0.0, -0.2));
  rifle.add(box(0.03, 0.03, 0.4, '#2b2f36', 0, 0.02, -0.62));
  rifle.add(box(0.05, 0.16, 0.08, '#2b2f36', 0, -0.12, -0.12));
  rifle.add(box(0.055, 0.09, 0.26, '#3a4a3a', 0, -0.02, 0.2));
  rifle.add(box(0.045, 0.05, 0.16, '#1a1d22', 0, 0.09, -0.12));
  rifle.add(box(0.012, 0.03, 0.012, '#ffd166', 0, 0.05, -0.8));
  leftHand(rifle, -0.4);
  rig.add(rifle);
  const machete = new THREE.Group(); hand(machete, 0, 0, 0.02);
  machete.add(box(0.04, 0.05, 0.16, '#3a2a1e', 0, 0.0, -0.08));
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.09, 0.6), new THREE.MeshLambertMaterial({ color: '#c9ccd2', emissive: '#222' })); blade.position.set(0, 0.015, -0.48); machete.add(blade);
  rig.add(machete);
  const bat = new THREE.Group(); hand(bat, 0, 0, 0.02);
  const batG = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.06, 0.025, 0.8, 7).rotateX(Math.PI / 2), '#b98b5e'), flatMat); batG.position.z = -0.42; bat.add(batG);
  for (let i = 0; i < 5; i++) { const n = box(0.012, 0.09, 0.012, '#8d9299', 0, 0, -0.55 - i * 0.05); n.rotation.z = i * 1.3; bat.add(n); }
  rig.add(bat);
  const axe = new THREE.Group(); hand(axe, 0, 0, 0.02);
  axe.add(box(0.035, 0.035, 0.75, '#6d4b37', 0, 0, -0.35));
  axe.add(box(0.03, 0.2, 0.14, '#d8322a', 0, 0.06, -0.68));
  axe.add(box(0.032, 0.22, 0.03, '#c9ccd2', 0, 0.07, -0.76));
  rig.add(axe);
  const talkie = new THREE.Group(); hand(talkie, 0, -0.12, 0.04);
  talkie.add(box(0.08, 0.2, 0.05, '#2b2f36', 0, 0.02, -0.02));
  talkie.add(box(0.012, 0.14, 0.012, '#10162b', 0.025, 0.18, -0.02));
  const tScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.035), new THREE.MeshBasicMaterial({ color: '#ffb34a', toneMapped: false })); tScreen.position.set(0, 0.07, -0.046); tScreen.rotation.y = Math.PI; talkie.add(tScreen);
  const tLed = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 4), new THREE.MeshBasicMaterial({ color: '#3a1010', toneMapped: false })); tLed.position.set(-0.025, 0.11, -0.046); talkie.add(tLed);
  for (let i = 0; i < 3; i++) talkie.add(box(0.05, 0.004, 0.004, '#555', 0, -0.02 - i * 0.012, -0.046));
  rig.add(talkie);
  // fer à souder (relié au poste de l'avion par un câble) : poignée, corps, panne qui rougit
  const iron = new THREE.Group(); hand(iron, 0, -0.1, 0.06);
  iron.add(box(0.07, 0.07, 0.22, '#33373f', 0, 0, -0.06));
  iron.add(box(0.06, 0.06, 0.16, '#ffb020', 0, 0, -0.24));
  iron.add(box(0.075, 0.075, 0.03, '#1d2233', 0, 0, -0.17));
  const tipMat = new THREE.MeshBasicMaterial({ color: '#8a5a3a', toneMapped: false });
  const ironTip = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.022, 0.14), tipMat); ironTip.position.set(0, 0, -0.39); iron.add(ironTip);
  const cableV = box(0.025, 0.025, 0.3, '#1d2233', 0, -0.02, 0.2); iron.add(cableV);
  rig.add(iron);
  // objets rapides : bandage, trousse, parachute (tenus devant soi)
  const bandage = new THREE.Group(); hand(bandage, 0, -0.1, 0.06);
  const roll = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10).rotateZ(Math.PI / 2), '#f4f1ea'), flatMat); roll.position.set(0, 0.02, -0.06); bandage.add(roll);
  rig.add(bandage);
  const medkit = new THREE.Group(); hand(medkit, 0, -0.14, 0.06);
  medkit.add(box(0.26, 0.18, 0.1, '#f4f1ea', 0, 0, -0.08)); medkit.add(box(0.1, 0.03, 0.11, '#d8322a', 0, 0, -0.08)); medkit.add(box(0.03, 0.1, 0.11, '#d8322a', 0, 0, -0.08));
  rig.add(medkit);
  const chute = new THREE.Group(); hand(chute, 0, -0.14, 0.06);
  chute.add(box(0.22, 0.26, 0.12, '#ff6b5b', 0, 0, -0.08)); chute.add(box(0.23, 0.04, 0.13, '#10162b', 0, 0.06, -0.08));
  rig.add(chute);
  let reloadT = 0, reloadDur = 1, heavySwing = 1;

  let punchT = 1, punchSide = 1, swingT = 1, armK = 0, bobT = 0, faceTimer = 0, blink = false;

  return {
    scene, camera,
    // teintes du personnage choisi (peau, manche, poignet)
    setLook(look) {
      const map = { [SKIN]: look.skin || SKIN, [SLEEVE]: look.sleeve || SLEEVE, [CUFF]: look.cuff || CUFF };
      rig.traverse((o) => { if (o.isMesh && o.userData.tone && map[o.userData.tone]) colorize(o.geometry, map[o.userData.tone]); });
    },
    resize(aspect) { camera.aspect = aspect; camera.updateProjectionMatrix(); },
    attack(kind) {
      if (kind === 'flare' || kind === 'harpoon' || kind === 'pistol' || kind === 'shotgun' || kind === 'rifle') { recoil = kind === 'rifle' ? 0.6 : 1; return; }
      if (kind === 'wrench' || kind === 'machete' || kind === 'bat' || kind === 'axe') { swingT = 0; heavySwing = kind === 'axe' ? 0.7 : kind === 'machete' ? 1.3 : 1; }
      else { punchT = 0; punchSide *= -1; }
    },
    reload(kind, dur) { reloadT = dur; reloadDur = dur; },
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

      // clé à molette et armes blanches (même geste de frappe)
      swingT = Math.min(1, swingT + dt * 2.6 * heavySwing);
      wrench.visible = handsFree && s.slot === 1;
      const sw = swingT < 0.3 ? swingT / 0.3 : 1 - (swingT - 0.3) / 0.7;
      const swing = Math.sin(Math.max(0, Math.min(1, sw)) * Math.PI / 2);
      wrench.position.set(0.3 + bx - swing * 0.14, -0.27 + by + swing * 0.05, -0.6 - swing * 0.2);
      wrench.rotation.set(0.35 - swing * 1.3, 0.25, -0.25 - swing * 0.6);
      for (const [g, id] of [[machete, 8], [bat, 9], [axe, 10]]) {
        g.visible = handsFree && s.slot === id;
        if (!g.visible) continue;
        g.position.set(0.3 + bx - swing * 0.2, -0.3 + by + swing * 0.12, -0.5 - swing * 0.25);
        g.rotation.set(0.9 - swing * 2.0, 0.3 - swing * 0.5, -0.4 - swing * 0.7);
      }
      // armes à feu : recul, rechargement (arme qui plonge)
      reloadT = Math.max(0, reloadT - dt);
      const rl = reloadT > 0 ? Math.sin(Math.min(1, (reloadDur - reloadT) / reloadDur) * Math.PI) : 0;
      const rkg = Math.sin(Math.min(1, recoil) * Math.PI / 2);
      for (const [g, id, x, y, z] of [[pistol, 11, 0.24, -0.24, -0.5], [shotgun, 12, 0.2, -0.22, -0.6], [rifle, 13, 0.2, -0.21, -0.58]]) {
        g.visible = handsFree && s.slot === id;
        if (!g.visible) continue;
        const aim = s.aim ? 1 : 0;
        g.position.set(x * (1 - aim * 0.9) + bx, y + by * (1 - aim) + rkg * 0.03 - rl * 0.25, z + rkg * (id === 12 ? 0.1 : 0.05));
        g.rotation.set(rkg * (id === 12 ? 0.35 : 0.2) - rl * 0.7, 0.03 * (1 - aim), rl * 0.4);
      }
      pump.position.z = -0.5 + (recoil > 0.3 && recoil < 0.8 ? 0.1 : 0);
      // talkie : devant le visage quand on parle
      talkie.visible = handsFree && s.slot === 7;
      if (talkie.visible) {
        const up = s.talking ? 1 : 0;
        talkie.position.set(0.28 - up * 0.2 + bx, -0.3 + up * 0.18 + by, -0.55 + up * 0.18);
        talkie.rotation.set(0.25 + up * 0.35, -up * 0.5, up * 0.1);
        tLed.material.color.set(s.talking ? '#ff3030' : s.radioIn ? '#5ef2c2' : '#3a1010');
      }

      // fer à souder : la panne rougit quand on soude
      iron.visible = handsFree && s.slot === 17;
      if (iron.visible) {
        const w = s.welding ? 1 : 0;
        iron.position.set(0.26 + bx - w * 0.05, -0.28 + by + w * 0.04 + (w ? Math.sin(bobT * 30) * 0.004 : 0), -0.55 - w * 0.08);
        iron.rotation.set(0.15 + w * 0.2, 0.12, 0);
        tipMat.color.set(w ? '#ffb347' : '#8a5a3a');
      }
      for (const [g, id] of [[bandage, 14], [medkit, 15], [chute, 16]]) {
        g.visible = handsFree && s.slot === id;
        if (g.visible) { g.position.set(0.24 + bx, -0.28 + by, -0.52); g.rotation.set(0.3, 0.2, 0); }
      }
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
