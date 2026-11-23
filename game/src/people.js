// Vista Bay — people: pedestrians who stroll the sidewalks and flee gunfire,
// foot police who chase and arrest, and armed goons for the mission fights.
import * as THREE from 'three';
import { HALF, ROADS, TUNE } from './config.js';
import { clamp, pick, range, angleLerp, dist2 } from './util.js';

const SHIRTS = [0xd85a5a, 0x5a8ad8, 0x5ad88a, 0xe8b13a, 0x9a5ad8, 0xd8d8d8, 0x5ad8c8, 0xe87a3a];
const PANTS = [0x2c343c, 0x4a3a2c, 0x2c4a6a, 0x5a5a5a];

export function makePersonMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legGeo = new THREE.BoxGeometry(0.22, 0.85, 0.22);
  const lLeg = new THREE.Mesh(legGeo, legMat); lLeg.position.set(-0.14, 0.42, 0); g.add(lLeg);
  const rLeg = new THREE.Mesh(legGeo, legMat); rLeg.position.set(0.14, 0.42, 0); g.add(rLeg);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.34),
    new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.2; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34),
    new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.78; head.castShadow = true; g.add(head);
  const armGeo = new THREE.BoxGeometry(0.16, 0.66, 0.16);
  const armMat = new THREE.MeshLambertMaterial({ color: shirt });
  const lArm = new THREE.Mesh(armGeo, armMat); lArm.position.set(-0.4, 1.2, 0); g.add(lArm);
  const rArm = new THREE.Mesh(armGeo, armMat); rArm.position.set(0.4, 1.2, 0); g.add(rArm);
  g.userData = { lLeg, rLeg, lArm, rArm, walkPhase: Math.random() * 6 };
  return g;
}

export class Person {
  constructor(scene, x, z, kind, rng) {
    this.scene = scene; this.kind = kind; // 'ped' | 'cop' | 'goon'
    this.rng = rng;
    const skin = pick(rng, [0xe8b88a, 0xc98a5a, 0x8a5a3a, 0xf2c9a0]);
    if (kind === 'cop') this.mesh = makePersonMesh(0x1a2530, 0x1a2530, skin);
    else if (kind === 'goon') this.mesh = makePersonMesh(0x8a1f1f, 0x222222, skin);
    else this.mesh = makePersonMesh(pick(rng, SHIRTS), pick(rng, PANTS), skin);
    if (kind === 'cop') {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 10),
        new THREE.MeshLambertMaterial({ color: 0x101820 }));
      cap.position.y = 2.0; this.mesh.add(cap);
    }
    if (kind === 'goon') {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.5),
        new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.4, 1.05, 0.3); this.mesh.add(gun);
    }
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    this.x = x; this.z = z;
    this.heading = rng() * Math.PI * 2;
    this.speed = 0;
    this.health = kind === 'goon' ? TUNE.goonHealth : 100;
    this.alive = true;
    this.target = null;   // {x, z} waypoint
    this.fleeing = false;
    this.shootCooldown = range(rng, 0.5, 2);
    this.arrestTimer = 0;
    this.panicTimer = 0;
    this.pickNewTarget();
  }
  pickNewTarget() {
    const road = pick(this.rng, ROADS);
    const along = range(this.rng, -280, 280);
    const side = this.rng() < 0.5 ? -1 : 1;
    if (this.rng() < 0.5) this.target = { x: along, z: road + side * 7.5 };
    else this.target = { x: road + side * 7.5, z: along };
  }
  damage(amount, game) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.kind === 'ped' && this.health < 100) { this.fleeing = true; this.panicTimer = 4; }
    if (this.health <= 0) {
      this.alive = false;
      game.onPersonKilled(this);
    }
  }
  remove() { this.scene.remove(this.mesh); }
  syncMesh(walkSpeed) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    const u = this.mesh.userData;
    u.walkPhase += walkSpeed * 0.09;
    const s = Math.sin(u.walkPhase) * clamp(walkSpeed / 4, 0, 1) * 0.5;
    u.lLeg.rotation.x = s; u.rLeg.rotation.x = -s;
    u.lArm.rotation.x = -s * 0.8; u.rArm.rotation.x = s * 0.8;
  }
}

export class People {
  constructor(scene, city, rng) {
    this.scene = scene; this.city = city; this.rng = rng;
    this.peds = [];
    this.cops = [];
    this.goons = [];
    for (let i = 0; i < TUNE.pedCount; i++) {
      const p = new Person(scene, range(rng, -280, 280), range(rng, -280, 280), 'ped', rng);
      this.peds.push(p);
    }
  }
  spawnCop(x, z) {
    const c = new Person(this.scene, x, z, 'cop', this.rng);
    this.cops.push(c);
    return c;
  }
  spawnGoon(x, z) {
    const g = new Person(this.scene, x, z, 'goon', this.rng);
    this.goons.push(g);
    return g;
  }
  clearCops() { for (const c of this.cops) c.remove(); this.cops = []; }
  clearGoons() { for (const g of this.goons) g.remove(); this.goons = []; }
  nearestGoonsAlive() { return this.goons.filter(g => g.alive); }

  update(dt, game) {
    const p = game.player;
    // Pedestrians: stroll, flee gunfire and the player's car.
    for (const ped of this.peds) {
      if (!ped.alive) continue;
      let speed = 1.4;
      let tx = ped.target.x, tz = ped.target.z;
      if (ped.panicTimer > 0) {
        ped.panicTimer -= dt;
        speed = 4.2;
        const dx = ped.x - p.x, dz = ped.z - p.z;
        const d = Math.hypot(dx, dz) || 1;
        tx = ped.x + (dx / d) * 30; tz = ped.z + (dz / d) * 30;
      } else if (game.shotsFiredRecently > 0) {
        const d2 = dist2(ped.x, ped.z, p.x, p.z);
        if (d2 < 900) { ped.fleeing = true; ped.panicTimer = 2.5; }
      }
      const dx = tx - ped.x, dz = tz - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) { ped.pickNewTarget(); ped.fleeing = false; continue; }
      ped.heading = angleLerp(ped.heading, Math.atan2(dx, dz), clamp(dt * 4, 0, 1));
      ped.x += Math.sin(ped.heading) * speed * dt;
      ped.z += Math.cos(ped.heading) * speed * dt;
      ped.x = clamp(ped.x, -HALF + 2, HALF + 40);
      ped.z = clamp(ped.z, -HALF + 2, HALF + 2);
      ped.syncMesh(speed);
    }
    // Foot police: run at the player, arrest on contact.
    for (const cop of this.cops) {
      if (!cop.alive) continue;
      const dx = p.x - cop.x, dz = p.z - cop.z;
      const d = Math.hypot(dx, dz);
      if (p.inCar) {
        // On foot no longer relevant: cops give up the chase and walk back to roads.
        if (d > 3) { cop.heading = angleLerp(cop.heading, Math.atan2(dx, dz), clamp(dt * 3, 0, 1)); cop.x += Math.sin(cop.heading) * 3 * dt; cop.z += Math.cos(cop.heading) * 3 * dt; }
        cop.syncMesh(3);
        continue;
      }
      if (d < 2.0) {
        cop.arrestTimer += dt;
        if (cop.arrestTimer > 1.6) { game.busted('arrested by the Vista Bay Police'); return; }
      } else cop.arrestTimer = 0;
      cop.heading = angleLerp(cop.heading, Math.atan2(dx, dz), clamp(dt * 5, 0, 1));
      const sp = d < 12 ? 6.8 : 5.2;
      cop.x += Math.sin(cop.heading) * sp * dt;
      cop.z += Math.cos(cop.heading) * sp * dt;
      cop.syncMesh(sp);
    }
    // Goons: hold ground, shoot when the player is in range and line of sight is open.
    for (const goon of this.goons) {
      if (!goon.alive) continue;
      const dx = p.x - goon.x, dz = p.z - goon.z;
      const d = Math.hypot(dx, dz);
      goon.shootCooldown -= dt;
      if (d < TUNE.goonRange && !game.playerDead) {
        goon.heading = angleLerp(goon.heading, Math.atan2(dx, dz), clamp(dt * 6, 0, 1));
        if (goon.shootCooldown <= 0) {
          goon.shootCooldown = range(this.rng, 0.9, 1.8);
          game.goonShoot(goon, d);
        }
        // Strafe a little to stay dangerous.
        goon.x += Math.sin(goon.heading + Math.PI / 2) * Math.sin(performance.now() / 900 + goon.x) * dt * 1.2;
        goon.syncMesh(1.2);
      } else if (d >= TUNE.goonRange && d < 60) {
        goon.heading = angleLerp(goon.heading, Math.atan2(dx, dz), clamp(dt * 4, 0, 1));
        goon.x += Math.sin(goon.heading) * 3.4 * dt;
        goon.z += Math.cos(goon.heading) * 3.4 * dt;
        goon.syncMesh(3.4);
      } else {
        goon.syncMesh(0);
      }
    }
  }
}
