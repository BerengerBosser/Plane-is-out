// PLANE IS OUT — v4 : îles 1 et 2, avion habitable, multijoueur coopératif, armes et boss
import * as THREE from 'three';
import { CFG } from './config.js';
import { buildIsland, heightAt, slopeAt, LAYOUT, prep, flatMat, autoColliders } from './terrain.js';
import { createSky, brumeFactor } from './sky.js';
import { NightMixin } from './night.js';
import { createWeather, WeatherMixin, WX_ICON, WX_LABEL } from './weather.js';
import { CamClipMixin } from './camclip.js';
import { WreckMixin } from './wreck.js';
import { FishingMixin } from './fishing.js';
import { SavesMixin } from './saves.js';
import { buildPlane, SLOTS, PLANE_POINTS, CABIN, FLOOR, cabinColliders, buildDiable } from './planeModel.js';
import { createAudio } from './audio.js';
import { createUI } from './ui.js';
import { Input, Player } from './player.js';
import { Flight } from './flight.js';
import { createWater } from './water.js';
import { buildDecor } from './decor.js';
import { createViewmodel } from './viewmodel.js';
import { createTrails } from './trail.js';
import { PhysPuzzleMixin } from './puzzles3d.js';
import { VehicleMixin, buildCharger } from './vehicles.js';
import { Chapter3Mixin } from './chapter3.js';
import { Chapter4Mixin } from './chapter4.js';
import { FLOOR_B } from './boeing.js';
import { ArmsMixin } from './arms.js';
import { EQUIP } from './arsenal.js';
import { createInvUi } from './invui.js';
import { InventoryMixin, newInventory, migrateInventory } from './inventory.js';
import { GEAR, gridAdd } from './gear.js';
import { I3, FLAT3 } from './island3.js';
import { P2 } from './puzzles3d.js';
import { buildShopFlag, waveFlag } from './props.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createEnemies } from './enemies.js';
import { createIsland2, I2, FLAT } from './island2.js';
import { createFun, buildDuck, duckSpots1 } from './fun.js';
import { drawRadar } from './radar.js';
import { createMap } from './map.js';
import { clamp, lerp } from './noise.js';
import { STAIRS, WHEEL_DROP, PLANE_TOPS } from './planeModel.js';
import { ITEMS, PART_ORDER, WRECK_ROT, SAVE_KEY, SETTINGS_KEY, FUSE_SLOTS, store, unstore } from './defs.js';
import { WorldMixin } from './world.js';
import { InteractMixin } from './interact.js';
import { MPMixin } from './mp.js';
import { LootMixin } from './loot.js';
import { PlanePushMixin } from './planepush.js';
import { AdminMixin } from './admin.js';
import { CombatMixin } from './combat.js';

// ── Fumées (repères visuels) ────────────────────────────────
class Smoke {
  constructor(scene) { this.scene = scene; this.emitters = new Map(); this.geo = new THREE.IcosahedronGeometry(0.6, 0); this.mats = {}; }
  mat(color) {
    if (!this.mats[color]) this.mats[color] = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.45, transparent: true, opacity: 0.6, depthWrite: false, flatShading: true });
    return this.mats[color];
  }
  add(id, getPos, color = '#e2ddd2', rate = 3, rise = 2.2) {
    this.remove(id);
    const puffs = [];
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(this.geo, this.mat(color)); m.visible = false; this.scene.add(m); puffs.push({ m, life: -1, vx: 0, vz: 0 }); }
    this.emitters.set(id, { getPos, puffs, rate, rise, acc: Math.random() });
  }
  remove(id) { const e = this.emitters.get(id); if (!e) return; e.puffs.forEach((p) => this.scene.remove(p.m)); this.emitters.delete(id); }
  clear() { [...this.emitters.keys()].forEach((k) => this.remove(k)); }
  update(dt) {
    for (const e of this.emitters.values()) {
      e.acc += dt * e.rate;
      while (e.acc >= 1) {
        e.acc -= 1;
        const p = e.puffs.find((q) => q.life < 0);
        if (p) { const o = e.getPos(); p.m.position.set(o.x + (Math.random() - 0.5) * 0.6, o.y, o.z + (Math.random() - 0.5) * 0.6); p.life = 0; p.vx = (Math.random() - 0.5) * 0.6; p.vz = (Math.random() - 0.5) * 0.6 + 0.4; p.m.visible = true; }
      }
      for (const p of e.puffs) {
        if (p.life < 0) continue;
        p.life += dt / 4.2;
        if (p.life >= 1) { p.life = -1; p.m.visible = false; continue; }
        p.m.position.y += e.rise * dt; p.m.position.x += p.vx * dt; p.m.position.z += p.vz * dt;
        p.m.scale.setScalar(Math.max(0.05, p.life < 0.8 ? 0.5 + p.life * 2.2 : (1 - p.life) * 11.3));
        p.m.rotation.y += dt;
      }
    }
  }
}

function buildWrenchWorld() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.06, 0.04, 0.5), '#7f858c'), flatMat));
  const hd = new THREE.Mesh(prep(new THREE.BoxGeometry(0.16, 0.05, 0.12), '#9aa1a8'), flatMat);
  hd.position.z = -0.28;
  g.add(hd);
  return g;
}
function buildLanternWorld() {
  const g = new THREE.Group();
  const frame = prep(new THREE.BoxGeometry(0.22, 0.03, 0.22), '#3b3f45');
  const a = new THREE.Mesh(frame, flatMat); a.position.y = 0.02; g.add(a);
  const b = new THREE.Mesh(frame, flatMat); b.position.y = 0.34; g.add(b);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.3, 0.17), new THREE.MeshBasicMaterial({ color: '#f1d9a0' }));
  glass.position.y = 0.18; g.add(glass);
  return g;
}
function buildFuse(color) {
  const g = new THREE.Group();
  const c = { red: '#ff4d4d', blue: '#3d7bff', yellow: '#ffd166' }[color];
  g.add(new THREE.Mesh(prep(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 8), c), flatMat));
  for (const y of [-0.16, 0.16]) { const cap = new THREE.Mesh(prep(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 8), '#c9ccd2'), flatMat); cap.position.y = y; g.add(cap); }
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, toneMapped: false })));
  g.rotation.z = Math.PI / 2;
  return g;
}
function buildJerrycan() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.35, 0.5, 0.2), '#d23c3c'), flatMat).translateY(0.25));
  g.add(new THREE.Mesh(prep(new THREE.BoxGeometry(0.2, 0.06, 0.06), '#33373f'), flatMat).translateY(0.54));
  return g;
}

export class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    this.renderer.shadowMap.autoUpdate = false;
    this.brightness = 1; this.viewDist = 1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 4500);
    this.vm = createViewmodel();
    this.trails = createTrails(this.scene);
    this.trailsB = createTrails(this.scene, [new THREE.Vector3(-26, 5.0, 33), new THREE.Vector3(26, 5.0, 33)], 2.2);
    // post-traitement : halos lumineux (lampes, fusées, yeux des zombies, soleil couchant)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.4, 0.4, 0.94);
    // les normales plates des triangles minuscules (très loin) peuvent donner des NaN : on les neutralise avant le flou,
    // sinon un seul pixel NaN noircit tout l'écran à travers le halo
    this.bloom.materialHighPassFilter.fragmentShader = this.bloom.materialHighPassFilter.fragmentShader.replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv ); if ( any( isnan( texel ) ) || any( isinf( texel ) ) ) texel = vec4( 0.0 );');
    this.bloom.materialHighPassFilter.needsUpdate = true;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.bloomOn = true;
    this.resScale = 1;
    this.onResize();
    addEventListener('resize', () => this.onResize());

    this.audio = createAudio();
    this.ui = createUI();
    this.input = new Input(this.canvas);
    this.island = buildIsland(this.scene);
    this.colliders = this.island.colliders;
    this.decor = buildDecor(this.scene, this.island);
    this.sky = createSky(this.scene);
    this.weather = createWeather(this.scene, this.audio);
    this.wxLeft = 3;
    this.water = createWater(this.scene);
    this.fun = createFun(this.scene);
    this.colliders.push({ type: 'circle', x: this.fun.survival.pos.x, z: this.fun.survival.pos.z, r: 0.5 });
    // île 1 : une boîte de collision pour chaque objet du décor qui gêne le passage
    this.island.cabin.doorPivot.userData.noCollide = true;
    this.platforms = [...(this.decor.platforms || [])];
    autoColliders(this.scene, this.colliders, { ground: (x, z) => Math.max(this.groundAt(x, z, 99), -1.3) });
    this.plane = buildPlane();
    this.scene.add(this.plane.root);
    this.flight = new Flight(this.plane, this.camera);
    this.flight.hitTest = (p, y) => this.planeHitTest(p, y);
    this.flight.camClip = (tgt, pos, dt) => this.camClip('plane', tgt, pos, dt, { cols: this.colliders.concat(this.blockCols || [], this.vehicleCols || []) });
    this.player = new Player(this.camera);
    this.smoke = new Smoke(this.scene);
    this.map = createMap();
    this.enemies = createEnemies(this.scene, this.colliders, {
      onPlayerHit: (dmg, e, pid, dir) => this.onEnemyHitPlayer(dmg, e, pid, dir),
      onKill: (e) => this.onKill(e),
      onSpawn: () => { this.fx('voiles'); },
      onBossWake: (e) => this.fx('bossWake', { type: e.type }),
      onBossHalf: (e) => this.fx('bossHalf', { type: e.type }),
      onBossDeath: (e) => this.onBossDeath(e),
      onBossTele: (e) => this.fx('bossTele', { type: e.type }),
      onBossStun: () => this.fx('bossStun'),
      onBossSummon: () => this.fx('summon'),
      onSlam: () => this.fx('slam'),
      onSiegeHit: (d) => this.onSiegeHit(d),
      onDeathFx: (e) => { if (this.gore) { this.gore.pool(e.pos, !!e.T.goo); if (e.pos.distanceTo(this.camera.position) < 40) this.audio.splat(); } },
      onBloat: (e) => this.fx('bloat', { p: [e.pos.x, e.pos.y, e.pos.z].map((v) => +v.toFixed(1)) }),
      onScream: (e) => { this.fx('scream', { p: [e.pos.x, e.pos.z].map((v) => +v.toFixed(1)) }); this.enemies.noise(e.pos, 45); this.enemies.spawnAround('voile', e.pos.x, e.pos.z, 2, 5, 9); },
      onWake: (e) => { if (e.pos.distanceTo(this.camera.position) < 30) this.audio.groan(); },
    });

    this.cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#222' }));
    this.cable.visible = false;
    this.scene.add(this.cable);
    this.hose = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#10162b' }));
    this.hose.visible = false;
    this.scene.add(this.hose);

    this.tools = {
      diable: { mesh: buildDiable(), at: LAYOUT.diable, rot: new THREE.Euler(1.32, 0.7, 0, 'YXZ') },   // couché sur le dos, roues au sol
      wrench: { mesh: buildWrenchWorld(), at: LAYOUT.wrench, rot: new THREE.Euler(0, 0.9, 0) },
      lantern: { mesh: buildLanternWorld(), at: LAYOUT.lantern, rot: new THREE.Euler(0, 0.3, 0) },
    };
    for (const t of Object.values(this.tools)) { t.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; }); t.mesh.visible = false; this.scene.add(t.mesh); }
    this.carryDiable = buildDiable();
    this.carryDiable.visible = false;
    this.scene.add(this.carryDiable);
    this.lanternLight = new THREE.PointLight('#ffb35a', 0, 14, 1.6);
    this.scene.add(this.lanternLight);
    this.jerrycan = buildJerrycan();
    this.jerrycan.position.set(1.0, FLOOR, 3.0);
    this.plane.body.add(this.jerrycan);
    this.duckMeshes = {};
    this.duckSpots = duckSpots1();

    this.createItems();
    this.combatInit();
    this.armsInit();
    this.invInit();
    this.invUi = createInvUi(this.invAdapter());
    document.getElementById('invClose').addEventListener('click', () => this.toggleInventory(false));
    this.vehiclesInit();
    this.wreckInit();
    this.fishingInit();
    this.mpInit();
    this.initCharPicker();
    this.savesInit();
    this.adminInit();
    this.resetState();
    this.bindUI();
    this.loadSettings();

    this.mode = 'menu';
    this.hour = 17.3;
    this.t = 0;
    this.last = performance.now();
    this.planeLift = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.buildIsland2(Math.floor(Math.random() * 1e9));
    this.refreshMenu();
    requestAnimationFrame((t) => this.loop(t));
    window.__game = this; // accès pour le débogage
  }

  // résolution dynamique : baisse la définition si les images par seconde chutent, la remonte ensuite
  autoResolution(rawDt) {
    if (!this.dynRes || !this.inGame()) return;
    this._arAcc = (this._arAcc || 0) + rawDt; this._arN = (this._arN || 0) + 1;
    if (this._arAcc < 2.5) return;
    const fps = this._arN / this._arAcc; this._arAcc = 0; this._arN = 0;
    const target = this.userRes || 1;
    let s = this.resScale;
    if (fps < 36 && s > 0.55) s = Math.max(0.55, s - 0.1);
    else if (fps > 57 && s < target) s = Math.min(target, s + 0.05);
    if (s !== this.resScale) { this.resScale = s; this.onResize(); }
  }

  onResize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75) * this.resScale);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); this.bloom.resolution.set(w / 2, h / 2); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.resize(w / h);
  }

  // ── Île 2 (reconstruite à chaque nouvelle partie) ────────
  buildIsland2(seed) {
    if (this.island2) {
      this.island2.dispose();
      this.island2.colliders.forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); });
      Object.values(this.fuseMeshes || {}).forEach((m) => this.scene.remove(m));
    }
    this.seed = seed;
    this.island2 = createIsland2(this.scene, seed);
    this.buildPhysPuzzles();
    this.colliders.push(...this.island2.colliders);
    this.platforms = [...(this.decor.platforms || []), ...this.island2.platforms];
    const P = this.island2.points;
    this.fuseMeshes = { red: buildFuse('red'), blue: buildFuse('blue'), yellow: buildFuse('yellow') };
    this.fuseSpots = { red: P.fuseRed, blue: P.fuseBlue, yellow: P.fuseYellow };
    for (const [k, m] of Object.entries(this.fuseMeshes)) { m.position.copy(this.fuseSpots[k]); this.scene.add(m); }
    const cx = this.island2.cx, cz = this.island2.cz, T = I2.terminal, To = I2.tower;
    this.duckSpots = duckSpots1().concat([
      { id: 'd6', x: cx + T.x + 12, z: cz + T.z + 3, y: FLAT + 0.95, hint: 'sur le tapis à bagages' },
      { id: 'd7', x: cx + To.x + 3, z: cz + To.z + 2.5, y: FLAT + To.h, hint: 'dans la tour de contrôle' },
      { id: 'd8', x: cx + I2.airliner.x - 9, z: cz + I2.airliner.z + 6, y: heightAt(cx + I2.airliner.x - 9, cz + I2.airliner.z + 6) + 1.6, hint: 'sur l\'aile de l\'épave' },
    ]);
    Object.values(this.duckMeshes).forEach((m) => this.scene.remove(m));
    this.duckMeshes = {};
    for (const d of this.duckSpots) { const m = buildDuck(); m.visible = false; this.scene.add(m); this.duckMeshes[d.id] = m; }
    this.mapBuilt = false;
    this.placeStaticScrap();
    // kart à bagages électrique et sa borne (derrière le terminal)
    if (this.kartCharger) this.island2.group.remove(this.kartCharger);
    const ch = this.kartCharger = buildCharger();
    ch.position.set(3.2, FLAT, 46.5); ch.rotation.y = Math.PI / 2;
    this.island2.group.add(ch);
    this.colliders.push({ type: 'box', minX: cx + 2.8, maxX: cx + 3.6, minZ: cz + 46.1, maxZ: cz + 46.9 });
    const kart = this.addVehicle('kart2', 'kart', cx + 0.2, cz + 46.5, Math.PI / 2);
    kart.charger = new THREE.Vector3(cx + 3.2, FLAT, cz + 46.5); kart.chargerMesh = ch;
    // île 3 (position liée à celle de l'île 2)
    this.buildIsland3();
    // intérieurs (acoustique de la voix) : halls et petites pièces
    {
      const A = (ix, x, z, w, d, maxY, kind, minY) => ({ minX: ix.cx + x - w / 2, maxX: ix.cx + x + w / 2, minZ: ix.cz + z - d / 2, maxZ: ix.cz + z + d / 2, maxY, minY, kind });
      const I2i = this.island2, I3i = this.island3, T2 = I2.terminal, H2 = I2.hangar, T3 = I3.terminal, D3 = I3.depot, F3 = I3.fire, To2 = I2.tower, To3 = I3.tower;
      this.interiors = [
        A(I2i, T2.x, T2.z, T2.w, T2.d, FLAT + T2.h, 'hall'), A(I2i, H2.x, H2.z, H2.w, H2.d, FLAT + 9, 'hall'), A(I2i, P2.room.x, P2.room.z, P2.room.w, P2.room.d, FLAT + P2.room.h, 'room'),
        A(I2i, To2.x, To2.z, 9, 9, FLAT + To2.h + 3.2, 'room', FLAT + To2.h - 0.5),
        A(I3i, T3.x, T3.z, T3.w, T3.d, FLAT3 + T3.h, 'hall'), A(I3i, D3.x, D3.z, D3.w, D3.d, FLAT3 + 8, 'hall'), A(I3i, F3.x, F3.z, F3.w, F3.d, FLAT3 + 7, 'hall'),
        A(I3i, To3.x, To3.z, 9, 9, FLAT3 + To3.h + 3.2, 'room', FLAT3 + To3.h - 0.5),
        ...this.island4Interiors(),
      ];
    }
    this.buildLoot();
    // drapeaux des boutiques, visibles de loin
    (this.shopFlags || []).forEach((f) => this.scene.remove(f));
    (this.shopFlagCols || []).forEach((c) => { const i = this.colliders.indexOf(c); if (i >= 0) this.colliders.splice(i, 1); });
    this.shopFlagCols = [];
    this.shopFlags = this.shopSpots().map((s, i) => {
      const f = buildShopFlag(['#ffd166', '#ff6b5b', '#5ef2c2'][i % 3]);
      const x = s.x + 2.2, z = s.z - 1.6;
      f.position.set(x, this.groundAt(x, z, 99), z);
      this.scene.add(f);
      const col = { type: 'circle', x, z, r: 0.2 }; this.colliders.push(col); this.shopFlagCols.push(col);
      return f;
    });
  }

  // ── État de la partie ────────────────────────────────────
  resetState() {
    this.installed = new Set();
    this.crateLoaded = false;
    // inventaire personnel (tenue de base, deux bandages) et conteneurs partagés (coffre du Coucou, butin, sol)
    this.inv = newInventory();
    this.invWorldReset();
    this.chute = false;
    if (this.gore) { this.resetArms(); this.gore.clear(); }
    this.lootTaken = {};
    this.hoist = null;
    this._kt = null;
    this.toolsTaken = new Set();
    this.slot = 0;
    this.carrying = null;
    this.carryMode = 'hand';
    this.notes = [];
    this.flags = {
      doorOpen: false, tookOff: false, alarm: false, h16: false, h18: false, discovered: false, landed2: false, ended: false,
      reserveUsed: false, compass: false, bottle: false, treasure: false, radioDone: false, hangarOpen: false, refueled: false,
      wheels: false, power: false, chest: false, kingDead: false, wardenDead: false, storm: false, stormOver: false, hangarCode: false, doorJam: false, jamStorm: false, wrecked: false,
      tookOff2: false, fire3: false, landed3: false, fireOut: false, baysOpen: false, boeingBattery: false, boeingFuel: false, boeingCrate: false, boeingOut: false, boeingGo: false,
      bAir: false, landed4: false, slide: false, crateOut: false, bridge4: false, gate4: false, crateAtLab: false, decon4: false, labCrate: false, synthA: false, synthB: false, synthC: false, cured: false,
    };
    this.bseat = null;
    this.said = new Set();
    this.tox = 0;
    this.hp = CFG.player.health;
    this.stamina = CFG.player.stamina;
    this.exhausted = false;
    this.lastHurt = -99;
    this.oil = 100;
    this.fast = false;
    this.holdT = 0;
    this.attackCd = 0;
    this.flying = [];
    this.doorAnim = 1;
    this.lastProgress = 0;
    this.saveT = 0;
    this.stepPhase = 0;
    this.aboard = false;
    this.seat = null;
    this.lying = false;
    this.downed = false;
    this.downT = 0;
    this.planeLive = false;
    this.fuses = new Set();          // fusibles trouvés (équipe)
    this.fuseSlots = FUSE_SLOTS.map((s) => ({ ...s, fuse: null }));
    this.valves = { A: false, B: false, C: false, D: false };
    this.ducks = new Set();
    this.symbols = new Set();
    this.music = false;
    this.stats = { crabs: 0, voiles: 0, days: 1, t0: performance.now() };
    this.planeDoor = 0;
    this.refillT = {};
    this.siege = { active: false, genHp: 100, wave: 0 };
    this.pilotId = null;
    this.planeOwner = null;
    this.nozzle = null;
    this.scrap = 0;
    this.upgrades = new Set();
    this.puzzles = {};
    this.mySeq = 0;
    this.gotWorld = false;
    this.sodaT = -99;
    this.flight.tankMax = 100;
    this.flight.powerMul = 1;
    this.flight.fuel = CFG.flight.startFuel;
    this.flight.wheels = false;
    this.flight.autopilot = false;
    this.flight.noTakeoff = false;
  }

  resetWorld() {
    this.resetState();
    this.smoke.clear();
    this.enemies.clearAll();
    this.projectiles.clear();
    for (const q of this.scrapPiles.slice()) { if (q.dyn) { this.scene.remove(q.mesh); this.scrapPiles.splice(this.scrapPiles.indexOf(q), 1); } else { q.taken = false; q.mesh.visible = true; } }
    this.pings.forEach((q) => this.scene.remove(q.g)); this.pings = [];
    if (this.hoseMesh) this.hoseMesh.visible = false;
    for (const it of Object.values(this.items)) { it.state = 'hidden'; it.carrier = null; it.mesh.visible = false; }
    for (const k of PART_ORDER) this.plane.parts[k].visible = true;
    this.plane.parts.wheels.visible = false;
    this.plane.crateAboard.visible = false;
    this.jerrycan.visible = true;
    for (const t of Object.values(this.tools)) t.mesh.visible = false;
    const cab = this.island.cabin;
    cab.doorPivot.rotation.y = 0;
    cab.doorCollider.disabled = false;
    this.cable.visible = false;
    this.hose.visible = false;
    this.carryDiable.visible = false;
    const F = this.fun;
    F.treasure.chest.visible = false;
    F.treasure.mark.visible = true;
    F.bottle.group.visible = true;
    F.survival.lid.rotation.x = 0;
    F.harpoonRack.group.visible = false;
    this.audio.setMusic(false);
    this.ui.compass(false);
    this.ui.boss(null);
    this.ui.gen(null);
    this.ui.downed(false);
    this.resetWreck();
    this.resetFishing();
    this.resetVehicles();
    if (this.island3) { this.c3 = this.defaultC3(); this.poseBoeing(); this.island3.resetBays?.(); this.cinematic = false; this.c3Smokes(); }
    this.resetC4?.();
    this.crateSafe = null; this.synthTries = 0;
    if (this.island2) { this.island2.setPower(false); FUSE_SLOTS.forEach((_, i) => this.island2.setFuse(i, null)); ['A', 'B', 'C', 'D'].forEach((k) => this.island2.setValve(k, false)); }
  }

  createItems() {
    this.items = {};
    for (const [id, def] of Object.entries(ITEMS)) {
      const mesh = def.build();
      mesh.rotation.set(def.tilt || 0, 0, 0);
      mesh.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(mesh);
      mesh.visible = false;
      mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      this.scene.add(mesh);
      this.items[id] = { id, def, mesh, rest: -box.min.y, pos: new THREE.Vector3(), rotY: 0, state: 'hidden', carrier: null, vel: new THREE.Vector2() };
    }
  }

  placeItem(it, x, z, rotY = it.rotY) {
    it.pos.set(x, this.groundAt(x, z, 99, it), z);
    it.rotY = rotY;
    it.state = 'ground';
    it.carrier = null;
    it.mesh.visible = true;
    this.poseGround(it);
  }
  poseGround(it) {
    it.mesh.position.set(it.pos.x, this.groundAt(it.pos.x, it.pos.z, it.pos.y + 1, it) + it.rest - 0.05, it.pos.z);
    it.mesh.rotation.set(it.def.tilt || 0, it.rotY, 0, 'YXZ');
  }

  placeTools() {
    for (const [k, t] of Object.entries(this.tools)) {
      t.mesh.visible = !this.lootTaken?.[`tool:${k}`];   // chaque joueur prend son exemplaire
      t.mesh.position.set(t.at.x, heightAt(t.at.x, t.at.z) + (k === 'wrench' ? 0.03 : k === 'diable' ? 0.2 : 0), t.at.z);
      t.mesh.rotation.copy(t.rot);
    }
    for (const d of this.duckSpots) {
      const m = this.duckMeshes[d.id];
      m.visible = !this.ducks.has(d.id);
      const y = d.y ?? (d.float ? 0.05 : heightAt(d.x, d.z) + (d.dy || 0));
      m.position.set(d.x, y + 0.12, d.z);
      m.userData.float = !!d.float;
    }
    for (const [k, m] of Object.entries(this.fuseMeshes)) m.visible = !this.fuses.has(k);
    this.jerrycan.visible = !this.flags.reserveUsed;
  }

  scatterAll() {
    const P = LAYOUT.parts;
    const r = (k) => (k.charCodeAt(0) * 1.7) % 6.28;
    for (const k of PART_ORDER) {
      if (this.installed.has(k)) continue;
      this.plane.parts[k].visible = false;
      this.placeItem(this.items[k], P[k].x, P[k].z, r(k));
    }
    if (!this.crateLoaded) this.placeItem(this.items.crate, LAYOUT.crate.x, LAYOUT.crate.z, 0.4);
    const W = this.island2.points.wheels;
    if (!this.flags.wheels) this.placeItem(this.items.wheels, W.x, W.z, 0);
    this.ensurePuzzleItems(2);
    this.ensureC3Items();
    this.placeTools();
    this.setWreck();
    // le crash d'ouverture a aussi cabossé la carcasse
    if (this.chapter() === 1 && !this.wreck.dents.length && this.installed.size < 6) { this.wreck.dents = [0, 4, 7, 11]; this.refreshDamage(); this.refreshWelds(); }
    this.startSmokes();
  }

  setWreck() {
    const c = LAYOUT.crash;
    this.plane.root.position.set(c.x, -0.85, c.z);
    this.plane.root.rotation.copy(WRECK_ROT);
    this.planeLift = 0;
  }

  startSmokes() {
    for (const k of PART_ORDER) {
      const it = this.items[k];
      if (it.state === 'ground') this.smoke.add(k, () => new THREE.Vector3(it.mesh.position.x, it.mesh.position.y + 0.6, it.mesh.position.z), '#e2ddd2', 2.2, 2.6);
    }
    if (this.installed.size < 6) this.smoke.add('wreck', () => this.plane.root.localToWorld(new THREE.Vector3(0, 3.6, 1)), '#3d3a3a', 2.5, 2.2);
  }

  // ── Sol, plateformes, nage ──────────────────────────────
  // plateformes : boîtes alignées, ou orientées (obb : repère local tourné de p.r autour de y)
  onPlatform(p, x, z, pad = 0) {
    if (p.obb) {
      const dx = x - p.x, dz = z - p.z, c = Math.cos(p.r), s = Math.sin(p.r);
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      return lx > p.minX - pad && lx < p.maxX + pad && lz > p.minZ - pad && lz < p.maxZ + pad;
    }
    return x > p.minX - pad && x < p.maxX + pad && z > p.minZ - pad && z < p.maxZ + pad;
  }
  onAnyPlatform(x, z) { return (this.platforms || []).some((p) => this.onPlatform(p, x, z)); }
  groundAt(x, z, y, skip = null) {
    let h = heightAt(x, z);
    for (const p of this.platforms || []) {
      if (y >= p.top - 0.8 && this.onPlatform(p, x, z)) h = Math.max(h, p.top);
    }
    // blocs posés (caisses, sacs…) : on peut monter dessus
    for (const p of this.blockPlats || []) {
      if (p.item !== skip && y >= p.top - 0.8 && x > p.minX && x < p.maxX && z > p.minZ && z < p.maxZ) h = Math.max(h, p.top);
    }
    // marches des véhicules (camion-escalier)
    for (const p of this.vehiclePlats || []) {
      if ((!skip || p.veh !== skip.id) && y >= p.top - 0.8 && this.onPlatform(p, x, z)) h = Math.max(h, p.top);
    }
    // escalier invisible du Coucou, et dessus de l'avion (flotteurs, toit, ailes)
    for (const p of this.planeStairPlats || []) if (y >= p.top - 0.8 && this.onPlatform(p, x, z)) h = Math.max(h, p.top);
    for (const p of this.planeTopPlats || []) if (y >= p.top - 0.8 && this.onPlatform(p, x, z)) h = Math.max(h, p.top);
    return h;
  }
  worldEnv() {
    const self = this;
    return {
      frame: null,
      height(x, z, y) { const g = self.groundAt(x, z, y); return g < CFG.player.maxWadeDepth ? CFG.swim.level : g; },
      // échelles : zone de 0,9 m devant l'échelle, pieds entre le bas (moins 1,45 m) et le haut
      ladder(x, z, y) {
        for (const l of self.ladders || []) if (Math.hypot(x - l.x, z - l.z) < 0.9 && y >= l.y0 - 1.45 && y <= l.y1 + 0.3) return l; return null; },
      canGo(x, z, y) {
        for (const p of self.platforms || []) {
          if (p.contain && y > p.top - 1 && self.onPlatform(p, self.player.pos.x, self.player.pos.z)) {
            return x > p.minX + 0.4 && x < p.maxX - 0.4 && z > p.minZ + 0.4 && z < p.maxZ - 0.4;
          }
        }
        if (self.carrying && self.carrying.def.weight >= 2 && self.groundAt(x, z, y) < CFG.player.maxWadeDepth) return false;
        return true;
      },
    };
  }
  cabinEnv() {
    // la porte cargo est libre : on peut sortir en marchant (à l'arrêt)
    const door = (x, z) => !this.flight.airborne && !this.flags.doorJam && z > CABIN.doorZ0 && z < CABIN.doorZ1 && x < 1.9;
    return { frame: this.plane.root, height: () => FLOOR, canGo: (x, z) => (x > CABIN.minX && x < CABIN.maxX && z > CABIN.minZ && z < CABIN.maxZ) || (x >= CABIN.maxX && door(x, z)) };
  }
  // aide contextuelle des touches : visible quelques secondes quand la situation change
  tipKeys(ctx, html) {
    const k = this._kt || (this._kt = { seen: {} });
    if (!document.getElementById('optHints').checked) html = '';
    if (ctx !== k.ctx) {
      k.ctx = ctx;
      const n = k.seen[ctx] = (k.seen[ctx] || 0) + 1;
      k.until = this.t + (n === 1 ? 9 : n <= 3 ? 5 : 3);
    }
    const on = !!html && this.t < k.until;
    if (on) this.ui.keys(html);
    this.ui.el.keys.classList.toggle('fade', !on);
  }
  // un nouvel objet : on remontre l'aide
  flashKeys() { if (this._kt) this._kt.ctx = null; }
  // se hisser hors de l'eau : ponton, quai, rocher… jusqu'à 2,4 m au-dessus de l'eau, droit devant
  tryClimbOut() {
    const p = this.player.pos, f = this.player.forward();
    for (const k of [0.55, 0.85]) {
      const x = p.x + f.x * k, z = p.z + f.z * k;
      const h = this.groundAt(x, z, p.y + 2.4);
      if (h > p.y + 0.35 && h - p.y < 2.6 && h > CFG.player.maxWadeDepth + 0.3) {
        const tx = p.x + f.x * (k + 0.35), tz = p.z + f.z * (k + 0.35);
        const th = this.groundAt(tx, tz, h + 0.3);
        if (Math.abs(th - h) > 0.5) continue;
        this.hoist = { t: 0, dur: 0.7 + (h - p.y) * 0.15, from: p.clone(), to: new THREE.Vector3(tx, h, tz), up: h };
        this.stamina = Math.max(0, this.stamina - 12);
        this.audio.splash?.();
        return true;
      }
    }
    return false;
  }
  updateHoist(dt) {
    const H = this.hoist, p = this.player.pos;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    // d'abord on monte (bras), puis on bascule vers l'avant
    const ku = Math.min(1, k / 0.6), kf = Math.max(0, (k - 0.45) / 0.55);
    p.set(H.from.x + (H.to.x - H.from.x) * kf, H.from.y + (H.up - H.from.y) * (1 - (1 - ku) * (1 - ku)), H.from.z + (H.to.z - H.from.z) * kf);
    this.player.velY = 0; this.player.onGround = true;
    this.player.applyCamera(dt, false, null, CFG.player.eyeHeight - 0.5 * Math.sin(k * Math.PI));
    if (k >= 1) this.hoist = null;
    return { moving: true, sprint: false };
  }
  // escalier invisible sous la porte cargo : des paliers (plateformes orientées) qui suivent l'avion
  // on peut toujours monter à bord, même dans une épave ou un avion pas encore réparé
  stairsActive() { return !this.flight.airborne; }
  updatePlaneStairs() {
    if (!this.stairsActive()) { this.planeStairPlats = []; this.planeTopPlats = []; return; }
    const r = this.plane.root, v = new THREE.Vector3();
    r.updateMatrixWorld(true);
    // on peut grimper sur l'avion : flotteurs (depuis l'eau ou d'un saut), toit, ailes
    const has = (k) => !k || this.installed.has(k);
    this.planeTopPlats = PLANE_TOPS.filter((p) => has(p.need)).map((p) => ({ obb: true, x: r.position.x, z: r.position.z, r: r.rotation.y, minX: p.minX, maxX: p.maxX, minZ: p.minZ, maxZ: p.maxZ, top: r.localToWorld(v.set((p.minX + p.maxX) / 2, p.top, (p.minZ + p.maxZ) / 2)).y }));
    // hauteur réelle de chaque marche (l'avion peut pencher ou tanguer)
    this.planeStairPlats = STAIRS.steps.map((s) => ({ obb: true, x: r.position.x, z: r.position.z, r: r.rotation.y, minX: s.x0, maxX: s.x1, minZ: STAIRS.z0, maxZ: STAIRS.z1, top: r.localToWorld(v.set((s.x0 + s.x1) / 2, s.top, (STAIRS.z0 + STAIRS.z1) / 2)).y, stair: true }));
  }
  // passage sans téléportation entre le monde et la cabine : on change seulement de repère (même position à l'écran)
  updateBoarding() {
    if (this.seat || this.lying || this.downed || this.driving || this.riding || this.hoist) return;
    const root = this.plane.root;
    root.updateMatrixWorld(true);
    if (!this.aboard) {
      if (!this.stairsActive()) return;
      const l = root.worldToLocal(this.player.pos.clone());
      if (l.x < 1.42 && l.x > 0.6 && l.z > STAIRS.z0 && l.z < STAIRS.z1 && Math.abs(l.y - FLOOR) < 0.45) {
        if (this.flags.doorJam || (this.carrying && this.carrying.def.weight >= 2)) {
          if (!this._jamT || this.t - this._jamT > 3) { this._jamT = this.t; this.audio.error(); this.ui.toast(this.flags.doorJam ? 'Porte bloquée' : 'Trop lourd', this.flags.doorJam ? 'Dégrippez le verrou (<kbd>E</kbd>).' : 'Posez la pièce (<kbd>G</kbd>).', 'bad', 1800); }
          return;
        }
        this.boardPlane(l);
      }
    } else if (!this.seat && this.player.pos.x > 1.75) this.exitPlane();
  }
  // sortie par la porte : sur le palier (au sol), ou dans le vide (en vol)
  exitPlane(fall = false) {
    const root = this.plane.root;
    root.updateMatrixWorld(true);
    const w = root.localToWorld(this.player.pos.clone());
    this.aboard = false; this.seat = null;
    this.player.pos.copy(w);
    this.player.yaw += root.rotation.y;
    this.player.velY = fall ? 1.5 : 0;
    this.player.onGround = !fall;
    if (fall) {
      const f = this.flight;
      this.fallVel = new THREE.Vector3(-Math.sin(f.yaw), 0, -Math.cos(f.yaw)).multiplyScalar(Math.min(f.speed, 30) * 0.5).add(new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw)).multiplyScalar(3));
      this.audio.whoosh?.();
      if (!this.said.has('jumpTip')) { this.said.add('jumpTip'); this.ui.toast('Chute libre !', this.chuteReady() ? '<kbd>Espace</kbd> : parachute' : 'Pas de parachute équipé…', this.chuteReady() ? 'good' : 'bad', 3000); }
    }
  }
  jumpOut() { this.player.pos.x = 2.1; this.exitPlane(true); }
  chuteReady() { return ['u1', 'u2', 'u3', 'u4'].some((s) => this.inv.eq[s]?.k === 'parachute'); }
  // chute : parachute (Espace, s'il est dans un équipement rapide), dégâts à l'atterrissage
  updateFall(dt) {
    const P = this.player;
    if (this.aboard || this.driving || this.riding) { this.chute = false; this.fallVel = null; return; }
    if (this.fallVel && !P.onGround) { P.pos.addScaledVector(this.fallVel, dt); this.fallVel.multiplyScalar(Math.exp(-(this.chute ? 2.5 : 0.35) * dt)); }
    if (!P.onGround && P.velY < -7 && !this.chute && this.input.hit('Space') && this.chuteReady()) {
      const s = ['u1', 'u2', 'u3', 'u4'].find((q) => this.inv.eq[q]?.k === 'parachute');
      this.inv.eq[s] = null; if (this.inv.sel === s) this.inv.sel = 'fists';
      this.chute = true; this.audio.whoosh?.(); this.player.shake = 0.5; this.invChanged(); this.syncHeld();
    }
    if (this.chute && P.velY < -3.2) P.velY = -3.2;
    if (!P.onGround && P.velY < -7 && !this.chute && this.chuteReady() && this.t - (this._chuteTipT || -9) > 4) { this._chuteTipT = this.t; this.ui.prompt('<kbd>Espace</kbd> Parachute'); }
    const land = P.landSpeed || 0;
    P.landSpeed = 0;
    if (land) {
      this.fallVel = null;
      if (this.chute) { this.chute = false; this.audio.drop?.(); }
      const water = this.swimming() || heightAt(P.pos.x, P.pos.z) < CFG.player.maxWadeDepth;
      const dmg = water ? (land - 20) * 5 : (land - 13) * 7;
      if (dmg > 0) { this.hurt(dmg, 'la chute'); if (water) this.audio.splash?.(); }
    }
    // voile du parachute au-dessus de la tête
    if (!this.chuteMesh) {
      const g = new THREE.Group();
      const c = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), new THREE.MeshLambertMaterial({ color: '#ff6b5b', side: THREE.DoubleSide, flatShading: true }));
      c.scale.set(1, 0.45, 1); c.position.y = 4.2; g.add(c);
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([[-2.2, 4.3], [2.2, 4.3], [0, 4.3]].flatMap(([x, y]) => [new THREE.Vector3(0, 1.4, 0), new THREE.Vector3(x, y, x ? 0 : 2.2)])), new THREE.LineBasicMaterial({ color: '#fff4e0' }));
      g.add(lines);
      this.chuteMesh = g; this.scene.add(g);
    }
    this.chuteMesh.visible = !!this.chute;
    if (this.chute) { this.chuteMesh.position.copy(P.pos); this.chuteMesh.rotation.y = P.yaw; }
  }
  swimming() { return !this.aboard && heightAt(this.player.pos.x, this.player.pos.z) < CFG.player.maxWadeDepth && this.player.pos.y <= CFG.swim.level + 0.05; }
  playerWorld() {
    if (this.bseat && this.boeing) { this.boeing.root.updateMatrixWorld(true); return this.boeing.root.localToWorld(this.player.pos.clone()); }
    if (!this.aboard) return this.player.pos.clone();
    this.plane.root.updateMatrixWorld(true);
    return this.plane.root.localToWorld(this.player.pos.clone());
  }
  playerYawWorld() { return this.player.yaw + (this.bseat && this.bf ? this.bf.yaw : this.aboard ? this.flight.yaw : 0); }
  nearIsland(p = this.playerWorld()) {
    const d = [Math.hypot(p.x, p.z)];
    for (const I of [this.island2, this.island3, this.island4]) d.push(I ? Math.hypot(p.x - I.cx, p.z - I.cz) : 1e9);
    return d.indexOf(Math.min(...d)) + 1;
  }
  islandName(n = this.nearIsland()) { return ['', 'Plage du Crash', 'Saint-Escale', 'Port-Cendre', 'Hélios'][n]; }

  // ── Objectifs ───────────────────────────────────────────
  chapter() { return this.flags.bAir ? 4 : this.flags.tookOff2 ? 3 : this.flags.tookOff ? 2 : 1; }
  objectives() { return [...this.wreckObjectives(), ...this.baseObjectives()]; }
  baseObjectives() {
    const f = this.flags;
    if (this.chapter() === 1) {
      const list = [];
      list.push({ id: 'diable', text: 'Récupérer le diable de secours', hint: 'Débris de la plage', done: !!this.flags.diable || this.hasItem('diable') });
      list.push({ id: 'repair', text: `Réparer le Coucou (${this.installed.size}/6 pièces)`, hint: this.hasItem('wrench') ? '' : 'Clé à molette : plage sud', done: this.installed.size === 6 });
      for (const k of PART_ORDER) list.push({ sub: true, text: ITEMS[k].name, hint: ITEMS[k].hint, done: this.installed.has(k) });
      list.push({ id: 'crate', text: 'Charger la caisse Hélios avec le treuil', hint: 'Treuil de la porte cargo (30 m)', done: this.crateLoaded });
      list.push({ id: 'takeoff', text: 'Monter à bord et décoller vers Hélios', hint: 'Porte cargo, puis siège pilote', done: f.tookOff });
      list.push({ id: 'chest', optional: true, text: `Bonus · ouvrir le coffre du canot (${this.symbols.size}/3 symboles)`, hint: 'Bout du ponton · symboles peints sur l\'île', done: f.chest });
      list.push({ id: 'rod', optional: true, text: 'Bonus · s\'offrir une canne à pêche chez Jo', hint: '3 🐚, caisse de troc du campement', done: this.hasItem('rod') });
      list.push({ id: 'king', optional: true, text: 'Bonus · vaincre le Crabe-Roi', hint: 'Crique nord-ouest · frappez après sa charge', done: f.kingDead });
      return list;
    }
    if (this.chapter() === 3) return this.objectives3();
    if (this.chapter() === 4) return this.objectives4();
    const fz = (k) => this.fuses.has(k);
    return [
      { id: 'find', text: 'Se poser à Saint-Escale pour faire le plein', hint: 'Suivez l\'écho du radar', done: f.landed2 },
      { id: 'power', text: `Rétablir le courant (${this.fuses.size}/3 fusibles)`, hint: 'Centrale, à l\'ouest du terminal', done: f.power },
      { sub: true, text: 'Fusible rouge · toit du terminal', hint: 'Échelle arrachée : poussez une caisse dessous', done: fz('red') },
      { sub: true, text: 'Fusible bleu · poste de sécurité', hint: 'Guidez le laser avec deux miroirs', done: fz('blue') },
      { sub: true, text: 'Fusible jaune · local du balisage', hint: 'Bout de piste · lestez les deux pédales', done: fz('yellow') },
      { id: 'radio', text: 'Appeler Marthe depuis la tour de contrôle', hint: 'Fréquence : étiquette de la caisse', done: f.radioDone },
      { id: 'hangar', text: 'Ouvrir le hangar 2 et récupérer les roues amphibies', hint: f.radioDone ? `Code du hangar : ${CFG.island2.hangarCode}` : 'Le code viendra par la radio', done: f.hangarOpen && (this.items.wheels.state !== 'ground' || f.wheels) },
      { id: 'wheels', text: 'Monter les roues sur les flotteurs', hint: 'Avion près du ponton', done: f.wheels },
      { id: 'fuel', text: 'Faire le plein au ponton', hint: this.nozzle !== 'plane' ? 'Pistolet de la pompe → aile droite' : 'Panneau de la pompe', done: f.refueled },
      { id: 'storm', text: 'Tenir la centrale jusqu\'à 21 h', hint: 'Défendez le générateur (clé : réparer)', done: f.stormOver, hidden: !f.storm },
      { id: 'takeoff2', text: 'Décoller de Saint-Escale, cap sur Hélios', hint: 'Rampe, puis plein gaz sur la piste', done: f.tookOff2 },
      { id: 'warden', optional: true, text: 'Bonus · vaincre le Colosse', hint: 'Vulnérable dans la lumière', done: f.wardenDead, hidden: !f.storm },
    ].filter((o) => !o.hidden);
  }
  currentObjective() {
    const o = this.objectives().find((x) => !x.done && !x.sub && !x.optional);
    return o || { id: 'free', text: 'Explorer librement', hint: '' };
  }
  // position de l'objectif en cours (pour la carte)
  objectivePoint() {
    const o = this.currentObjective();
    const I = this.island2, P = I.points;
    if (this.chapter() === 3) return this.objectivePoint3(o.id);
    if (this.chapter() === 4) return this.objectivePoint4(o.id);
    switch (o.id) {
      case 'wreck': return this.wreckObjectivePoint();
      case 'diable': return this.tools.diable.mesh.position;
      case 'repair': { const k = PART_ORDER.find((q) => !this.installed.has(q)); const it = this.items[k]; return it.state === 'ground' ? it.pos : this.plane.root.position; }
      case 'crate': return this.items.crate.pos;
      case 'takeoff': case 'wheels': return this.plane.root.position;
      case 'find': return new THREE.Vector3(I.cx, 0, I.cz);
      case 'power': { const k = ['red', 'blue', 'yellow'].find((q) => !this.fuses.has(q)); return k ? this.fuseSpots[k] : P.fusePanel; }
      case 'radio': return P.lift;
      case 'hangar': return this.flags.hangarOpen ? this.items.wheels.pos : P.hangarPad;
      case 'fuel': return this.nozzle === this.myId() ? this.plane.root.position : P.pump;
      case 'storm': return P.generator;
      case 'takeoff2': return P.runwayStart;
      default: return null;
    }
  }
  // photo de l'écran (sans les mains) rangée dans le carnet
  takePhoto() {
    this.wantPhoto = false;
    try {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      const g = c.getContext('2d');
      const W = this.canvas.width, H = this.canvas.height, h = W * 9 / 16;
      g.drawImage(this.canvas, 0, Math.max(0, (H - h) / 2), W, Math.min(H, h), 0, 0, 320, 180);
      const txt = document.getElementById('prompt').innerText.replace(/^E\s*/, '').trim();
      const cap = txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : `${this.islandName()} · ${this.clock()}`;
      this.photos = [...(this.photos || []), { src: c.toDataURL('image/jpeg', 0.7), cap: cap.slice(0, 48) }].slice(-12);
      this.ui.photos(this.photos);
      this.ui.fade(0.6, '#fff', 40); setTimeout(() => this.ui.fade(0, '#fff', 400), 60);
      this.audio.note(1400);
      this.ui.toast('Photo prise', 'Rangée dans le carnet (Tab).', 'good', 1600);
    } catch { /* capture impossible */ }
  }
  refreshCarnet() { this.ui.carnet(['', 'Chapitre 1 · Plage du Crash', 'Chapitre 2 · Saint-Escale', 'Chapitre 3 · Port-Cendre', 'Chapitre 4 · Hélios'][this.chapter()], this.objectives(), this.notes); }
  progress() { this.lastProgress = this.t; }

  radioOnce(key, msg) { if (this.said.has(key)) return; this.said.add(key); this.ui.radio(msg, () => this.audio.radio()); }
  nextHint() {
    if (this.chapter() === 1) {
      if (!this.hasItem('diable') && !this.flags.diable) return 'Le diable de secours est tombé près des débris, sur la plage. Sans lui, les moteurs vont vous casser le dos.';
      const missing = PART_ORDER.filter((k) => !this.installed.has(k));
      if (missing.length) {
        if (missing.includes('dashboard') && !this.flags.doorOpen && this.items.dashboard.state === 'ground') return 'Le tableau de bord est dans le cabanon du gardien. Lisez le mot punaisé sur la porte, et allez voir le phare.';
        const p = this.playerWorld();
        missing.sort((a, b) => this.items[a].pos.distanceTo(p) - this.items[b].pos.distanceTo(p));
        return `${ITEMS[missing[0]].name} : ${ITEMS[missing[0]].hint.toLowerCase()}. Suivez la fumée, ou ouvrez la carte (M).`;
      }
      if (!this.crateLoaded) return 'La caisse Hélios est dans le haut-fond. Utilisez le treuil sur la porte cargo, côté droit de l\'avion.';
      return 'Tout est prêt. Montez par l\'échelle du flotteur droit, allez au siège pilote à l\'avant et mettez les gaz. Cap sur Hélios !';
    }
    const o = this.currentObjective();
    return `${o.text}. ${o.hint || ''}`;
  }

  // ── Menus et réglages ───────────────────────────────────
  bindUI() {
    const ui = this.ui, $ = (id) => document.getElementById(id);
    if (matchMedia('(pointer: coarse)').matches) document.querySelector('.touchNote')?.classList.remove('hidden');
    $('btnPlay').addEventListener('click', () => { this.mpLeave(); unstore(SAVE_KEY); this.newGame(Math.floor(Math.random() * 1e9)); });
    $('btnContinue').addEventListener('click', () => { this.mpLeave(); this.continueGame(); });
    $('btnResume').addEventListener('click', () => this.resumeGame());
    $('btnRetry').addEventListener('click', () => this.retryDay());
    $('btnSave').addEventListener('click', () => { this.save(); ui.toast('Partie sauvegardée', '', 'good'); });
    $('btnQuit').addEventListener('click', () => this.quitToMenu());
    const openSheet = (id) => { this.sheetFrom = ui.visible('pause') ? 'pause' : 'menu'; ui.show(this.sheetFrom, false); ui.show(id, true); };
    const closeSheet = (id) => { ui.show(id, false); ui.show(this.sheetFrom || 'menu', true); };
    $('btnSettings').addEventListener('click', () => openSheet('settings'));
    $('btnSettings2').addEventListener('click', () => openSheet('settings'));
    $('btnHelp').addEventListener('click', () => openSheet('help'));
    $('btnHelp2').addEventListener('click', () => openSheet('help'));
    $('setClose').addEventListener('click', () => closeSheet('settings'));
    $('helpClose').addEventListener('click', () => closeSheet('help'));
    document.querySelectorAll('#settings .tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('#settings .tab').forEach((x) => x.classList.toggle('on', x === t));
      document.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== t.dataset.tab; });
    }));
    const bindRange = (id, out, fmt, apply) => { $(id).addEventListener('input', (e) => { $(out).textContent = fmt(+e.target.value); apply(+e.target.value); this.saveSettings(); }); };
    bindRange('optSens', 'oSens', (v) => v.toFixed(1), (v) => { this.player.sens = v; });
    bindRange('optFov', 'oFov', (v) => `${v}°`, (v) => { this.camera.fov = v; this.camera.updateProjectionMatrix(); });
    bindRange('optVol', 'oVol', (v) => `${Math.round(v * 100)} %`, (v) => this.audio.setVolume(v));
    bindRange('optMusic', 'oMusic', (v) => `${Math.round(v * 100)} %`, (v) => this.audio.setMusicVolume(v));
    bindRange('optGrass', 'oGrass', (v) => `${Math.round(v * 100)} %`, (v) => this.decor.setDensity?.(v));
    bindRange('optRes', 'oRes', (v) => `${Math.round(v * 100)} %`, (v) => { this.resScale = v; this.userRes = v; this.onResize(); });
    $('optInvert').addEventListener('change', (e) => { this.flight.invert = e.target.checked; this.saveSettings(); });
    $('optHints').addEventListener('change', () => this.saveSettings());
    $('optBob').addEventListener('change', () => this.saveSettings());
    $('optShadows').addEventListener('change', (e) => { this.setShadows(e.target.checked); this.saveSettings(); });
    $('optBloom').addEventListener('change', (e) => { this.bloomOn = e.target.checked; this.saveSettings(); });
    $('optFps').addEventListener('change', (e) => { ui.show('fps', e.target.checked); this.saveSettings(); });
    $('optDynRes').addEventListener('change', (e) => { this.dynRes = e.target.checked; if (!this.dynRes) { this.resScale = this.userRes || 1; this.onResize(); } this.saveSettings(); });
    // préréglages de qualité
    document.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => {
      const q = { low: [0.7, false, false, 0.25, 0.7], mid: [0.85, true, true, 0.5, 1], high: [1, true, true, 1, 1.2] }[b.dataset.quality];
      const set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input')); };
      set('optRes', q[0]); $('optShadows').checked = q[1]; $('optShadows').dispatchEvent(new Event('change'));
      $('optBloom').checked = q[2]; $('optBloom').dispatchEvent(new Event('change')); set('optGrass', q[3]); set('optView', q[4]);
      document.querySelectorAll('[data-quality]').forEach((x) => x.classList.toggle('on', x === b));
      this.saveSettings();
    }));
    $('btnEndFly').addEventListener('click', () => { ui.show('endScreen', false); this.input.lock(); });
    // on ne ferme la fiche Paramètres/Commandes qu'en revenant d'où l'on vient
    $('btnEndMenu').addEventListener('click', () => { ui.show('endScreen', false); this.quitToMenu(); });
    // ── souris : un clic dans le jeu (hors menus) reprend la main ──
    this.canvas.addEventListener('mousedown', () => {
      if (this.inGame() && !this.input.locked && !this.overlayOpen()) this.input.lock();
    });
    // la pause ne s'ouvre QUE si le joueur a quitté la capture lui-même (Échap, alt-tab) ;
    // un déverrouillage voulu par le jeu (fenêtre d'énigme, fin de mission, sommeil) n'ouvre rien
    this.input.onLockChange = (locked, soft) => {
      if (locked) { if (!soft) this.input.lockFails = 0; return; }
      const wanted = this.input.expectUnlock; this.input.expectUnlock = false;
      if (wanted) return;
      // capture perdue juste après l'avoir (re)demandée (fin d'énigme, hangar, mission…) : pas de pause, un clic suffit
      if (performance.now() - (this.input.lockReqT || 0) < 1500 || performance.now() - (this.modalClosedT || 0) < 1500) return;
      if (this.inGame() && !this.overlayOpen() && !this.chatting) this.openPause();
    };
    this.input.onLockFail = () => { /* l'invite « Cliquez pour reprendre » reste affichée */ };
    const full = () => this.toggleFullscreen();
    $('btnFull').addEventListener('click', full);
    $('optFull').addEventListener('change', (e) => this.toggleFullscreen(e.target.checked));
    document.addEventListener('fullscreenchange', () => { $('optFull').checked = !!document.fullscreenElement; $('btnFull').querySelector('span').textContent = document.fullscreenElement ? 'Fenêtré' : 'Plein écran'; });
    bindRange('optView', 'oView', (v) => `${Math.round(v * 100)} %`, (v) => { this.viewDist = v; });
    bindRange('optBright', 'oBright', (v) => `${Math.round(v * 100)} %`, (v) => { this.brightness = v; });
    addEventListener('keydown', (e) => {
      if (ui.modalOpen()) {
        if (e.code === 'Escape') this.closeModal();
        else ui.modalKey?.(e);
        return;
      }
      if (e.code === 'KeyM' && this.inGame() && !this.chatting) { e.preventDefault(); this.toggleMap(); }
      else if (e.code === 'Escape' && ui.visible('mapScreen')) this.toggleMap(false);
      else if (e.code === 'Escape' && this.invUi.isOpen) this.toggleInventory(false);
      else if (e.code === 'Escape' && (ui.visible('settings') || ui.visible('help'))) { ui.show('settings', false); ui.show('help', false); ui.show(this.sheetFrom || 'menu', true); }
      else if (e.code === 'Escape' && this.inGame() && !this.chatting) {
        // Échap sans capture (mode glisser, ou invite affichée) : ouvre/ferme la pause
        if (ui.visible('pause')) { ui.show('pause', false); }
        else if (!this.input.locked && !this.overlayOpen()) this.openPause();
      }
    });
    addEventListener('beforeunload', () => { if (this.inGame()) this.save(); this.session?.leave(); });
  }
  inGame() { return this.mode === 'explore' || this.mode === 'flight' || this.mode === 'crashed'; }
  // un menu, une fenêtre ou une cinématique occupe l'écran : pas de capture souris
  overlayOpen() {
    const ui = this.ui;
    return ui.modalOpen() || this.cinematic || this.invUi?.isOpen || ['pause', 'settings', 'help', 'endScreen', 'mapScreen', 'dead', 'menu', 'mpSheet', 'adminSheet'].some((k) => ui.visible(k));
  }
  openPause() {
    this.ui.show('pause', true);
    const n = this.session ? ` · équipage ${this.session.count()}` : '';
    const ch = ['Chapitre 1 · Plage du Crash', 'Chapitre 2 · Saint-Escale', 'Chapitre 3 · Port-Cendre', 'Chapitre 4 · Hélios'][this.chapter() - 1] || '';
    document.getElementById('pauseInfo').textContent = `${ch} · ${this.clock()} · canards ${this.ducks.size}/${this.duckSpots.length}${n}`;
    this.save();
  }
  resumeGame() { this.ui.show('pause', false); this.input.lock(); }
  toggleFullscreen(on) {
    const want = on ?? !document.fullscreenElement;
    try {
      if (want && !document.fullscreenElement) {
        const r = document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
        r?.catch?.(() => this.ui.toast('Plein écran refusé', 'Le navigateur ou la page l\'interdit ici. Essayez F11.', 'bad'));
      } else if (!want && document.fullscreenElement) document.exitFullscreen?.();
    } catch { this.ui.toast('Plein écran indisponible', 'Essayez la touche F11.', 'bad'); }
  }

  setShadows(on) {
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  loadSettings() {
    const s = store(SETTINGS_KEY) || {};
    const $ = (id) => document.getElementById(id);
    const set = (id, v) => { $(id).value = v; $(id).dispatchEvent(new Event('input')); };
    set('optSens', s.sens ?? 1); set('optFov', s.fov ?? 72); set('optVol', s.vol ?? 0.7); set('optMusic', s.music ?? 0.8);
    set('optGrass', s.grass ?? 1); set('optRes', s.res ?? 1);
    $('optInvert').checked = !!s.invert; this.flight.invert = !!s.invert;
    $('optHints').checked = s.hints ?? true;
    $('optBob').checked = s.bob ?? true;
    $('optShadows').checked = s.shadows ?? true; this.setShadows(s.shadows ?? true);
    $('optBloom').checked = s.bloom ?? true; this.bloomOn = s.bloom ?? true;
    $('optFps').checked = !!s.fps; this.ui.show('fps', !!s.fps);
    set('optView', s.view ?? 1); set('optBright', s.bright ?? 1);
    $('optDynRes').checked = s.dynRes ?? true; this.dynRes = s.dynRes ?? true;
  }
  saveSettings() {
    const $ = (id) => document.getElementById(id);
    store(SETTINGS_KEY, {
      sens: +$('optSens').value, fov: +$('optFov').value, vol: +$('optVol').value, music: +$('optMusic').value,
      grass: +$('optGrass').value, res: +$('optRes').value, invert: $('optInvert').checked, hints: $('optHints').checked,
      bob: $('optBob').checked, shadows: $('optShadows').checked, bloom: $('optBloom').checked, fps: $('optFps').checked, view: +$('optView').value, bright: +$('optBright').value, dynRes: $('optDynRes').checked,
    });
  }

  refreshMenu() {
    const s = store(SAVE_KEY);
    const $ = (id) => document.getElementById(id);
    $('btnContinue').classList.toggle('hidden', !s);
    $('btnContinue').classList.toggle('primary', !!s);
    $('btnPlay').classList.toggle('primary', !s);
    if (s) {
      const h = ((s.hour % 24) + 24) % 24;
      $('continueInfo').textContent = `Chap. ${s.flags?.bAir ? 4 : s.flags?.tookOff2 ? 3 : s.flags?.tookOff ? 2 : 1} · ${String(Math.floor(h)).padStart(2, '0')}h${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
      $('menuDucks').textContent = s.ducks?.length ? `🦆 ${s.ducks.length}/${this.duckSpots.length} canards` : '';
    } else $('menuDucks').textContent = '';
    $('mpResume').closest('label').classList.toggle('hidden', !s);
  }

  quitToMenu() {
    this.save();
    this.mpLeave();
    this.mode = 'menu';
    this.hour = 17.3;
    this.input.unlock();
    ['pause', 'hud', 'dead', 'endScreen', 'mapScreen'].forEach((k) => this.ui.show(k, false));
    this.ui.show('menu', true);
    this.ui.flight(false);
    this.closeModal(true);
    this.audio.setEngine(0, 0);
    this.canvas.style.filter = '';
    this.ui.veil(0);
    this.resetWorld();
    this.refreshMenu();
  }

  // ── Sauvegarde (solo et hôte) ───────────────────────────
  saveData() {
    const w = this.worldState();
    return {
      ...w, v: 7, savedAt: Date.now(), notes: this.notes, said: [...this.said], inv: this.inv, crewInv: this.crewInv || {}, lootTaken: this.lootTaken, oil: this.oil, hp: this.hp,
      aboard: this.aboard, player: this.bseat ? this.bSavePos() : { x: this.player.pos.x, y: this.player.pos.y, z: this.player.pos.z, yaw: this.player.yaw },
      plane: { x: this.flight.pos.x, z: this.flight.pos.z, yaw: this.flight.yaw, fuel: this.flight.fuel },
    };
  }
  save() {
    if (!this.inGame() || !this.isAuthority()) return;
    const d = this.saveData();
    store(SAVE_KEY, d);
    if (this.session?.isHost) this.transport?.sendSave?.(d);
  }

  continueGame(fromSession = false) {
    const s = store(SAVE_KEY);
    if (!s || !(s.v >= 4)) return false;
    this.audio.init();
    this.resetWorld();
    this.buildIsland2(s.seed);
    this.applyWorld(s, { full: true, load: true });
    // vieille sauvegarde : les objets des nouvelles énigmes n'y sont pas encore
    this.ensurePuzzleItems(2);
    this.ensureC3Items();
    this.notes = s.notes || [];
    (s.said || []).forEach((k) => this.said.add(k));
    this.lootTaken = { ...(s.lootTaken || {}) };
    this.crewInv = { ...(s.crewInv || {}) };
    if (s.v >= 7 && s.inv?.cl) this.inv = JSON.parse(JSON.stringify(s.inv));
    else {
      // ancienne sauvegarde : équipement « possédé » et compteurs → objets ; le surplus va au coffre du Coucou
      const m = migrateInventory(s);
      this.inv = m.inv;
      for (const it of m.spill) gridAdd(this.chest, 8, 6, it);
      for (const k of ['diable', 'wrench', 'lantern', 'machete', 'shotgun', 'pistol', 'bat', 'axe', 'rifle']) if (s.own?.[k]) this.lootTaken[['diable', 'wrench', 'lantern'].includes(k) ? `tool:${k}` : k] = 'got';
      for (const [k, n] of Object.entries(s.fish || {})) if (n > 0 && GEAR[`f_${k}`]) this.giveItem(`f_${k}`, n, {}, { toSlot: false, silent: true });
    }
    this.syncHeld();
    this.oil = s.oil ?? 100;
    this.hp = Math.max(40, s.hp ?? 100);
    this.placeTools();
    if (this.planeLive) { this.flight.fuel = s.plane?.fuel ?? CFG.flight.startFuel; this.flight.reset(s.plane.x, s.plane.z, s.plane.yaw); this.planeLift = 1; }
    this.startSmokes();
    if (brumeFactor(((this.hour % 24) + 24) % 24) > 0.3) this.hour = CFG.time.restartHour;
    this.aboard = !!s.aboard && this.planeLive;
    if (this.aboard) { this.player.pos.set(PLANE_POINTS.doorIn.x, FLOOR, PLANE_POINTS.doorIn.z); this.player.yaw = Math.PI / 2; }
    else if (s.player) { this.player.place(s.player.x, s.player.z, s.player.yaw); if (s.player.y) this.player.pos.y = Math.max(this.player.pos.y, this.groundAt(s.player.x, s.player.z, s.player.y), Math.min(s.player.y, this.player.pos.y + 12)); }
    else this.spawnAtFire();
    this.spawnEnemies();
    this.enterPlay();
    this.ui.toast('Partie reprise', `Il est ${this.clock()}.`, 'good');
    void fromSession;
    return true;
  }

  newGame(seed) {
    this.resetWorld();
    this.buildIsland2(seed);
    this.startIntro();
  }

  enterPlay() {
    this.ui.show('menu', false);
    this.ui.show('mpSheet', false);
    this.ui.show('hud', true);
    this.ui.el.hud.dataset.mode = 'explore';
    this.mode = 'explore';
    this.input.lock();
    this.refreshCarnet();
  }

  clock() {
    const h = ((this.hour % 24) + 24) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // ── Cinématique d'ouverture ─────────────────────────────
  startIntro() {
    this.audio.init();
    this.ui.show('menu', false);
    this.ui.show('mpSheet', false);
    this.ui.show('hud', true);
    this.ui.el.hud.dataset.mode = 'intro';
    this.input.lock();
    this.mode = 'intro';
    this.introT = 0;
    this.introAfter = -1;
    this.hour = 8.1;
    // la cinématique se passe en plein orage : nuages gris, pluie, foudre
    this.weather.set('storm', true);
    this.introBolt = 0;
    this.introShake = 0;
    for (const k of PART_ORDER) this.plane.parts[k].visible = true;
    this.buildIntroCurve();
    // prologue : vol paisible, bandes de cinéma et texte qui explique l'enjeu
    this.introPro = 0;
    this.introCard = -1;
    this.ui.letterbox(true);
    this.ui.subtitle('');
    this.ui.keys(this.isAuthority() ? '<kbd>Espace</kbd> passer la cinématique' : 'L\'hôte peut passer la cinématique'); this.ui.el.keys.classList.remove('fade');
    this.ui.fade(0);
  }
  // cartons du prologue : [début, fin, texte]
  introCards() {
    return [
      [0.6, 6.2, 'Archipel des Sept Vents. Depuis trois nuits, une fièvre court d\'île en île : au crépuscule, les malades se relèvent… et ne sont plus eux-mêmes.'],
      [6.6, 12.4, 'Sur le continent, on a isolé la souche d\'un remède. Une seule, dans une seule caisse. Seul le laboratoire de Marthe, sur l\'île d\'Hélios, peut en tirer des doses pour tout l\'archipel.'],
      [12.8, 18.4, 'Votre mission : un vol direct jusqu\'à Hélios, à bord du Coucou, votre vieil hydravion. Trois heures de vol. Rien de plus simple.'],
      [18.8, 22.0, '… Mais le Coucou n\'a jamais aimé les orages.'],
    ];
  }
  updatePrologue(dt) {
    const PRO = 22;
    this.introPro += dt;
    const t = this.introPro;
    const c0 = this.introCurve.getPointAt(0), tan0 = this.introCurve.getTangentAt(0);
    // l'avion arrive en ligne droite vers le début de la trajectoire du crash
    const p = c0.clone().addScaledVector(tan0, -(PRO - t) * 26);
    const root = this.plane.root;
    root.position.copy(p);
    root.lookAt(p.clone().sub(tan0));
    root.rotateZ(Math.sin(t * 0.7) * 0.06);
    root.updateMatrixWorld(true);
    this.plane.spinners.forEach((s) => { s.rotation.z += dt * 30; });
    this.audio.setEngine(0.8, 0.45 + (t > 18.5 && Math.random() < 0.12 ? -0.3 : 0));
    this.audio.setWind(0.06, 0.4);
    // caméra : lent travelling autour de l'avion
    const a = t * 0.16 + 0.6;
    const side = new THREE.Vector3().crossVectors(tan0, new THREE.Vector3(0, 1, 0)).normalize();
    const want = p.clone().addScaledVector(side, Math.cos(a) * 26).addScaledVector(tan0, Math.sin(a) * 26 + 6).add(new THREE.Vector3(0, 5 + Math.sin(t * 0.3) * 3, 0));
    if (t < 0.1) this.camera.position.copy(want); else this.camera.position.lerp(want, 1 - Math.exp(-2 * dt));
    this.camera.lookAt(p.clone().add(new THREE.Vector3(0, 2, 0)));
    // « le Coucou n'a jamais aimé les orages » : un éclair tombe tout près
    if (t >= 19.2 && this.introBolt === 0) {
      this.introBolt = 1;
      this.weather.strike(this.camera.position, p.clone().addScaledVector(side, 38).setY(0));
      this.introShake = 0.35;
    }
    this.introCameraShake(dt);
    const cards = this.introCards();
    const k = cards.findIndex(([s, e]) => t >= s && t < e);
    if (k !== this.introCard) { this.introCard = k; this.ui.cineText(k >= 0 ? cards[k][2] : ''); }
    if (t >= PRO) {
      this.ui.cineText('');
      this.ui.letterbox(false);
      this.introPro = PRO + 1;
      this.smoke.add('trail', () => this.plane.body.localToWorld(SLOTS.engineL.clone()), '#2f2c2c', 14, 0.6);
      // la foudre frappe l'avion, en plein sur le moteur gauche
      this.weather.strike(this.camera.position, this.plane.body.localToWorld(SLOTS.engineL.clone()), true);
      this.introShake = 0.9;
      this.audio.clank(); this.audio.spark();
      this.ui.fade(0.7, '#fff', 40);
      setTimeout(() => { if (this.mode === 'intro') this.ui.fade(0, '#fff', 500); }, 90);
      this.ui.subtitle('<big>La tempête</big>La foudre a frappé le Coucou. Le moteur gauche vient de lâcher.');
      setTimeout(() => { if (this.mode === 'intro') this.ui.subtitle(''); }, 3500);
    }
  }

  // secousse de caméra après un coup de foudre (cinématique)
  // la caméra de la cinématique ne rentre jamais dans le relief ni dans la cime d'un arbre
  introCamClear(v) {
    v.y = Math.max(v.y, Math.max(heightAt(v.x, v.z), 0) + 2.5);
    for (const t of this.island.treeList || []) {
      if (Math.abs(t.x - v.x) > 5 || Math.abs(t.z - v.z) > 5 || Math.hypot(t.x - v.x, t.z - v.z) > 5) continue;
      v.y = Math.max(v.y, t.y + 6.5 * t.s + 1.5);
    }
    return v;
  }
  // plan final de la chute : côté mer, face à la plage (la forêt reste derrière l'avion)
  introFinalShot() {
    const c = LAYOUT.crash, b = LAYOUT.beach;
    const ref = Math.atan2(b.z - 24 - c.z, b.x + 24 - c.x);
    let best = null, bs = 1e9;
    for (const r of [26, 32, 40]) {
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (heightAt(x, z) > 0.3) continue;
        // la ligne de vue vers l'épave ne doit pas traverser de terre haute
        let blocked = false;
        for (let k = 1; k < 8 && !blocked; k++) { const s = k / 8; if (heightAt(lerp(x, c.x, s), lerp(z, c.z, s)) > 3) blocked = true; }
        if (blocked) continue;
        const da = Math.abs(Math.atan2(Math.sin(a - ref), Math.cos(a - ref)));
        const score = da + r * 0.01;
        if (score < bs) { bs = score; best = new THREE.Vector3(x, 8, z); }
      }
    }
    return this.introCamClear(best || new THREE.Vector3(b.x + 24, heightAt(b.x + 24, b.z - 24) + 7, b.z - 24));
  }
  introCameraShake(dt) {
    if (!(this.introShake > 0)) return;
    const k = this.introShake;
    this.camera.position.x += (Math.random() - 0.5) * k;
    this.camera.position.y += (Math.random() - 0.5) * k;
    this.introShake = Math.max(0, k - dt * 1.4);
  }

  buildIntroCurve() {
    const c = LAYOUT.crash, b = LAYOUT.beach;
    const pts = [[-70, 125, -560], [32, 80, -175], [18, 70, -80], [-36, 50, -12], [-20, 40, 46], [12, 25, 106], [4, 9, b.z - 6], [c.x, -0.4, c.z]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.introCurve = new THREE.CatmullRomCurve3(pts);
    this.introEndCam = this.introFinalShot();
    this.drops = [];
    for (const k of ['wingL', 'engineR', 'dashboard', 'prop', 'floats']) {
      const target = LAYOUT.parts[k];
      let best = 0, bd = 1e9;
      for (let i = 0; i <= 500; i++) { const p = this.introCurve.getPointAt(i / 500); const d = Math.hypot(p.x - target.x, p.z - target.z); if (d < bd) { bd = d; best = i / 500; } }
      this.drops.push({ k, u: Math.max(0, best - 0.018), done: false });
    }
  }

  launch(k, from, to, dur, spin = 5) {
    const it = this.items[k];
    it.state = 'flying';
    it.mesh.visible = true;
    it.mesh.position.copy(from);
    this.flying.push({ it, from: from.clone(), to: new THREE.Vector3(to.x, heightAt(to.x, to.z) + it.rest, to.z), t: 0, dur, rot: new THREE.Vector3(Math.random() * spin, Math.random() * spin, Math.random() * spin) });
  }
  updateFlying(dt) {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      const s = Math.min(1, f.t / f.dur);
      const m = f.it.mesh;
      m.position.set(lerp(f.from.x, f.to.x, s), lerp(f.from.y, f.to.y, s * s) + Math.sin(s * Math.PI) * 2, lerp(f.from.z, f.to.z, s));
      m.rotation.x += f.rot.x * dt; m.rotation.y += f.rot.y * dt; m.rotation.z += f.rot.z * dt;
      if (s >= 1) {
        this.placeItem(f.it, f.to.x, f.to.z, (f.it.id.charCodeAt(0) * 1.7) % 6.28);
        if (m.position.distanceTo(this.camera.position) < 160) this.audio.thud();
        this.flying.splice(i, 1);
      }
    }
  }

  updateIntro(dt) {
    const T = 12;
    if (this.introPro !== undefined && this.introPro <= 22) {
      this.updatePrologue(dt);
      if (this.input.hit('Space', 'Enter') && this.isAuthority()) { this.session?.send('skip', {}); this.skipIntro(); }
      return;
    }
    if (this.introAfter < 0) {
      this.introT += dt;
      const u = Math.min(1, this.introT / T);
      const p = this.introCurve.getPointAt(u), tan = this.introCurve.getTangentAt(u);
      const root = this.plane.root;
      root.position.copy(p);
      root.lookAt(p.clone().sub(tan));
      root.rotateZ(Math.sin(this.introT * 2.3) * 0.18 + Math.sin(this.introT * 5.1) * 0.05);
      root.updateMatrixWorld(true);
      this.audio.setEngine(1, 0.55 + Math.sin(this.introT * 9) * 0.12 + (Math.random() < 0.05 ? -0.3 : 0));
      this.audio.setWind(0.12, 0.6);
      this.plane.spinners.forEach((s) => { s.rotation.z += dt * 30; });
      for (const d of this.drops) {
        if (!d.done && u >= d.u) {
          d.done = true;
          this.plane.parts[d.k].visible = false;
          this.launch(d.k, this.plane.body.localToWorld(SLOTS[d.k].clone()), LAYOUT.parts[d.k], 1.6, 6);
          this.audio.clank();
        }
      }
      if (u < 0.8) {
        const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize();
        const want = p.clone().addScaledVector(tan, -24).addScaledVector(side, 11).add(new THREE.Vector3(0, 8, 0));
        if (this.introT < 0.1) this.camera.position.copy(want); else this.camera.position.lerp(want, 1 - Math.exp(-3 * dt));
        this.introCamClear(this.camera.position);
        this.camera.lookAt(p);
      } else {
        this.camera.position.lerp(this.introEndCam, 1 - Math.exp(-2.5 * dt));
        this.introCamClear(this.camera.position);
        this.camera.lookAt(p);
      }
      // second coup de foudre pendant la chute : l'avion perd ses pièces
      if (this.introT >= 4.2 && this.introBolt < 2) {
        this.introBolt = 2;
        this.weather.strike(this.camera.position, this.plane.body.localToWorld(new THREE.Vector3(0, 1.5, 0)), true);
        this.introShake = 0.7;
        this.audio.spark();
      }
      this.introCameraShake(dt);
      if (u >= 1) this.impact();
    } else {
      this.introAfter += dt;
      const a = this.introAfter;
      if (a < 0.6) { const k = (0.6 - a) * 0.8; this.camera.position.x += (Math.random() - 0.5) * k; this.camera.position.y += (Math.random() - 0.5) * k; }
      if (a > 0.25 && this.introStage === 0) { this.introStage = 1; this.ui.fade(0, '#fff', 600); }
      if (a > 3.4 && this.introStage === 1) { this.introStage = 2; this.ui.fade(1, '#000', 900); }
      if (a > 4.4 && this.introStage === 2) {
        this.introStage = 3;
        this.ui.subtitle('<big>Plage du Crash</big>Quelques heures plus tard. Vous êtes en vie. Le Coucou, beaucoup moins.');
        this.beginExplore();
        setTimeout(() => this.ui.fade(0, '#000', 1400), 1800);
        setTimeout(() => { this.ui.subtitle(''); this.welcome(); }, 5600);
      }
    }
    if (this.input.hit('Space', 'Enter') && this.introAfter < 0 && this.isAuthority()) { this.session?.send('skip', {}); this.skipIntro(); }
  }

  welcome() {
    this.radioOnce('hello', `Ici Marthe, labo Hélios… Vous me recevez ? Votre balise de détresse s'est déclenchée. Dieu merci, vous êtes vivant${this.session && this.session.count() > 1 ? 's, tous' : 's'}. Vous êtes sur un îlot perdu, loin de tout. Réparez le Coucou : la caisse est la seule, elle doit arriver jusqu'ici.`);
    this.radioOnce('watch', 'Je reste sur la radio de secours du Coucou, je vous guiderai. Surveillez votre montre (touche T) : à 19 h, la nuit tombe et les morts se relèvent. Le seul endroit sûr pour dormir : l\'avion, sur l\'eau. La carte est sur la touche M.');
  }

  impact() {
    this.introAfter = 0;
    this.introStage = 0;
    this.smoke.remove('trail');
    this.audio.explosion(); this.audio.splash(); this.audio.setEngine(0, 0);
    this.ui.fade(0.85, '#fff', 60);
    this.setWreck();
    this.plane.root.updateMatrixWorld(true);
    const door = this.plane.root.localToWorld(PLANE_POINTS.winch.clone());
    this.plane.parts.engineL.visible = false;
    this.launch('engineL', this.plane.body.localToWorld(SLOTS.engineL.clone()), LAYOUT.parts.engineL, 1.1, 4);
    this.launch('crate', door.clone().add(new THREE.Vector3(0, 1, 0)), LAYOUT.crate, 1.3, 2);
    this.placeTools();
    this.smoke.add('wreck', () => this.plane.root.localToWorld(new THREE.Vector3(0, 3.6, 1)), '#3d3a3a', 2.5, 2.2);
  }

  skipIntro() {
    if (this.mode !== 'intro') return;
    this.introPro = 99;
    this.ui.letterbox(false);
    this.smoke.remove('trail');
    this.flying = [];
    this.audio.setEngine(0, 0);
    this.ui.fade(0, '#000', 800);
    this.beginExplore();
    this.ui.subtitle('<big>Plage du Crash</big>Vous êtes en vie. Le Coucou, beaucoup moins.');
    setTimeout(() => this.ui.subtitle(''), 4200);
    setTimeout(() => this.welcome(), 1500);
  }

  // ennemis de départ (hôte ou solo)
  spawnEnemies() {
    if (!this.isAuthority()) return;
    this.enemies.setHpScale(1 + 0.6 * (this.playerCount() - 1));
    this.enemies.spawnCrabs(LAYOUT.crabs);
    this.enemies.spawnCrabs(this.island2.crabs);
    if (!this.flags.kingDead) this.enemies.add('kingcrab', LAYOUT.cove.x, LAYOUT.cove.z);
  }

  beginExplore() {
    for (const f of this.flying) this.placeItem(f.it, f.to.x, f.to.z);
    this.flying = [];
    this.smoke.emitters.forEach((_, id) => { if (id !== 'wreck') this.smoke.remove(id); });
    this.scatterAll();
    this.spawnEnemies();
    this.hour = CFG.time.startHour;
    this.weatherWakeUp();
    this.spawnAtFire();
    this.mode = 'explore';
    this.ui.el.hud.dataset.mode = 'explore';
    this.refreshCarnet();
    this.audio.setWind(0.05, 0.2);
    this.progress();
    this.save();
  }

  spawnAtFire() {
    const f = LAYOUT.campfire;
    const k = this.session ? this.mpIndex() : 0;
    const x = f.x + 4.5 + k * 1.6, z = f.z - 5 + (k % 2) * 1.2;
    this.aboard = false; this.seat = null; this.lying = false;
    this.player.place(x, z, Math.atan2(-(LAYOUT.crash.x - x), -(LAYOUT.crash.z - z)));
  }

  // point de réveil : feu (île 1) ou cabine de l'avion (île 2)
  respawn() {
    if (this.carrying) this.dropCarried();
    if (this.chapter() === 2 && this.planeLive) {
      this.aboard = true; this.seat = null; this.lying = false;
      this.player.pos.set(-0.3 + (this.mpIndex() % 2) * 0.5, FLOOR, 3.3 - this.mpIndex() * 0.8); this.player.yaw = Math.PI / 2;
    } else if (this.chapter() >= 3 && this.boeing && !this.c3?.fly) {
      // Port-Cendre et Hélios : dans l'Institut s'il est ouvert, sinon dans la cabine du Boeing
      this.aboard = false; this.seat = null; this.lying = false;
      const k = this.mpIndex();
      if (this.chapter() === 4 && this.flags.decon4) { const p = this.island4.points.labIn; this.player.place(p.x + k * 0.8, p.z - 2, Math.PI); }
      else { const p = this.boeingLocal(new THREE.Vector3(0, FLOOR_B, 14 + k * 1.1)); this.player.place(p.x, p.z, this.c3.bp.yaw); this.player.pos.y = p.y; }
    } else this.spawnAtFire();
  }

  retryDay() {
    this.ui.show('dead', false);
    this.tox = 0;
    this.hp = CFG.player.health;
    this.stamina = CFG.player.stamina;
    this.downed = false;
    this.ui.downed(false);
    this.respawn();
    if (this.isAuthority()) {
      this.hour = CFG.time.restartHour;
      this.stats.days++;
      this.enemies.clearVoiles();
      if (this.enemies.aliveCount('crab') === 0) { this.enemies.spawnCrabs(LAYOUT.crabs); this.enemies.spawnCrabs(this.island2.crabs); }
      this.siege = { active: false, genHp: 100, wave: 0 };
      if (this.flags.power) this.island2.setPower(true);
      this.c4Retry?.();
    }
    this.flags.alarm = false; this.flags.h16 = false; this.flags.h18 = false;
    this.mode = 'explore';
    this.ui.el.hud.dataset.mode = 'explore';
    this.canvas.style.filter = '';
    this.input.lock();
    this.ui.toast('Nouveau jour', 'Il est 07:00. Le soleil a renvoyé les zombies sous terre.', 'good');
    this.save();
  }

  // ── Boucle ──────────────────────────────────────────────
  loop(now) {
    const rawDt = (now - this.last) / 1000;
    const dt = Math.min(0.05, rawDt);
    this.last = now;
    this.t += dt;
    this.fpsAcc += rawDt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.ui.fps(`${Math.round(this.fpsN / this.fpsAcc)} i/s`); this.fpsAcc = 0; this.fpsN = 0; }
    try { this.update(dt); } catch (e) { console.error(e); }
    // ombres recalculées une image sur deux (le soleil bouge lentement)
    this.frameN = (this.frameN || 0) + 1;
    if (this.renderer.shadowMap.enabled) this.renderer.shadowMap.needsUpdate = this.frameN % 2 === 0 || this.mode === 'flight' || !!this.bseat;
    this.autoResolution(rawDt);
    this.renderer.toneMappingExposure = 0.98 * (this.brightness || 1);
    if (this.debugCam) { this.camera.position.copy(this.debugCam.p); this.camera.lookAt(this.debugCam.l); }   // (tests)
    if (this.bloomOn) {
      // halos plus forts la nuit (lampes, fusées, yeux), discrets le jour
      this.bloom.strength = 0.16 + (this.brumeNow || 0) * 0.42;
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
    if (this.wantPhoto) this.takePhoto();
    if (this.mode === 'explore' && !this.lying && !this.downed && !this.driving && !(this.riding && !this.vcam.first) && !this.cinematic && !this.bseat) this.vm.render(this.renderer);
    this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    const inp = this.input;
    if (this.mode === 'menu') this.updateMenu(dt);
    else if (this.mode === 'intro') this.updateIntro(dt);
    else if (this.mode === 'explore') this.updateExplore(dt);
    else if (this.mode === 'flight') this.updateFlight(dt);

    this.updateFlying(dt);
    this.smoke.update(dt);
    this.trails.update(dt, this.plane.root, { active: (this.planeLive || this.mode === 'menu') && this.mode !== 'intro' });
    const hour = ((this.hour % 24) + 24) % 24;
    const focus = this.mode === 'flight' || this.mode === 'crashed' ? this.flight.pos : this.inGame() ? this.playerWorld() : this.camera.position;
    const wx = this.updateWeather(dt);
    const sk = this.sky.update(hour, this.camera.position, this.t, dt, focus, (this.viewDist || 1) * (this.mode === 'flight' || this.mode === 'menu' || this.bseat ? 1.25 : 1), wx);
    // génération à distance : au-delà du brouillard, rien n'est dessiné (îles, décor, objets)
    // le dôme du ciel reste toujours en deçà du plan lointain (sinon il est découpé : disque noir au centre de l'écran)
    const far = Math.max(900, this.scene.fog.far * 1.3);
    if (Math.abs(this.camera.far - far) > 5) { this.camera.far = far; this.camera.updateProjectionMatrix(); }
    this.sky.dome.scale.setScalar(far * 0.8 / 1800);
    this.brumeNow = sk.brume;
    this.water.update(this.t, this.camera.position, sk.sky, sk.sunDir, sk.fog, sk.brume * 0.5);
    this.decor.update(this.t, hour);
    this.island2.update(this.t, dt);
    this.island2.setStairGate(!!this.puzzles?.lift);   // escalier de la tour : ouvert une fois le séquenceur de l'ascenseur résolu
    this.updateLights(sk.brume);
    this.updateFunAnim(dt);
    for (const f of this.shopFlags || []) if (f.position.distanceToSquared(this.camera.position) < 250 * 250) waveFlag(f, this.t);
    this.skyLight = sk.sky.amb;
    this.updateProjectiles(dt);

    if (this.inGame() || this.mode === 'dead') {
      if (this.isAuthority()) {
        const targets = this.enemyTargets(), i3 = this.island3;
        const on3 = !!i3 && targets.some((q) => q.active && Math.hypot(q.pos.x - i3.cx, q.pos.z - i3.cz) < 420);
        const maxVoiles = CFG.combat.maxVoiles + 2 * (this.playerCount() - 1);
        this.enemies.update(dt, { players: targets, day: this.stats.days, chapter: this.chapter(), night: sk.brume, depth: this.nightDepth(), lights: this.lightSources(), maxVoiles, hordeMul: on3 ? CFG.combat.horde3 : 1, dayCap: on3 ? Math.round(maxVoiles * CFG.combat.day3) : 0, siege: this.siege.active ? { pos: this.island2.points.generator, active: true } : null });
        this.updateNightEvents(dt);
        this.updateSiege(dt);
        this.saveT += dt;
        if (this.saveT > 20) { this.saveT = 0; this.save(); }
      } else this.enemies.updateMirror(dt);
      this.updateRadar(dt);
      this.updateHose();
      this.updateWinch(dt);
      this.updateRepairBeacons();
      this.updateIron();
      this.updateDamageLook(dt);
      this.updateGroundItems();
      this.updateInvCtx();
      this.welding = Math.max(0, (this.welding || 0) - dt);
      // coque : puissance réduite si cabossé ; jauge affichée près de l'avion, à bord et en vol
      const php = this.planeHp();
      this.flight.hpMul = 0.55 + 0.45 * php / 100;
      const nearPlane = this.mode === 'flight' || this.aboard || this.playerWorld().distanceTo(this.plane.root.position) < 22;
      this.ui.planeHp?.(nearPlane && this.mode !== 'intro' ? php : null);
      this.updatePhysPuzzles(dt);
      this.updateVehicles(dt);
      this.gore?.update(dt);
      this.updateLoot();
      this.updateIndoorZombies();
      this.updateSelfAvatar(dt);
      this.updateChapter3(dt);
      this.updateChapter4(dt);
      this.updateTracker();
      this.updateBossHud();
      if (this.music) this.audio.setMusic(true, clamp(1 - this.camera.position.distanceTo(this.fun.boombox.pos) / 30, 0, 1));
      if (this.ui.visible('mapScreen')) this.drawMap();
    }
    this.mpUpdate(dt);
    if (this.inGame()) this.updateHudWatch(dt);
    // invite « Cliquez pour reprendre » : la souris n'est pas capturée alors qu'aucun menu n'est ouvert
    const needClick = this.inGame() && !this.input.active && !this.overlayOpen() && !this.chatting && !this.downed;
    if (needClick !== this._needClick) { this._needClick = needClick; this.ui.show('clickResume', needClick); }

    if (!this.ui.el.debug.classList.contains('hidden')) {
      const p = this.playerWorld();
      this.ui.debug(`mode ${this.mode}${this.aboard ? ' · à bord' : ''}${this.session ? ` · ${this.session.isHost ? 'hôte' : 'invité'} ${this.session.count()}j` : ''}\nheure ${this.clock()}${this.fast ? ' (×10)' : ''} · ${WX_LABEL[this.weather.kind]} (${this.wxLeft.toFixed(1)} h)\nx ${p.x.toFixed(1)} y ${p.y.toFixed(1)} z ${p.z.toFixed(1)}\nsol ${heightAt(p.x, p.z).toFixed(2)}\nsanté ${this.hp.toFixed(0)} · verrou ${this.flags.doorJam ? 'bloqué' : 'ok'}\ncarburant ${this.flight.fuel.toFixed(0)} % · ${this.flight.surface}\nennemis ${this.enemies.list.length} · île 2 : ${this.island2.cx.toFixed(0)}, ${this.island2.cz.toFixed(0)}`);
    }
  }

  updateMenu(dt) {
    const a = this.t * 0.11;
    const root = this.plane.root;
    const p = new THREE.Vector3(Math.cos(a) * 205, 72, Math.sin(a) * 205);
    const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    root.position.copy(p);
    root.lookAt(p.clone().sub(tan));
    root.rotateZ(0.32);
    this.plane.spinners.forEach((s) => { s.rotation.z += dt * 30; });
    const c = this.t * 0.035 + 2.2;
    this.camera.position.set(Math.cos(c) * 330, 120, Math.sin(c) * 330);
    this.camera.lookAt(-60, 8, 0);
  }

  updateFunAnim(dt) {
    for (const [id, m] of Object.entries(this.duckMeshes)) {
      if (!m.visible) continue;
      m.rotation.y += dt * 0.8;
      if (m.userData.float) m.position.y = 0.12 + Math.sin(this.t * 1.7 + id.length) * 0.06;
    }
    for (const m of Object.values(this.fuseMeshes)) if (m.visible) m.rotation.y += dt * 1.5;
    const F = this.fun;
    F.hammock.sling.rotation.x = Math.sin(this.t * (this.lying ? 1.1 : 0.7)) * (this.lying ? 0.12 : 0.05);
    F.boombox.group.children[0].scale.y = this.music ? 1 + Math.abs(Math.sin(this.t * 7.5)) * 0.06 : 1;
    const near = this.inGame() && (this.aboard || this.playerWorld().distanceTo(this.plane.root.localToWorld(PLANE_POINTS.door.clone())) < 6 || this.mateNearDoor());
    const want = near && !this.flight.airborne && !this.flags.doorJam ? 1 : 0;
    this.planeDoor += (want - this.planeDoor) * Math.min(1, dt * 4);
    this.plane.doorPivot.rotation.y = -this.planeDoor * 1.9;
    const tr = F.treasure;
    if (this.flags.treasure && tr.chest.position.y < tr.pos.y) tr.chest.position.y = Math.min(tr.pos.y, tr.chest.position.y + dt * 0.8);
    if (this.flags.treasure) tr.lid.rotation.x = Math.max(-1.6, tr.lid.rotation.x - dt * 1.2);
    if (this.flags.chest) F.survival.lid.rotation.x = Math.max(-1.7, F.survival.lid.rotation.x - dt * 1.5);
    if (F.harpoonRack.group.visible) F.harpoonRack.glow.rotation.z += dt;
    if (this.flags.doorOpen && this.doorAnim < 1) {
      this.doorAnim = Math.min(1, this.doorAnim + dt * 1.2);
      this.island.cabin.doorPivot.rotation.y = -1.75 * (1 - (1 - this.doorAnim) ** 3);
    }
  }

  // montre numérique du HUD : heure lisible + compte à rebours jusqu'à la nuit ou l'aube
  updateHudWatch(dt) {
    this._hwT = (this._hwT || 0) - dt;
    if (this._hwT > 0) return;
    this._hwT = 0.25;
    const h = ((this.hour % 24) + 24) % 24;
    const fmt = (x) => `${Math.floor(x)}h${String(Math.floor((x % 1) * 60)).padStart(2, '0')}`;
    const night = h >= 19 || h < 6.5;
    const until = night ? ((6.5 - h) + 24) % 24 : 19 - h;
    const el = document.getElementById('hudWatch');
    document.getElementById('hwTime').textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const wk = this.weather.kind;
    document.getElementById('hwIcon').textContent = wk === 'rain' || wk === 'storm' ? WX_ICON[wk] : night ? '☾' : wk === 'cloudy' ? WX_ICON.cloudy : h >= 17.5 ? '◐' : '☀';
    document.getElementById('hwNext').textContent = night ? `aube dans ${fmt(until)}` : `nuit dans ${fmt(until)}`;
    el.classList.toggle('night', night);
    el.classList.toggle('alarm', !night && until < 0.75);
  }

  // durée réelle d'une heure de jeu selon la taille de l'équipage
  secondsPerHour() { return 72 * [1.35, 1.15, 1, 1][Math.min(3, this.playerCount() - 1)]; }

  advanceTime(dt) {
    if (this.isAuthority()) {
      const mul = (this.fast ? CFG.time.debugFastForward : 1) * (this.isNight() && !this.siege.active ? 2.5 : 1);   // les nuits passent plus vite
      this.hour += (dt / this.secondsPerHour()) * mul;
      if (this.hour >= 24) this.hour -= 24;
    }
    const h = this.hour;
    if (h < 12 && h > 6) { this.flags.alarm = false; this.flags.h16 = false; this.flags.h18 = false; }
    if (!this.flags.h16 && h >= 16 && h < 18) { this.flags.h16 = true; this.ui.radio('Il est 16 h. Plus que trois heures avant la nuit. Prévoyez où vous dormirez.', () => this.audio.radio()); }
    if (!this.flags.h18 && h >= 18 && h < 18.5) {
      this.flags.h18 = true;
      this.ui.radio(this.flags.storm && !this.flags.stormOver ? '18 h. Tout le monde à la centrale ! Préparez-vous à tenir jusqu\'à 21 h.' : '18 h ! Mettez-vous à l\'abri : près d\'une lumière, ou dans l\'avion. La couchette est confortable, paraît-il.', () => this.audio.radio());
    }
    if (!this.flags.alarm && h >= CFG.time.alarmHour && h < CFG.time.nightHour + 1) {
      this.flags.alarm = true;
      this.audio.siren();
      this.ui.toast('18:30 — c\'est la merde', 'La nuit tombe à 19 h. Dormez dans l\'avion sur l\'eau, ou préparez-vous à vous battre près d\'une lumière.', 'bad', 8000);
    }
  }

  // lumières : feu, projecteurs, lanterne, aéroport, fusées
  lightSources() {
    const L = [{ p: this.island.fire.pos, r: CFG.lights.campfire }];
    if (this.installed.has('dashboard')) L.push({ p: this.plane.root.localToWorld(PLANE_POINTS.projector.clone().add(new THREE.Vector3(0, 0, -5))), r: CFG.lights.planeProjectors * (this.upgrades.has('lamps') ? 1.5 : 1) });
    if (this.upgrades.has('lamps') && this.planeLive) L.push({ p: this.plane.root.position, r: 11 });
    if (this.lanternOn()) L.push({ p: this.playerWorld(), r: CFG.lights.lantern });
    for (const m of this.mateLanterns()) L.push({ p: m, r: CFG.lights.lantern });
    return L.concat(this.island2.lights(), this.island3?.lights() || [], this.island4?.lights() || [], this.projectiles.lights());
  }
  lanternOn() { return this.mode === 'explore' && !this.aboard && !this.bseat && !this.downed && this.heldKey() === 'lantern' && this.oil > 0; }

  updateLights(b) {
    const f = this.island.fire;
    const flick = 0.85 + Math.sin(this.t * 13) * 0.08 + Math.sin(this.t * 29) * 0.06;
    f.flame.scale.set(1, flick, 1);
    f.flame2.scale.set(1, 2 - flick, 1);
    const h = ((this.hour % 24) + 24) % 24;
    const dusk = clamp(h > 12 ? (h - 17.5) / 1.5 : (7 - h) / 1, 0, 1);
    f.light.intensity = lerp(1, 12, Math.max(dusk, b)) * flick;
    f.light.distance = 26;
    const on = this.installed.has('dashboard') && (b > 0.05 || dusk > 0.6);
    this.plane.projLight.intensity = on ? 16 : 0;
    this.plane.projMat.color.set(on ? '#fff3c4' : '#555');
    const cabin = this.installed.has('dashboard') ? lerp(0.8, 3, Math.max(dusk, b)) : 0.4;
    this.plane.cabinLights[0].intensity = cabin * 1.4;
    this.plane.cabinLights[1].intensity = cabin * 0.8;
    const lant = this.lanternOn();
    this.lanternLight.intensity = lant ? lerp(1.5, 7, Math.max(dusk, b)) * (0.9 + Math.random() * 0.1) : 0;
    if (lant) { const p = this.playerWorld(); this.lanternLight.position.set(p.x - 0.3, p.y + 1.3, p.z); }
  }

  updateToxicity(dt, altitude, pos) {
    return this.updateNightExposure(dt, altitude, pos);
  }
  hurt(dmg, type, dir) {
    if (this.mode !== 'explore' || this.aboard || this.downed || this.bseat) return;
    if (this.godMode) return;
    // vêtements de protection (gilet, casque, veste militaire) ; pas contre les chutes ni le feu
    this.hp -= dmg * (type === 'la chute' || type === 'le feu' ? 1 : 1 - this.armor());
    if (dir && !this.driving && !this.riding) { const k = dir.k ?? 4; this.player.pos.x += dir.x * k * 0.12; this.player.pos.z += dir.z * k * 0.12; }
    if (this.gore && type !== 'fire' && type !== 'le feu') this.gore.blood(this.playerWorld().setY(this.playerWorld().y + 1.3), null, false);
    this.lastHurt = this.t;
    this.player.shake = 1;
    this.audio.hurt();
    this.ui.hurt(0.9);
    setTimeout(() => this.ui.hurt(this.hp < 30 ? 0.35 : 0), 250);
    if (type === 'crab') this.radioOnce('crabhit', 'Ils pincent fort, hein ? Clic gauche pour frapper. La clé à molette tape bien plus fort que vos poings.');
    if (this.hp <= 0 && !this.downed) this.die(type === 'voile' || type === 'runner' || type === 'warden' ? 'Les zombies vous ont eu' : type === 'kingcrab' ? 'Le Crabe-Roi vous a eu' : 'Vous vous êtes effondré');
  }
  onKill(e) {
    this.audio.hitShell();
    if (e.type === 'crab') { this.stats.crabs++; this.radioOnce('crabkill', 'Joli coup. Il en reste d\'autres sur les plages, gardez l\'œil ouvert.'); } else if (e.type !== 'kingcrab') this.stats.voiles++;
  }
  // mort : à terre en multijoueur (un coéquipier peut relever), écran de fin de journée en solo
  die(title) {
    if (this.session && this.session.count() > 1) { this.goDown(title); return; }
    this.mode = 'dead';
    this.input.unlock();
    this.audio.setEngine(0, 0);
    this.ui.prompt(''); this.ui.hold(0); this.ui.flight(false);
    this.closeModal(true);
    this.ui.deadTitle(title);
    this.ui.show('dead', true);
  }

  planeReady() { return this.installed.size === 6 && this.crateLoaded && !this.wreckActive(); }
  planeAfloat() { return this.installed.has('floats'); }

  planeColliders() {
    const root = this.plane.root;
    const cs = [];
    const y0 = root.position.y;
    // la porte cargo reste ouverte au passage quand l'escalier est là (on entre sans téléportation)
    const doorGap = this.stairsActive() && !this.flags.doorJam;
    const ring = (x, z, r, maxY) => { const w = root.localToWorld(new THREE.Vector3(x, 0, z)); cs.push({ type: 'circle', x: w.x, z: w.z, r, minY: y0 - 2.5, maxY: y0 + maxY }); };
    // fuselage : cercles serrés qui suivent la silhouette (nez étroit, cabine, queue effilée)
    for (let z = -6.0; z <= 9.21; z += 0.8) {
      if (doorGap && z > 0.5 && z < 3.5) continue;
      const r = z < -4 ? 1.1 : z <= 5 ? 1.5 : Math.max(0.45, 1.4 - (z - 5) * 0.22);
      // on peut marcher sur le toit de la cabine (au-dessus de 3,5 m, le fuselage ne repousse plus)
      ring(0, z, r, z >= -3.4 && z <= 5 ? 3.5 : 4);
    }
    // trou de la porte : le flanc gauche reste fermé
    if (doorGap) { ring(-0.75, 1.3, 0.75, 3.5); ring(-0.75, 2.1, 0.75, 3.5); ring(-0.75, 2.9, 0.75, 3.5); }
    if (this.installed.has('floats')) {
      for (const sx of [-2.3, 2.3]) for (let z = -4.4; z <= 4.9; z += 0.75) ring(sx, z, z < -3.4 || z > 4.4 ? 0.35 : 0.55, 0.7);
    }
    return cs;
  }

  // ── Barre d'outils ──────────────────────────────────────
  // ── Exploration (à pied, à bord, assis) ─────────────────
  updateExplore(dt) {
    const inp = this.input, ui = this.ui;
    this.advanceTime(dt);
    this.pushingT = Math.max(0, (this.pushingT || 0) - dt);

    // l'avion continue de vivre (pilote automatique, dérive) — simulé par son propriétaire
    if (this.planeLive && this.ownsPlane()) {
      const ev = this.flight.update(dt, inp, false);
      if (ev.includes('crash')) this.crash();
      if (ev.includes('bump')) { this.audio.clank(); this.bumpPlane(); }
      // plus personne à bord en plein vol : le pilote automatique lâche, l'avion finit par s'écraser
      if (this.flight.airborne && !this.aboard && !this.mateList().some((m) => m.aboard || m.mode === 'flight')) {
        this._emptyT = (this._emptyT || 0) + dt;
        if (this._emptyT > 4) { this.flight.autopilot = false; this.flight.throttle = 0; }
      } else this._emptyT = 0;
    }
    this.syncHeld();
    this.updatePlaneStairs();
    // assis dans le Boeing (pilote ou passager) : vol, caméra, cadrans
    if (this.bseat) {
      const blockedB = ui.modalOpen() || this.chatting || ui.visible('mapScreen') || this.invUi.isOpen;
      if (blockedB) { inp.mdx = 0; inp.mdy = 0; }
      this.updateBSeat(dt, blockedB);
      if (!blockedB) this.mpKeys();
      return;
    }
    const sig = this.wearSig();
    if (sig !== this._vmSig) { this._vmSig = sig; this.applyLook(); }
    if (this.planeLive && !this.driving) this.audio.setEngine(this.flight.airborne ? 0.4 + this.flight.throttle * 0.4 : 0, this.flight.throttle * 0.8);

    const invOpen = this.invUi.isOpen;
    if (inp.hit('KeyI') && !this.chatting && !ui.modalOpen()) this.toggleInventory();
    if (!this.aboard && !this.chatting && !invOpen && !this.driving) this.equipKeys(inp);
    this.invUi.hotbar(this.inv.eq, this.inv.sel, (it) => (it === 'oil' ? this.oil : this.itemInfo(it)));
    const gh = this.gunHud();
    if (gh !== this._gh) { this._gh = gh; document.getElementById('gunHud').innerHTML = gh ? `${gh.split(' · ')[0]}${gh.includes('recharge') ? '<small>rechargement…</small>' : ''}` : ''; }
    ui.el.hud.dataset.aboard = this.aboard ? '1' : '';

    const carnetOpen = inp.down('Tab') && !this.chatting;
    if (carnetOpen && !this._carnet) this.refreshCarnet();
    this._carnet = carnetOpen;
    ui.show('carnet', carnetOpen);
    const watchUp = inp.down('KeyT') && !carnetOpen && !this.chatting;
    // roue de messages rapides (X maintenu, en équipe)
    const wheelOn = !!this.session && inp.down('KeyX') && !carnetOpen && !this.chatting && !ui.modalOpen();
    if (wheelOn) {
      this.wheelV = this.wheelV || { x: 0, y: 0 };
      this.wheelV.x += inp.mdx; this.wheelV.y += inp.mdy;
      const v = this.wheelV, mag = Math.hypot(v.x, v.y);
      this.wheelSel = mag < 25 ? -1 : Math.abs(v.x) > Math.abs(v.y) ? (v.x > 0 ? 1 : 3) : (v.y > 0 ? 2 : 0);
      ui.wheel(true, this.wheelSel);
    } else if (this.wheelV) {
      if (this.wheelSel >= 0) this.quickMessage(this.wheelSel);
      this.wheelV = null; this.wheelSel = -1;
      ui.wheel(false);
    }
    if (inp.hit('KeyP') && !carnetOpen && !ui.modalOpen() && !this.chatting) this.wantPhoto = true;
    const blocked = carnetOpen || ui.modalOpen() || this.chatting || ui.visible('mapScreen') || wheelOn || invOpen;
    if (blocked) { inp.mdx = 0; inp.mdy = 0; }
    const P = CFG.player;
    let mv = { moving: false, sprint: false };

    this.plane.root.updateMatrixWorld(true);
    if (this.downed) {
      this.updateDowned(dt);
      this.player.yaw -= inp.mdx * P.mouseSensitivity * this.player.sens * 0.3;
      this.player.pitch = 0.4;
      this.player.applyCamera(dt, false, this.aboard ? this.plane.root : null, 0.4);
    } else if (this.driving) {
      this.updateDriving(dt, blocked);
      mv = { moving: this.moving, sprint: false };
    } else if (this.riding) {
      this.updateRiding(dt, blocked);
      mv = { moving: false, sprint: false };
    } else if (this.seat || this.lying) {
      this.player.yaw -= inp.mdx * P.mouseSensitivity * this.player.sens;
      this.player.pitch = clamp(this.player.pitch - inp.mdy * P.mouseSensitivity * this.player.sens, -1.3, 1.3);
      if (this.seat) this.player.applyCamera(dt, false, this.plane.root, 1.2 - (this.seat.bunk ? 0.55 : 0));
      else this.player.applyCamera(dt, false, null, 0.35);
    } else {
      const w = this.carrying ? this.carrying.def.weight : 0;
      const speedTable = this.carryMode === 'diable' ? CFG.carry.diable : CFG.carry.hand;
      if (this.stamina <= 0) this.exhausted = true;
      if (this.exhausted && this.stamina > 25) this.exhausted = false;
      const swim = this.swimming();
      const help = this.carryHelp();
      const mods = {
        canMove: !blocked,
        canSprint: (w <= 1 || this.carryMode === 'diable') && !this.exhausted && this.stamina > 0 && !swim,
        canJump: w <= 1 && !swim,
        speedMul: (w ? Math.min(0.95, speedTable[w] * (help ? 2.6 : 1)) : 1) * (swim ? CFG.swim.speed * this.swimMul() : 1),
      };
      this.player.radius = this.aboard ? 0.24 : undefined;
      if (!this.aboard && !this.hoist && !blocked && swim && !this.player.onLadder && inp.down('KeyW', 'ArrowUp')) this.tryClimbOut();
      if (this.hoist) mv = this.updateHoist(dt);
      else if (this.aboard) mv = this.player.update(dt, inp, cabinColliders(this.crateLoaded, this.upgrades), mods, this.cabinEnv());
      else mv = this.player.update(dt, inp, this.colliders.concat(this.planeColliders(), this.blockCols || [], this.vehicleCols || [], this.boeingCols || []), mods, this.worldEnv());
      if (!document.getElementById('optBob').checked) this.player.bob = 0;
      if (!this.hoist) this.updateFall(dt);
      const sprinting = mv.sprint && mv.moving && inp.down('ShiftLeft', 'ShiftRight');
      mv.sprint = sprinting;
      this.stamina = clamp(this.stamina + (sprinting ? -P.sprintCost : P.staminaRegen * (mv.moving ? 0.6 : 1)) * dt, 0, P.stamina);
      if (mv.moving) {
        const ph = Math.floor(this.player.bob / Math.PI);
        if (ph !== this.stepPhase) { this.stepPhase = ph; this.audio.step(!this.aboard && heightAt(this.player.pos.x, this.player.pos.z) < 0); }
      }
    }
    this.moving = mv.moving;
    this.sprinting = mv.sprint;
    if (!this.downed && this.t - this.lastHurt > P.regenDelay) this.hp = Math.min(P.health, this.hp + P.regenPerSecond * dt * (this.aboard && this.upgrades.has('rug') ? 2 : 1));
    ui.vitals(this.hp, this.stamina);
    if (this.hp > 30 && this.t - this.lastHurt > 0.3) ui.hurt(0);

    this.updateBoarding();
    this.updatePlaneRepair(dt);
    this.poseCarried();
    if (this.isAuthority()) this.updateSliding(dt);
    if (!blocked && !this.downed && !this.driving && !this.riding) this.handleInteractions(dt);
    else { ui.prompt(this.driving ? (this.vehiclePrompt || '') : ''); ui.hold(this.driving ? (this.vehicleHold || 0) : 0); }
    if (this.mode !== 'explore') return;
    if (this.driving) { if (!blocked && !this.chatting) this.mpKeys(); ui.compass(this.flags.compass, this.player.yaw); return; }
    const welding = !blocked && !this.downed && this.updateWeld(dt);
    const fishing = !blocked && !welding && !this.downed && this.updateFishing(dt);
    if (!blocked && !welding && !fishing && !this.aboard && !this.seat && !this.lying && !this.downed) this.handleAttack(dt);
    if (!blocked && !this.chatting) this.mpKeys();

    // lanterne
    if (this.hasItem('lantern')) {
      const nearFire = this.playerWorld().distanceTo(this.island.fire.pos) < 3.5;
      if (nearFire && this.oil < 100) { this.oil = Math.min(100, this.oil + CFG.lantern.refillPerSecond * dt); if (this.oil > 99 && !this._oilToast) { this._oilToast = true; ui.toast('Lanterne pleine', 'Rechargée au feu.', 'good', 1800); } } else this._oilToast = false;
      if (this.lanternOn()) { this.oil = Math.max(0, this.oil - (100 / CFG.lantern.oilSeconds) * dt); if (this.oil <= 0) ui.toast('Lanterne vide', 'Rechargez-la près du feu.', 'bad'); }
    }
    // harpons plantés : ramassés en passant
    if (!this.aboard && this.hasItem('harpoon')) {
      const n = this.projectiles.collect(this.player.pos);
      if (n) { this.giveItem('a_harpoon', n, {}, { toSlot: false, silent: true }); this.audio.pickup(); }
    }

    const exposed = this.updateToxicity(dt, 0, this.playerWorld());
    this.audio.setWind(exposed ? 0.16 : this.aboard ? 0.015 : 0.05, exposed ? 0.1 : 0.25);
    // aide des touches : n'apparaît qu'au changement de situation ou d'objet en main, puis s'efface
    if (this.seat) this.tipKeys('seat', '<kbd>E</kbd> se lever');
    else if (this.lying) this.tipKeys('lying', '<kbd>E</kbd> se lever du hamac');
    else if (this.riding) this.tipKeys('ride', `<kbd>E</kbd> descendre · <kbd>C</kbd> vue${this.held().kind === 'gun' ? ' · <kbd>Clic</kbd> tirer' : ''}`);
    else if (this.aboard) this.tipKeys('aboard', '<kbd>E</kbd> interagir · <kbd>I</kbd> inventaire');
    else {
      const H = this.held();
      const itemTips = {
        fists: '<kbd>Clic</kbd> frapper', diable: '<kbd>E</kbd> charger · <kbd>G</kbd> poser', lantern: 'Éclaire · recharge au feu',
        flare: '<kbd>Clic</kbd> tirer', harpoon: '<kbd>Clic</kbd> tirer', rod: '<kbd>Clic</kbd> lancer · ferrer · mouliner',
        talkie: '<kbd>B</kbd> parler', bandage: '<kbd>Clic</kbd> soigner', medkit: '<kbd>Clic</kbd> soigner', parachute: 'Chute libre : <kbd>Espace</kbd>',
        iron: '<kbd>Clic</kbd> maintenu : souder · <kbd>G</kbd> raccrocher',
      };
      const tip = H.kind === 'gun' ? '<kbd>Clic</kbd> tirer · <kbd>R</kbd> recharger' : H.kind === 'melee' && !itemTips[H.key] ? '<kbd>Clic</kbd> frapper' : itemTips[H.key] || '';
      const kt = this._kt || (this._kt = { seen: {} });
      if (kt.baseUntil === undefined) kt.baseUntil = this.t + 14;
      const first = this.t < kt.baseUntil;
      const base = first ? '<kbd>E</kbd> interagir · <kbd>I</kbd> inventaire · <kbd>1</kbd>–<kbd>6</kbd> équipement<br>' : '';
      this.tipKeys(`foot:${H.key}`, `${base}<b>${H.name}</b> · ${tip}`);
    }
    ui.flight(false);
    ui.compass(this.flags.compass, this.playerYawWorld());

    const hh = ((this.hour % 24) + 24) % 24;
    this.vm.update(dt, {
      slot: this.aboard ? -1 : this.slot, watchUp, carrying: !!this.carrying, moving: mv.moving, sprint: mv.sprint, hour: this.hour,
      alarm: hh >= CFG.time.alarmHour || hh < CFG.time.dawnHour, lanternOn: this.lanternOn(), light: this.aboard ? 0.9 : (this.skyLight ?? 1),
      hidden: carnetOpen || this.lying || invOpen, mdx: inp.mdx, mdy: inp.mdy, ammo: this.invCount(this.slot === 4 ? 'a_flare' : 'a_harpoon'),
      welding: this.welding > 0, talking: this.slot === 7 && this.voice.talking, radioIn: this.t - (this.radioInT || -9) < 0.4, aim: this.held().kind === 'gun' && inp.down('MouseR'), reeling: this.fishState === 'reel', rodPitch: this.fishState === 'reel' ? -0.3 : this.fishState === 'wait' || this.fishState === 'bite' ? -0.15 : 0,
    });

    if (!this.said.has('crab') && !this.aboard) {
      const pw = this.playerWorld();
      for (const e of this.enemies.list) {
        if (e.type === 'crab' && !e.dead && e.pos.distanceTo(pw) < 8) { this.radioOnce('crab', 'Attention, crabes mutés sur les plages. Frappez-les avec le clic gauche, et reculez entre deux coups.'); break; }
      }
    }
    if (this.chapter() === 2 && !this.flags.landed2 && !this.aboard && this.nearIsland() === 2 && heightAt(this.player.pos.x, this.player.pos.z) > 0) {
      this.act('flag', { landed2: true });
      this.ui.subtitle('<big>Saint-Escale</big>Aéroport abandonné · escale technique');
      setTimeout(() => this.ui.subtitle(''), 4500);
      this.radioOnce('landed2', 'Vous y êtes. Mauvaise nouvelle : sans courant, la pompe du ponton ne marchera pas. La centrale est à l\'ouest du terminal, il lui manque trois fusibles. Une affiche dans le hall doit dire où sont les rechanges.');
    }
    if (this.t - this.lastProgress > 150 && !this.flags.ended) { this.lastProgress = this.t; this.ui.radio(this.nextHint(), () => this.audio.radio()); }
  }

  debugRepairAll() {
    const first = this.chapter() === 1 && !this.flags.tookOff && !this.wreckActive();
    if (first) {
      for (const k of PART_ORDER) if (!this.installed.has(k)) this.act('install', { k, silent: true });
      if (!this.crateLoaded) this.act('crate', { silent: true });
      ['diable', 'wrench', 'lantern'].forEach((k) => { this.act('tool', { k, silent: true }); this.lootTaken[`tool:${k}`] = 'got'; if (!this.hasItem(k)) this.giveItem(k, 1, {}, { silent: true }); });
      this.placeTools();
    }
    // épave, trous, bosses : tout est remis à neuf (et l'épave remise à flot)
    this.act('fixAll');
    this.refreshCarnet();
    this.ui.toast('Admin · Coucou réparé', first ? 'Pièces posées, caisse chargée, outils donnés.' : 'Coque à 100 %, prêt à repartir.', 'good', 2600);
  }

  updatePlaneRepair(dt) {
    if (!this.planeAfloat() || this.planeLive || this.wreckActive()) return;
    const root = this.plane.root;
    if (this.planeLift < 1) {
      this.planeLift = Math.min(1, this.planeLift + dt * 0.5);
      const c = LAYOUT.crash, k = this.planeLift;
      root.position.set(c.x, lerp(-0.85, 0, k), c.z);
      root.rotation.set(lerp(WRECK_ROT.x, 0, k), Math.PI, lerp(WRECK_ROT.z, 0, k), 'YXZ');
      if (k >= 1) { this.flight.reset(c.x, c.z, Math.PI); this.planeLive = true; }
    }
  }

  // position d'un objet porté (par moi ou par un coéquipier)
  poseCarriedAt(it, pp, yawW, mode, bob = 0) {
    const fw = new THREE.Vector3(-Math.sin(yawW), 0, -Math.cos(yawW));
    const yaw = yawW + (it.def.carryYaw || 0);
    if (mode === 'hand') {
      const w = it.def.weight;
      const d = w === 1 ? 0.9 : w === 2 ? 1.5 : 1.9;
      const sway = Math.sin(bob * 0.5) * (w >= 2 ? 0.06 : 0.02);
      const x = pp.x + fw.x * d, z = pp.z + fw.z * d;
      const y = pp.y + (w === 1 ? 1.05 : w === 2 ? 0.75 : 0.35);
      it.mesh.position.set(x, Math.max(y, this.groundAt(x, z, pp.y + 0.5) + it.rest * 0.6), z);
      it.mesh.rotation.set((it.def.tilt || 0) + sway, yaw, sway * 2, 'YXZ');
      return null;
    }
    // la charge repose sur la pelle du diable, adossée aux montants
    const x = pp.x + fw.x * 1.95, z = pp.z + fw.z * 1.95;
    it.mesh.position.set(x, Math.max(this.groundAt(x, z, pp.y + 0.5), pp.y - 0.6) + it.rest * 0.85 + 0.12, z);
    it.mesh.rotation.set((it.def.tilt || 0) + 0.18, yaw, 0, 'YXZ');
    return { x: pp.x + fw.x * 1.45, z: pp.z + fw.z * 1.45, y: pp.y, yaw: yawW };
  }
  poseCarried() {
    const it = this.carrying;
    this.carryDiable.visible = false;
    if (!it) return;
    const d = this.poseCarriedAt(it, this.playerWorld(), this.playerYawWorld(), this.carryMode, this.player.bob);
    if (d) {
      this.carryDiable.visible = true;
      this.carryDiable.position.set(d.x, this.groundAt(d.x, d.z, d.y + 0.5), d.z);
      this.carryDiable.rotation.set(0.45, d.yaw, 0, 'YXZ');   // pelle vers l'avant, poignée vers le joueur
    }
  }

  updateSliding(dt) {
    for (const it of Object.values(this.items)) {
      if (it.state !== 'ground' || !it.sliding) continue;
      const s = slopeAt(it.pos.x, it.pos.z);
      if (s.s > CFG.carry.slideSlope) { it.vel.x -= s.gx * 7 * dt; it.vel.y -= s.gz * 7 * dt; }
      it.vel.multiplyScalar(Math.exp(-2.5 * dt));
      const nx = it.pos.x + it.vel.x * dt, nz = it.pos.z + it.vel.y * dt;
      if (heightAt(nx, nz) < -1.1) it.vel.set(0, 0); else { it.pos.x = nx; it.pos.z = nz; }
      this.poseGround(it);
      if (it.vel.length() < 0.05 && s.s <= CFG.carry.slideSlope) it.sliding = false;
    }
  }

  // ── Radar, objectif, carte ──────────────────────────────
  bearingTo(x0, z0, x1, z1) {
    let a = Math.atan2(x1 - x0, -(z1 - z0)) * 180 / Math.PI;
    if (a < 0) a += 360;
    return Math.round(a);
  }
  updateRadar(dt) {
    this._radarT = (this._radarT || 0) - dt;
    const I = this.island2, f = this.flight;
    if (!this.flags.discovered && this.chapter() === 2 && Math.hypot(f.pos.x - I.cx, f.pos.z - I.cz) < 700) {
      this.act('flag', { discovered: true });
      this.ui.toast('Terre en vue !', 'Saint-Escale, droit devant.', 'good', 5000);
      this.radioOnce('discovered', 'Saint-Escale ! L\'aéroport a été évacué la semaine dernière. Amerrissez dans la baie au sud : il y a une rampe et un ponton, avec la pompe à carburant.');
    }
    if (this._radarT > 0) return;
    this._radarT = 0.12;
    const contacts = [
      { x: 0, z: 0, label: 'Crash', color: '#ffd166', known: true },
      { x: I.cx, z: I.cz, label: this.flags.discovered || this.chapter() === 2 ? 'Saint-Escale' : '?', color: '#ff6b5b', known: this.flags.discovered },
    ];
    if (this.chapter() >= 3 && this.island3) contacts.push({ x: this.island3.cx, z: this.island3.cz, label: 'Port-Cendre', color: '#ff8a3a', known: true });
    if (this.chapter() >= 3 && this.island4) contacts.push({ x: this.island4.cx, z: this.island4.cz, label: 'Hélios', color: '#b8a4ff', known: true });
    if (this.mode === 'flight') drawRadar(document.getElementById('radar'), { x: f.pos.x, z: f.pos.z, yaw: f.yaw, t: this.t, contacts });
    else if (this.bseat && this.bf) drawRadar(document.getElementById('radar'), { x: this.bf.pos.x, z: this.bf.pos.z, yaw: this.bf.yaw, t: this.t, contacts, range: 3200 });
    if (this.installed.has('dashboard')) {
      const d = this.plane.parts.dashboard.userData;
      drawRadar(d.radarCanvas, { x: f.pos.x, z: f.pos.z, yaw: f.yaw, t: this.t, contacts });
      d.radarTex.needsUpdate = true;
    }
  }
  updateTracker() {
    const island = `Île ${this.nearIsland()} · ${this.islandName()}`;
    const o = this.currentObjective();
    let sub = o.hint || '';
    if (o.id === 'repair') {
      const next = PART_ORDER.find((k) => !this.installed.has(k));
      if (next) sub = `Prochaine pièce : ${ITEMS[next].name.toLowerCase()} · ${ITEMS[next].hint.toLowerCase()}`;
    }
    if (o.id === 'find') {
      const p = this.mode === 'flight' ? this.flight.pos : this.playerWorld();
      sub = `Cap ${this.bearingTo(p.x, p.z, this.island2.cx, this.island2.cz)}° · ${(Math.hypot(p.x - this.island2.cx, p.z - this.island2.cz) / 1000).toFixed(1)} km · carburant ${Math.round(this.flight.fuel)} %`;
    }
    if (o.id === 'fly4' && this.island4) {
      const p = this.bseat && this.bf ? this.bf.pos : this.playerWorld(), I = this.island4;
      sub = `Cap ${this.bearingTo(p.x, p.z, I.cx, I.cz)}° · ${(Math.hypot(p.x - I.cx, p.z - I.cz) / 1000).toFixed(1)} km · piste est-ouest, au sud de l'île`;
    }
    this.ui.tracker(island, o.text, sub);
  }
  toggleMap(force) {
    const on = force ?? !this.ui.visible('mapScreen');
    if (on && !this.mapBuilt) { this.map.build([{ x: 0, z: 0 }, { x: this.island2.cx, z: this.island2.cz }, { x: this.island3.cx, z: this.island3.cz }, { x: this.island4.cx, z: this.island4.cz }]); this.mapBuilt = true; }
    this.ui.show('mapScreen', on);
    if (on) this.drawMap();
  }
  drawMap() {
    const me = this.mode === 'flight' ? this.flight.pos : this.playerWorld();
    const yaw = this.mode === 'flight' ? this.flight.yaw : this.bseat ? this.bf.yaw : this.playerYawWorld();
    const bp = this.boeing?.root.position;
    this.map.draw(document.getElementById('mapCanvas'), {
      me: { x: me.x, z: me.z, yaw },
      mates: this.mateMarkers(),
      plane: this.mode === 'flight' || this.chapter() >= 4 ? null : { x: this.flight.pos.x || this.plane.root.position.x, z: this.plane.root.position.z, yaw: this.plane.root.rotation.y },
      boeing: this.chapter() >= 3 && bp && !this.bseat ? { x: bp.x, z: bp.z, yaw: this.boeing.root.rotation.y } : null,
      i4: this.island4 ? { x: this.island4.cx, z: this.island4.cz } : null,
      hideIsland4: this.chapter() < 3,
      objective: this.objectivePoint(),
      pings: this.pings.map((p) => ({ x: p.pos.x, z: p.pos.z, color: p.color })),
      hideIsland2: this.chapter() === 1 && !this.flags.discovered,
      i2: { x: this.island2.cx, z: this.island2.cz },
      i3: { x: this.island3.cx, z: this.island3.cz },
      hideIsland3: this.chapter() < 3,
      shops: this.shopSpots().filter((s) => s.island <= Math.max(this.chapter(), this.flags.discovered ? 2 : 1)),
      vehicles: Object.values(this.vehicles).map((v) => ({ x: v.x, z: v.z })),
    });
  }
  // boutiques (comptoirs d'échange) : caisse de Jo, bar de l'Escale, boutique hors taxes de Port-Cendre
  shopSpots() {
    const out = [{ island: 1, x: LAYOUT.camp.x + 2.2, z: LAYOUT.camp.z + 1.5, label: 'Jo' }];
    if (this.island2) out.push({ island: 2, x: this.island2.points.bar.x, z: this.island2.points.bar.z, label: 'Bar de l\'Escale' });
    if (this.island3) out.push({ island: 3, x: this.island3.points.shop.x, z: this.island3.points.shop.z, label: 'Hors taxes' });
    if (this.island4) out.push({ island: 4, x: this.island4.points.shop.x, z: this.island4.points.shop.z, label: 'Relais Soleil-Levant' });
    return out;
  }

  // ── Vol ─────────────────────────────────────────────────
  parkAt(island) {
    if (island === 3) { const p = this.island3.points.park; this.flight.wheels = true; this.flight.reset(p.x, p.z, Math.PI / 2); }
    else if (island === 2) { const p = this.island2.points.park; this.flight.reset(p.x, p.z, I2.park.yaw); }
    else this.flight.reset(LAYOUT.crash.x, LAYOUT.crash.z, Math.PI);
    this.planeLift = 1;
  }

  updateFlight(dt) {
    const inp = this.input, ui = this.ui, f = this.flight;
    this.advanceTime(dt);
    const wasGround = f.surface === 'ground';
    f.noTakeoff = this.flags.storm && !this.flags.stormOver && this.nearIsland(f.pos) === 2;
    // chapitre 3 : le moteur droit surchauffe en approche de Port-Cendre
    if (this.chapter() === 3 && this.island3) {
      const d3 = Math.hypot(f.pos.x - this.island3.cx, f.pos.z - this.island3.cz);
      if (!this.flags.fire3 && d3 < 560 && f.airborne) this.act('flag', { fire3: true });
      if (this.flags.fire3) { f.powerMul = Math.min(f.powerMul, this.flags.fireOut ? 0.35 : 0.5); if (!f.airborne) f.noTakeoff = true; }
      if (this.flags.fire3 && !this.flags.landed3 && !f.airborne && f.speed < 2 && d3 < 420) this.act('flag', { landed3: true });
    }
    const ev = f.update(dt, inp, true);
    f.updateCamera(dt);
    this.audio.setEngine(f.fuel > 0 ? 0.35 + f.throttle * 0.65 : 0, f.throttle * 0.8 + Math.min(f.speed / 35, 1) * 0.3);
    this.audio.setWind(f.onWater ? 0.03 : clamp(f.speed / 40, 0.05, 0.25), 0.8);
    for (const e of ev) {
      if (e === 'takeoff') {
        this.audio.splash();
        if (!this.flags.tookOff) {
          this.act('flag', { tookOff: true });
          this.audio.success();
          ui.toast('Le Coucou vole !', 'Réservoir percé : cap sur Saint-Escale (écho rouge).', 'good', 6000);
          this.radioOnce('takeoff', `Vous volez ! … Attendez. Votre jauge : le réservoir a été percé dans le crash, la moitié s'est vidée sur la plage. Vous n'atteindrez jamais Hélios comme ça. L'aéroport le plus proche, c'est Saint-Escale : cap ${this.bearingTo(f.pos.x, f.pos.z, this.island2.cx, this.island2.cz)}°, l'écho sur votre radar. On y fera le plein.`);
        }
        if (this.chapter() === 2 && this.nearIsland(f.pos) === 2 && this.flags.stormOver && this.flags.refueled && !this.flags.tookOff2) this.act('flag', { tookOff2: true });
        void wasGround;
      } else if (e === 'gusts') ui.toast('Rafales de tempête', 'Décollage impossible avant 21 h : le vent plaque l\'avion au sol.', 'bad', 3500);
      else if (e === 'landed') { this.audio.splash(); ui.toast('Amerrissage réussi', 'À l\'arrêt, <kbd>E</kbd> pour quitter le siège.', 'good'); }
      else if (e === 'landed_ground') ui.toast('Atterrissage', 'Sur roues. Joli.', 'good');
      else if (e === 'beach') ui.toast('Échoué sur le sable', 'Faites demi-tour avec <kbd>Q</kbd>/<kbd>D</kbd>.', 'bad');
      else if (e === 'rough') ui.toast('Terrain trop accidenté', 'Restez sur la rampe, le tarmac ou la piste.', 'bad');
      else if (e === 'on_ground') ui.toast('Sur roues', 'Le Coucou sort de l\'eau.', 'good');
      else if (e === 'ap_on') ui.toast('Pilote automatique', '<kbd>E</kbd> se lever', 'good', 2500);
      else if (e === 'ap_off') ui.toast('Pilote automatique coupé', '');
      else if (e === 'fuel_out') { ui.toast('Panne sèche !', 'Planez jusqu\'à l\'eau. Un bidon de secours est dans la cabine.', 'bad', 7000); this.radioOnce('fuel', 'Panne sèche ? Posez-vous sur l\'eau, il y a un bidon de secours au fond de la cabine.'); }
      else if (e === 'crash') { this.crash(); return; }
      else if (e === 'bump') { this.audio.clank(); this.bumpPlane(); ui.toast('Choc', `Coque ${Math.round(this.planeHp())} %`, 'bad', 1200); }
    }
    if (inp.hit('KeyE')) this.leaveControls();
    const exposed = this.updateToxicity(dt, f.onWater ? 0 : f.pos.y, f.pos);
    let state = f.onWater ? (f.speed < 1 ? 'À l\'arrêt sur l\'eau' : f.speed >= CFG.flight.takeoffSpeed ? 'Vitesse de décollage : tirez !' : 'Sur l\'eau')
      : f.surface === 'ground' ? (f.noTakeoff ? 'Tempête : décollage bloqué' : f.braking ? 'Freinage' : f.speed >= CFG.flight.takeoffSpeed ? 'Vitesse de décollage : tirez !' : 'Au sol, sur roues')
        : f.speed < CFG.flight.stallSpeed ? 'Décrochage ! Piquez du nez' : f.autopilot ? 'Pilote automatique' : 'En vol';
    if (f.fuel <= 0) state = 'Panne sèche !';
    ui.flight(true, { speed: f.speed, alt: f.surface === 'ground' ? 0 : f.pos.y, throttle: f.throttle, fuel: f.fuel, state, hull: this.planeHp() });
    this.tipKeys('flight', document.getElementById('optHints').checked ? `<kbd>Z</kbd>/<kbd>S</kbd> gaz · <kbd>Q</kbd>/<kbd>D</kbd> palonnier${f.wheels ? ' · <kbd>Espace</kbd> frein (au sol)' : ''}<br>Souris ou flèches : manche<br><kbd>P</kbd> pilote auto · <kbd>C</kbd> vue · <kbd>M</kbd> carte<br><kbd>E</kbd> quitter le siège` : '');
    ui.compass(this.flags.compass, f.yaw);
  }

  endDemo() {
    this.act('flag', { ended: true });
    this.fx('ended');
  }
  showEnd() {
    this.audio.success();
    const mins = Math.round((performance.now() - this.stats.t0) / 60000);
    document.getElementById('endStats').innerHTML = [
      [`${mins} min`, 'de jeu'], [`${this.stats.days}`, `jour${this.stats.days > 1 ? 's' : ''} survécu${this.stats.days > 1 ? 's' : ''}`],
      [`${this.ducks.size}/${this.duckSpots.length}`, 'canards'], [`${[this.flags.kingDead, this.flags.wardenDead].filter(Boolean).length}/2`, 'boss vaincus'], [`${this.chapter()}/4`, 'chapitres'],
    ].map(([b, s]) => `<li><b>${b}</b><span>${s}</span></li>`).join('');
    const final = this.flags.cured;
    document.querySelector('#endScreen .sticker').textContent = final ? 'fin de l\'aventure' : 'fin de la démo';
    document.querySelector('#endScreen h2').textContent = final ? 'Hélios est sauvée' : 'Cap sur Hélios';
    document.querySelector('#endScreen .pauseCard > p').textContent = final ? 'La caisse a tenu jusqu\'au bout. Dans la salle blanche, Marthe a pris la première dose, et la fièvre recule déjà. Demain, le vol HX-404 repartira chargé de remèdes pour toutes les îles de l\'archipel. Merci d\'avoir joué !' : 'Le Coucou file vers l\'est avec la caisse Hélios dans la soute. Marthe a allumé la cafetière.';
    document.querySelector('#btnEndFly span').textContent = final ? 'Continuer à explorer' : 'Continuer à voler';
    setTimeout(() => {
      this.input.unlock();
      this.ui.show('endScreen', true);
    }, final ? 5500 : 2500);
  }

  // crash : l'avion se disloque (voir wreck.js)
  crash() {
    if (!this.ownsPlane() || this.flags.wrecked) return;
    // à Port-Cendre, le moteur en feu : atterrissage forcé plutôt qu'épave (le Coucou ne revolera plus)
    if (this.flags.fire3) {
      const f = this.flight;
      f.speed = 0; f.throttle = 0;
      const g = heightAt(f.pos.x, f.pos.z);
      if (g > -0.45) { f.surface = 'ground'; f.pos.y = g + 0.1; f.wheels = true; } else { f.surface = 'water'; f.pos.y = 0; }
      f.pitch = 0; f.roll = 0;
      this.audio.clank(); this.player.shake = 1;
      this.ui.toast('Atterrissage forcé !', 'Sortez de l\'avion, vite.', 'bad', 5000);
      if (!this.flags.landed3) this.act('flag', { landed3: true });
      return;
    }
    // la violence de l'impact décide des dégâts : simple atterrissage brutal, ou épave
    const f = this.flight;
    const sev = this.impactSeverity();
    const g = heightAt(f.pos.x, f.pos.z);
    const settle = sev < 0.3 && (g < -0.6 || (this.flags.wheels && g > -0.6)) && f.pos.y - Math.max(g, 0) < 3;
    if (settle) { this.hardLanding(sev); return; }
    this.wreckPlane('crash', Math.max(0.3, sev));
  }
}

Object.assign(Game.prototype, WorldMixin, InteractMixin, MPMixin, CombatMixin, NightMixin, WeatherMixin, CamClipMixin,WreckMixin, FishingMixin, SavesMixin, PhysPuzzleMixin, VehicleMixin, Chapter3Mixin, Chapter4Mixin, ArmsMixin, InventoryMixin, LootMixin, PlanePushMixin, AdminMixin);
