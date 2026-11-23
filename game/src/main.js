// Vista Bay — main game: player on foot and in cars, third-person camera,
// pistol + melee combat, the 5-star wanted system, police response, explosions,
// beacons, save/load, menus and the render loop.
import * as THREE from 'three';
import { CITY, HALF, ROADS, TUNE } from './config.js';
import { mulberry32, clamp, circleVsBox, dist2 } from './util.js';
import { City } from './city.js';
import { Traffic } from './vehicles.js';
import { People, makePersonMesh } from './people.js';
import { MissionEngine } from './missions.js';
import { HUD } from './hud.js';
import { SoundBank } from './audio.js';
import { Input } from './input.js';
import { applyShot } from './shots.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87bfe8);
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 40, 80);
    this.camera.lookAt(0, 0, 0);

    this.params = new URLSearchParams(location.search);
    this.seed = Number(this.params.get('seed') || 20261123);
    this.rng = this.makeRng(this.seed);

    this.city = new City(this.scene, this.rng);
    this.traffic = new Traffic(this.scene, this.city, this.rng);
    this.people = new People(this.scene, this.city, this.rng);
    this.missions = new MissionEngine(this);
    this.hud = new HUD(this);
    this.sound = new SoundBank();
    this.input = new Input(this.canvas);
    this.input.attachGame(this);

    this.player = {
      x: 0, z: 24, heading: 0, pitch: -0.12, health: TUNE.playerHealth,
      mag: TUNE.pistolMag, reserve: TUNE.pistolReserve,
      inCar: false, car: null, lastDamageAt: -99, reloadTimer: 0,
    };
    this.cash = 0;
    this.heat = 0;
    this.wantedStars = 0;
    this.lastCrimeAt = -99;
    this.playing = false;
    this.paused = false;
    this.mapOpen = false;
    this.playerDead = false;
    this.time = 0;
    this.shotsFiredRecently = 0;
    this.tracers = [];
    this.explosions = [];
    this.shake = 0;
    this.roadblockSpawned = false;
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();

    // The player's own visible character (third-person camera).
    this.playerMesh = makePersonMesh(0x2e6db0, 0x2c343c, 0xe8b88a);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.4, 1.05, 0.3);
    this.playerMesh.add(gun);
    this.scene.add(this.playerMesh);

    // Mission beacon: a glowing pillar + floating diamond at the objective.
    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.beaconTop = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.4),
      new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.beaconTop.visible = false;
    this.scene.add(this.beaconTop);

    window.addEventListener('resize', () => this.onResize());
    this.wireMenus();
    this.hud.refreshMenu(this.loadSave());
    this.hud.showMenu(true);
    this.hud.showHud(false);

    // Screenshot staging (used by the maker only, via ?shot=...).
    this.shotMode = applyShot(this, this.params);
    this.animate();
  }
  makeRng(seed) { return mulberry32(seed); }
  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  // ---------- save / load ----------
  loadSave() {
    try { return JSON.parse(localStorage.getItem(TUNE.saveKey) || 'null'); } catch { return null; }
  }
  save() {
    try {
      localStorage.setItem(TUNE.saveKey, JSON.stringify({
        cash: this.cash,
        missionIndex: this.missions.missionIndex,
        health: Math.round(this.player.health),
        mag: this.player.mag, reserve: this.player.reserve,
        x: this.player.x, z: this.player.z, heading: this.player.heading,
      }));
    } catch { /* storage unavailable: play on without saving */ }
  }
  clearSave() { try { localStorage.removeItem(TUNE.saveKey); } catch { /* ignore */ } }

  // ---------- menus ----------
  wireMenus() {
    document.getElementById('btnplay').addEventListener('click', () => { this.sound.ensure(); this.sound.click(); this.startGame({ fresh: false }); });
    document.getElementById('btncontinue').addEventListener('click', () => { this.sound.ensure(); this.sound.click(); this.startGame({ fresh: false }); });
    document.getElementById('btnnew').addEventListener('click', () => { this.sound.ensure(); this.sound.click(); this.clearSave(); this.startGame({ fresh: true }); });
    document.getElementById('btnresume').addEventListener('click', () => this.togglePause(false));
    document.getElementById('btnrestart').addEventListener('click', () => {
      this.togglePause(false);
      this.missions.startMission(this.missions.missionIndex);
      this.respawnAtHospital(false);
      this.hud.toast('Mission restarted');
    });
    document.getElementById('btnquit').addEventListener('click', () => {
      this.save(); this.togglePause(false); this.playing = false;
      this.hud.showHud(false); this.hud.refreshMenu(this.loadSave()); this.hud.showMenu(true);
      if (document.pointerLockElement) document.exitPointerLock();
    });
    this.canvas.addEventListener('click', () => {
      if (this.mapOpen) { this.mapOpen = false; this.hud.toggleBigmap(false); }
    });
    // Losing the mouse lock mid-game pauses, like Esc does.
    document.addEventListener('pointerlockchange', () => {
      if (this.playing && !this.paused && !this.mapOpen && !document.pointerLockElement && !this.shotMode) {
        this.togglePause(true);
      }
    });
  }
  lockPointer() {
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* headless or no gesture: play on without pointer lock */ }
  }
  showMenuOnly() {
    this.hud.showMenu(true);
    this.hud.showHud(false);
  }
  startGame({ fresh, silent }) {
    const save = fresh ? null : this.loadSave();
    this.cash = save ? save.cash : 0;
    this.player.health = save ? save.health : TUNE.playerHealth;
    this.player.mag = save ? save.mag : TUNE.pistolMag;
    this.player.reserve = save ? save.reserve : TUNE.pistolReserve;
    this.player.x = save ? save.x : 0;
    this.player.z = save ? save.z : 24;
    this.player.heading = save ? save.heading : 0;
    this.player.inCar = false; this.player.car = null;
    this.heat = 0; this.wantedStars = 0;
    this.playerDead = false; this.paused = false; this.mapOpen = false;
    this.playing = true;
    this.hud.showMenu(false);
    this.hud.showPause(false);
    this.hud.showHud(true);
    this.missions.missionIndex = save ? save.missionIndex : 0;
    this.missions.stepIndex = 0;
    this.missions.state = 'idle';
    if (!silent) this.sound.ensure();
    this.missions.startMission(this.missions.missionIndex);
    this.lockPointer();
  }
  togglePause(on) {
    if (!this.playing) return;
    this.paused = on;
    this.hud.showPause(on);
    if (on) { this.hud.pauseStats(); if (document.pointerLockElement) document.exitPointerLock(); }
    else this.lockPointer();
  }
  teleportPlayer(x, z, heading) {
    this.player.x = x; this.player.z = z;
    if (heading !== undefined) this.player.heading = heading;
    if (this.player.inCar && this.player.car) {
      this.player.car.x = x; this.player.car.z = z; this.player.car.heading = heading;
    }
  }

  // ---------- wanted system ----------
  addHeat(n) {
    this.heat = clamp(this.heat + n, 0, 100);
    this.lastCrimeAt = this.time;
    this.updateStars();
  }
  updateStars() {
    const stars = this.heat <= 0 ? 0 : Math.min(5, Math.ceil(this.heat / 20));
    if (stars !== this.wantedStars) {
      this.wantedStars = stars;
      if (stars >= 4 && !this.roadblockSpawned) { this.roadblockSpawned = true; this.spawnRoadblock(); }
      if (stars === 0) this.roadblockSpawned = false;
    }
  }
  clearWanted() {
    this.heat = 0; this.wantedStars = 0; this.roadblockSpawned = false;
    this.traffic.removePoliceCars();
    this.people.clearCops();
  }
  spawnRoadblock() {
    const p = this.player;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    for (const side of [-1, 1]) {
      const bx = p.x + fx * 46 + fz * side * 3;
      const bz = p.z + fz * 46 - fx * side * 3;
      const car = this.traffic.spawnPoliceCar(bx, bz);
      car.driver = null; // parked across the road
      car.heading = p.heading + Math.PI / 2;
      car.syncMesh();
    }
    this.hud.toast('⚠ ROADBLOCK AHEAD — 4 stars!');
    this.sound.horn();
  }
  spawnPoliceForShot() {
    for (let i = 0; i < 3; i++) {
      const c = this.traffic.spawnPoliceCar(this.player.x - 18 - i * 10, this.player.z - 24 + i * 6);
      c.speed = 16;
    }
  }
  maintainPolice(dt) {
    if (this.wantedStars === 0) return;
    const wantCars = this.wantedStars * TUNE.copCarPerStar;
    if (this.traffic.policeCars.length < wantCars && Math.random() < dt * 0.8) {
      const a = this.rng() * Math.PI * 2;
      const d = 70 + this.rng() * 40;
      const x = clamp(this.player.x + Math.sin(a) * d, -290, 290);
      const z = clamp(this.player.z + Math.cos(a) * d, -290, 290);
      this.traffic.spawnPoliceCar(x, z);
    }
    const wantCops = this.player.inCar ? 0 : this.wantedStars;
    if (this.people.cops.length < wantCops && Math.random() < dt * 0.5) {
      const a = this.rng() * Math.PI * 2;
      this.people.spawnCop(
        clamp(this.player.x + Math.sin(a) * 26, -290, 290),
        clamp(this.player.z + Math.cos(a) * 26, -290, 290));
    }
    // Heat decays when the player lays low.
    if (this.time - this.lastCrimeAt > 6) {
      this.heat = Math.max(0, this.heat - TUNE.heatDecay * dt);
      this.updateStars();
      if (this.heat === 0) { this.traffic.removePoliceCars(); this.people.clearCops(); }
    }
  }

  // ---------- combat ----------
  shootableMeshes() {
    const list = [];
    for (const g of this.people.goons) if (g.alive) { g.mesh.userData.personRef = g; list.push(g.mesh); }
    for (const g of this.people.cops) if (g.alive) { g.mesh.userData.personRef = g; list.push(g.mesh); }
    for (const g of this.people.peds) if (g.alive) { g.mesh.userData.personRef = g; list.push(g.mesh); }
    for (const c of this.traffic.cars) if (c.alive) { c.mesh.userData.carRef = c; list.push(c.mesh); }
    return list;
  }
  shoot() {
    const p = this.player;
    if (p.reloadTimer > 0) return;
    if (p.mag <= 0) { this.sound.empty(); this.reload(); return; }
    p.mag--;
    this._lastShot = this.time;
    this.sound.shoot();
    this.shotsFiredRecently = 1.2;
    this.shake = Math.min(this.shake + 0.12, 0.3);
    this.addHeat(3);
    this.raycaster.setFromCamera({ x: 0, y: 0 }, this.camera);
    this.raycaster.far = 120;
    const hits = this.raycaster.intersectObjects(this.shootableMeshes(), true);
    const from = this.camera.position.clone();
    let end = from.clone().add(this.camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(90));
    if (hits.length) {
      const hit = hits[0];
      end = hit.point.clone();
      let obj = hit.object;
      while (obj && !obj.userData.personRef && !obj.userData.carRef) obj = obj.parent;
      if (obj) {
        if (obj.userData.personRef) {
          const person = obj.userData.personRef;
          person.damage(TUNE.pistolDamage, this);
          this.sound.hit();
          if (person.kind === 'ped') this.addHeat(12);
          if (person.kind === 'cop') this.addHeat(25);
          if (person.kind === 'goon') this.addHeat(4);
        } else if (obj.userData.carRef) {
          obj.userData.carRef.damage(TUNE.pistolDamage, this);
          this.sound.hit();
        }
      }
    }
    this.addTracer(from, end);
    if (p.mag === 0) this.reload();
  }
  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }
  punch() {
    const p = this.player;
    this.sound.punch();
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    const all = [...this.people.goons, ...this.people.cops, ...this.people.peds];
    for (const person of all) {
      if (!person.alive) continue;
      const dx = person.x - p.x, dz = person.z - p.z;
      if (dx * dx + dz * dz < TUNE.punchRange * TUNE.punchRange && dx * fx + dz * fz > 0) {
        person.damage(TUNE.punchDamage, this);
        if (person.kind === 'ped') this.addHeat(10);
        if (person.kind === 'cop') this.addHeat(20);
        this.sound.hit();
        return;
      }
    }
    for (const c of this.traffic.cars) {
      if (!c.alive) continue;
      const dx = c.x - p.x, dz = c.z - p.z;
      if (dx * dx + dz * dz < 9 && dx * fx + dz * fz > 0) { c.damage(TUNE.punchDamage, this); return; }
    }
  }
  reload() {
    const p = this.player;
    if (p.reloadTimer > 0 || p.mag === TUNE.pistolMag || p.reserve <= 0) return;
    p.reloadTimer = 1.1;
    this.sound.reload();
  }
  finishReload() {
    const p = this.player;
    const need = TUNE.pistolMag - p.mag;
    const take = Math.min(need, p.reserve);
    p.mag += take; p.reserve -= take;
  }
  goonShoot(goon, dist) {
    this.sound.enemyShoot();
    const from = new THREE.Vector3(goon.x, 1.4, goon.z);
    const to = new THREE.Vector3(this.player.x, this.player.inCar ? 1.0 : 1.3, this.player.z);
    this.addTracer(from, to);
    const hitChance = clamp(0.55 - dist * 0.012, 0.12, 0.55);
    if (Math.random() < hitChance) this.damagePlayer(TUNE.goonDamage, 'goon');
  }
  damagePlayer(amount, source) {
    const p = this.player;
    if (this.playerDead || !this.playing) return;
    p.health -= amount;
    p.lastDamageAt = this.time;
    this.shake = Math.min(this.shake + 0.25, 0.5);
    if (p.health <= 0) this.wasted(`Shot down by ${source === 'goon' ? 'Kane\u2019s crew' : source}.`);
  }
  hitPlayerByCar(car) {
    this.damagePlayer(14, 'a speeding car');
    const p = this.player;
    const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz) || 1;
    p.x += (dx / d) * 1.6; p.z += (dz / d) * 1.6;
    this.sound.crash();
  }
  onPoliceRam() { this.sound.crash(); this.shake = Math.min(this.shake + 0.2, 0.5); }
  onCrash(speed) { this.sound.crash(); this.shake = Math.min(this.shake + speed * 0.02, 0.6); this.damagePlayer(Math.max(0, speed - 12), 'a crash'); }
  onPersonKilled(person) {
    person.remove();
    if (person.kind === 'goon') this.missions.onKill();
    else if (person.kind === 'ped') { this.addHeat(18); this.hud.toast('A civilian is down — the police are coming'); }
    else if (person.kind === 'cop') { this.addHeat(30); this.hud.toast('You killed a cop — 5 stars incoming'); }
  }
  explodeCar(car) {
    const pos = new THREE.Vector3(car.x, 1, car.z);
    const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7a1e, transparent: true, opacity: 0.95 }));
    boom.position.copy(pos);
    this.scene.add(boom);
    const light = new THREE.PointLight(0xff8a2a, 60, 40);
    light.position.copy(pos).y = 3;
    this.scene.add(light);
    this.explosions.push({ mesh: boom, light, life: 0.9, max: 0.9 });
    this.sound.explosion();
    this.shake = 0.7;
    // Splash damage.
    const p = this.player;
    const d2 = dist2(p.x, p.z, car.x, car.z);
    if (d2 < 100) this.damagePlayer(30, 'an explosion');
    for (const g of this.people.goons) if (g.alive && dist2(g.x, g.z, car.x, car.z) < 64) g.damage(80, this);
    for (const o of this.traffic.cars) {
      if (o !== car && o.alive && dist2(o.x, o.z, car.x, car.z) < 49) o.damage(60, this);
    }
    if (this.player.inCar && this.player.car === car) this.exitCar(true);
    car.remove();
    const i = this.traffic.cars.indexOf(car);
    if (i >= 0) this.traffic.cars.splice(i, 1);
  }

  // ---------- busted / wasted ----------
  loseCashFraction() {
    const lost = Math.floor(this.cash * TUNE.bustedCashLoss);
    this.cash -= lost;
    return lost;
  }
  respawnAtHospital(keepCar) {
    const p = this.player;
    if (p.inCar && p.car) { p.car.driver = null; p.car.speed = 0; }
    p.inCar = false; p.car = null;
    p.x = -120; p.z = 96; p.heading = Math.PI;
    p.health = TUNE.playerHealth;
    this.playerDead = false;
    this.clearWanted();
    this.save();
  }
  busted(reason) {
    if (this.playerDead) return;
    this.playerDead = true;
    const lost = this.loseCashFraction();
    this.sound.busted();
    this.hud.showWasted('BUSTED', `${reason} — you lost $${lost.toLocaleString('en-US')} (20% of your cash).`);
    setTimeout(() => this.respawnAtHospital(false), 1200);
  }
  wasted(reason) {
    if (this.playerDead) return;
    this.playerDead = true;
    const lost = this.loseCashFraction();
    this.sound.busted();
    this.hud.showWasted('WASTED', `${reason} — you lost $${lost.toLocaleString('en-US')} (20% of your cash).`);
    setTimeout(() => this.respawnAtHospital(false), 1200);
  }

  // ---------- cars ----------
  nearestCar(maxDist) {
    let best = null, bestD = maxDist * maxDist;
    for (const c of this.traffic.cars) {
      if (!c.alive) continue;
      const d2 = dist2(this.player.x, this.player.z, c.x, c.z);
      if (d2 < bestD) { best = c; bestD = d2; }
    }
    return best;
  }
  enterCar(car, silent) {
    const p = this.player;
    if (car.driver === 'traffic') this.addHeat(20); // stealing a car with a driver
    else if (car.driver === 'police') {
      this.addHeat(30);
      // A stolen police car stops counting as a responder: the wanted system
      // must not chase the player with their own car, or delete it on cleanup.
      const i = this.traffic.policeCars.indexOf(car);
      if (i >= 0) this.traffic.policeCars.splice(i, 1);
    }
    else this.addHeat(10);
    car.driver = 'player';
    car.isPlayerCar = true;
    p.inCar = true; p.car = car;
    this.sound.horn();
    if (!silent) this.hud.toast(`You took the ${car.model} — drive!`);
  }
  exitCar(destroyed) {
    const p = this.player;
    if (!p.car) return;
    const car = p.car;
    car.driver = null;
    car.isPlayerCar = false;
    car.speed = 0;
    p.inCar = false; p.car = null;
    p.x = car.x + Math.cos(car.heading) * 2.2;
    p.z = car.z - Math.sin(car.heading) * 2.2;
    p.heading = car.heading;
    if (!destroyed) this.sound.click();
  }

  // ---------- per-frame update ----------
  step(dt, silent) {
    this.time += dt;
    this.shotsFiredRecently = Math.max(0, this.shotsFiredRecently - dt);
    const p = this.player;
    const input = this.input;

    if (this.playing && !this.paused && !this.mapOpen && !this.playerDead) {
      // Look.
      if (input.locked) {
        p.heading -= input.mouseDX * 0.0026;
        p.pitch = clamp(p.pitch - input.mouseDY * 0.0022, -0.55, 0.45);
      }
      // Pause / map keys.
      if (input.wasPressed('KeyP') || (input.wasPressed('Escape') && input.locked)) this.togglePause(true);
      if (input.wasPressed('KeyM')) { this.mapOpen = true; this.hud.toggleBigmap(true); }
      if (input.wasPressed('KeyR')) this.reload();
      if (input.wasPressed('KeyF') && !p.inCar) this.punch();
      if (input.wasPressed('KeyE')) {
        if (p.inCar) this.exitCar(false);
        else { const c = this.nearestCar(5); if (c) this.enterCar(c); }
      }
      if (input.clicked && !p.inCar) this.shoot();
      else if (input.mouseDown && !p.inCar && p.mag > 0 && this.time - (this._lastShot || 0) > 0.28) {
        this._lastShot = this.time;
        this.shoot();
      }
      if (p.reloadTimer > 0) { p.reloadTimer -= dt; if (p.reloadTimer <= 0) this.finishReload(); }

      if (p.inCar && p.car) {
        // Driving is handled by Traffic.updatePlayerCar.
      } else {
        // On-foot movement, camera-relative.
        const fwd = (input.keys['KeyW'] || input.keys['ArrowUp'] ? 1 : 0) - (input.keys['KeyS'] || input.keys['ArrowDown'] ? 1 : 0);
        const strafe = (input.keys['KeyD'] || input.keys['ArrowRight'] ? 1 : 0) - (input.keys['KeyA'] || input.keys['ArrowLeft'] ? 1 : 0);
        const run = input.keys['ShiftLeft'] || input.keys['ShiftRight'];
        const speed = (run ? TUNE.runSpeed : TUNE.walkSpeed) * (fwd || strafe ? 1 : 0);
        const sin = Math.sin(p.heading), cos = Math.cos(p.heading);
        let mx = sin * fwd + cos * strafe;
        let mz = cos * fwd - sin * strafe;
        const len = Math.hypot(mx, mz);
        if (len > 0) { mx /= len; mz /= len; }
        let nx = p.x + mx * speed * dt;
        let nz = p.z + mz * speed * dt;
        // Building collision.
        for (const b of this.city.colliders) {
          const push = circleVsBox(nx, nz, TUNE.playerRadius, b);
          if (push) { nx += push.x; nz += push.z; }
        }
        // Parked/traffic cars are solid to walkers.
        for (const c of this.traffic.cars) {
          if (!c.alive) continue;
          const dx = nx - c.x, dz = nz - c.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < 5.3 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            nx = c.x + (dx / d) * 2.3; nz = c.z + (dz / d) * 2.3;
          }
        }
        p.x = clamp(nx, -HALF + 1, HALF + 40);
        p.z = clamp(nz, -HALF + 1, HALF + 1);
        p.moveSpeed = speed;
      }
      // Health regen after 6 s without damage.
      if (this.time - p.lastDamageAt > 6 && p.health > 0 && p.health < TUNE.playerHealth) {
        p.health = Math.min(TUNE.playerHealth, p.health + 3 * dt);
      }
      this.missions.update(dt);
    }

    // Player character mesh follows the player on foot.
    const pm = this.playerMesh;
    pm.visible = !p.inCar && this.playing;
    if (pm.visible) {
      pm.position.set(p.x, 0, p.z);
      pm.rotation.y = p.heading;
      const u = pm.userData;
      const sp = p.moveSpeed || 0;
      u.walkPhase += sp * 0.09;
      const sw = Math.sin(u.walkPhase) * clamp(sp / 4, 0, 1) * 0.5;
      u.lLeg.rotation.x = sw; u.rLeg.rotation.x = -sw;
      u.lArm.rotation.x = -sw * 0.8; u.rArm.rotation.x = sw * 0.8;
    }

    this.traffic.update(dt, this);
    this.people.update(dt, this);
    this.maintainPolice(dt);
    this.updateCamera(dt);
    this.updateEffects(dt);
    if (!silent) this.hud.update();
    input.consumeFrame();
  }
  updateCamera(dt) {
    const p = this.player;
    const camTarget = new THREE.Vector3();
    let dist, height, lookY;
    if (p.inCar && p.car) {
      const c = p.car;
      dist = 10.5; height = 4.2; lookY = 1.2;
      const bx = c.x - Math.sin(c.heading) * dist;
      const bz = c.z - Math.cos(c.heading) * dist;
      camTarget.set(c.x + Math.sin(c.heading) * 6, lookY, c.z + Math.cos(c.heading) * 6);
      this.camera.position.lerp(new THREE.Vector3(bx, height, bz), clamp(dt * 5, 0, 1));
    } else {
      dist = 7.4; height = 3.5; lookY = 1.5;
      const bx = p.x - Math.sin(p.heading) * dist;
      const bz = p.z - Math.cos(p.heading) * dist;
      camTarget.set(p.x + Math.sin(p.heading) * 4, lookY + p.pitch * 6, p.z + Math.cos(p.heading) * 4);
      this.camera.position.lerp(new THREE.Vector3(bx, height + p.pitch * 3, bz), clamp(dt * 8, 0, 1));
    }
    if (this.camera.position.y < 0.6) this.camera.position.y = 0.6;
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      this.shake = Math.max(0, this.shake - dt * 1.4);
    }
    this.camera.lookAt(camTarget);
    // Engine + siren audio follow state.
    this.sound.setEngine(p.inCar && p.car ? Math.abs(p.car.speed) / 27 : 0, !!(p.inCar && p.car));
    this.sound.setSiren(this.wantedStars > 0, dt);
  }
  updateEffects(dt) {
    // Tracers fade.
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { this.scene.remove(t.line); this.tracers.splice(i, 1); }
    }
    // Explosions grow and fade.
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const e = this.explosions[i];
      e.life -= dt;
      const k = 1 - e.life / e.max;
      e.mesh.scale.setScalar(1 + k * 9);
      e.mesh.material.opacity = Math.max(0, 0.95 - k);
      e.light.intensity = 60 * (1 - k);
      if (e.life <= 0) { this.scene.remove(e.mesh); this.scene.remove(e.light); this.explosions.splice(i, 1); }
    }
    // Mission beacon.
    const m = this.missions.marker;
    if (m && this.playing) {
      this.beacon.visible = true; this.beaconTop.visible = true;
      this.beacon.position.set(m.x, 30, m.z);
      this.beaconTop.position.set(m.x, 8 + Math.sin(this.time * 2.4) * 1.2, m.z);
      this.beaconTop.rotation.y += dt * 2;
    } else { this.beacon.visible = false; this.beaconTop.visible = false; }
    // Lighthouse beam sweeps; water shimmers.
    if (this.city.beam) this.city.beam.rotation.y += dt * 0.5;
    if (this.city.water) this.city.water.material.opacity = 0.9 + Math.sin(this.time * 0.7) * 0.04;
    // Police light bars on parked roadblock cars still flash.
    for (const c of this.traffic.policeCars) {
      if (c.mesh.userData.lightBar) {
        c.mesh.userData.lightBar.material.color.setHex(Math.floor(performance.now() / 260) % 2 ? 0xff2222 : 0x2244ff);
      }
    }
  }
  animate() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.playing && !this.paused) this.step(dt, false);
      else if (!this.playing) {
        // Menu backdrop: slow orbit over the city.
        const t = performance.now() / 1000;
        this.camera.position.set(Math.sin(t * 0.05) * 190, 90, Math.cos(t * 0.05) * 190);
        this.camera.lookAt(0, 0, 0);
        this.updateEffects(dt);
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }
}

new Game();
