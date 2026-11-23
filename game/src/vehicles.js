// Vista Bay — vehicles: car models built from boxes, traffic AI that follows the
// road grid, player driving physics, police pursuit cars and roadblocks.
import * as THREE from 'three';
import { HALF, ROADS, TUNE } from './config.js';
import { clamp, pick, range, angleLerp } from './util.js';

const CAR_COLOURS = [0xc0392b, 0x2e6db0, 0xe8e8e8, 0x222831, 0xe8b13a, 0x2e8a4a, 0x8a5a9a, 0xd87a2e, 0x4a9a8a];
const CAR_MODELS = ['Comet', 'Falcon', 'Dune', 'Metro', 'Ridge', 'Sable'];

// A car is a THREE.Group: body, cabin, wheels, lights. Length ~4.4 m, width ~2 m.
export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: isPolice ? 0x1a2530 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.75, 4.4), bodyMat);
  body.position.y = 0.65; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2),
    new THREE.MeshLambertMaterial({ color: 0x1c2833 }));
  cabin.position.set(0, 1.3, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  g.userData.wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(wx, 0.38, wz); g.add(w);
    g.userData.wheels.push(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), lightMat);
    l.position.set(lx, 0.7, 2.22); g.add(l);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xd21f2b });
  for (const lx of [-0.6, 0.6]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), tailMat);
    l.position.set(lx, 0.7, -2.22); g.add(l);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.72, -0.2); g.add(bar);
    g.userData.lightBar = bar;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 4.42),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    stripe.position.y = 0.72; g.add(stripe);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.34, 0.9),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    badge.position.set(0, 0.72, 0.6); g.add(badge);
  }
  return g;
}

export class Car {
  constructor(scene, x, z, heading, color, isPolice) {
    this.scene = scene;
    this.isPolice = !!isPolice;
    this.isPlayerCar = false;
    this.mesh = makeCarMesh(color, this.isPolice);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    this.x = x; this.z = z; this.heading = heading;
    this.speed = 0;
    this.maxSpeed = isPolice ? 26 : range(Math.random, 10, 15);
    this.health = TUNE.carHealth;
    this.alive = true;
    this.steer = 0;
    this.model = pick(Math.random, CAR_MODELS);
    this.driver = null; // 'traffic' | 'police' | 'player' | null (parked)
  }
  get pos() { return { x: this.x, z: this.z }; }
  syncMesh() {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const w of this.mesh.userData.wheels) w.rotation.x += this.speed * 0.016;
  }
  damage(amount, game) {
    if (!this.alive) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      game.explodeCar(this);
    }
  }
  remove() { this.scene.remove(this.mesh); }
}

export class Traffic {
  constructor(scene, city, rng) {
    this.scene = scene; this.city = city; this.rng = rng;
    this.cars = [];
    this.parked = [];
    this.policeCars = [];
    this.spawnTraffic();
    this.spawnParked();
  }
  randomRoadSpot() {
    const lane = this.city.trafficLanes[Math.floor(this.rng() * this.city.trafficLanes.length)];
    const along = range(this.rng, -270, 270);
    const off = 2.6 * (lane.dir > 0 ? 1 : -1);
    if (lane.axis === 'x') return { x: along, z: lane.line + off, heading: lane.dir > 0 ? Math.PI / 2 : -Math.PI / 2, lane };
    return { x: lane.line + off, z: along, heading: lane.dir > 0 ? Math.PI : 0, lane };
  }
  spawnTraffic() {
    for (let i = 0; i < TUNE.trafficCount; i++) {
      const s = this.randomRoadSpot();
      const car = new Car(this.scene, s.x, s.z, s.heading, pick(this.rng, CAR_COLOURS), false);
      car.driver = 'traffic';
      car.lane = s.lane;
      car.speed = range(this.rng, 8, 13);
      this.cars.push(car);
    }
  }
  spawnParked() {
    // Parked cars along road edges for the player to steal.
    for (let i = 0; i < 10; i++) {
      const road = pick(this.rng, ROADS);
      const along = range(this.rng, -260, 260);
      const side = this.rng() < 0.5 ? -1 : 1;
      const horizontal = this.rng() < 0.5;
      const x = horizontal ? along : road + side * 6.4;
      const z = horizontal ? road + side * 6.4 : along;
      const heading = horizontal ? (side > 0 ? Math.PI / 2 : -Math.PI / 2) : (side > 0 ? Math.PI : 0);
      const car = new Car(this.scene, x, z, heading, pick(this.rng, CAR_COLOURS), false);
      car.driver = null;
      this.parked.push(car);
      this.cars.push(car);
    }
  }
  spawnPoliceCar(x, z) {
    const car = new Car(this.scene, x, z, 0, 0x1a2530, true);
    car.driver = 'police';
    car.maxSpeed = 27;
    this.policeCars.push(car);
    this.cars.push(car);
    return car;
  }
  removePoliceCars() {
    for (const c of this.policeCars) {
      const i = this.cars.indexOf(c); if (i >= 0) this.cars.splice(i, 1);
      c.remove();
    }
    this.policeCars = [];
  }
  // Traffic AI: follow the grid, turn at intersections, slow for the car ahead.
  update(dt, game) {
    for (const car of this.cars) {
      if (!car.alive) continue;
      if (car.driver === 'traffic') this.updateTrafficCar(car, dt, game);
      else if (car.driver === 'police') this.updatePoliceCar(car, dt, game);
      else if (car.driver === 'player') this.updatePlayerCar(car, dt, game);
      car.syncMesh();
    }
  }
  carAhead(car, list) {
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    let best = null, bestD = 14;
    for (const o of list) {
      if (o === car || !o.alive) continue;
      const dx = o.x - car.x, dz = o.z - car.z;
      const along = dx * fx + dz * fz;
      if (along > 0 && along < bestD && Math.abs(dx * fz - dz * fx) < 2.4) { best = o; bestD = along; }
    }
    return best;
  }
  updateTrafficCar(car, dt, game) {
    const lane = car.lane;
    // At an intersection, sometimes turn onto the crossing road.
    const onX = lane.axis === 'x';
    const pos = onX ? car.x : car.z;
    const nearCross = ROADS.some(r => Math.abs(pos - r) < 1.2);
    if (nearCross && this.rng() < dt * 0.35) {
      const cross = ROADS[Math.floor(this.rng() * ROADS.length)];
      const dir = this.rng() < 0.5 ? 1 : -1;
      const off = 2.6 * (dir > 0 ? 1 : -1);
      if (onX) { car.lane = { axis: 'z', line: cross, dir }; car.heading = dir > 0 ? Math.PI : 0; car.z = cross + off; }
      else { car.lane = { axis: 'x', line: cross, dir }; car.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2; car.x = cross + off; }
    }
    const ahead = this.carAhead(car, this.cars);
    const target = ahead ? 0 : car.maxSpeed;
    car.speed = clamp(car.speed + (target - car.speed) * dt * 1.2, 0, car.maxSpeed);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    if (car.x > HALF + 20) car.x = -HALF - 20;
    if (car.x < -HALF - 20) car.x = HALF + 20;
    if (car.z > HALF + 20) car.z = -HALF - 20;
    if (car.z < -HALF - 20) car.z = HALF + 20;
    // Keep on its lane.
    if (car.lane.axis === 'x') car.z += (car.lane.line + 2.6 * (car.lane.dir > 0 ? 1 : -1) - car.z) * dt * 2;
    else car.x += (car.lane.line + 2.6 * (car.lane.dir > 0 ? 1 : -1) - car.x) * dt * 2;
    // Gentle collision with the player on foot: knock, don't trap.
    if (game.player && !game.player.inCar) {
      const dx = game.player.x - car.x, dz = game.player.z - car.z;
      if (dx * dx + dz * dz < 6.5) game.hitPlayerByCar(car);
    }
  }
  updatePoliceCar(car, dt, game) {
    const p = game.player;
    const dx = p.x - car.x, dz = p.z - car.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, targetHeading, clamp(dt * 2.2, 0, 1));
    const ahead = this.carAhead(car, this.cars);
    const target = ahead ? 2 : (dist < 4 ? 4 : car.maxSpeed);
    car.speed = clamp(car.speed + (target - car.speed) * dt * 1.4, 0, car.maxSpeed);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Ram the player: damage on contact, worse at speed.
    if (p.inCar) {
      const pc = p.car;
      const ddx = pc.x - car.x, ddz = pc.z - car.z;
      if (ddx * ddx + ddz * ddz < 9 && car.speed > 4) {
        pc.damage(6, game);
        pc.speed *= 0.82;
        game.onPoliceRam();
      }
    } else if (dist < 2.4 && car.speed > 3) {
      game.damagePlayer(12, 'police car');
    }
    // Light bar flash.
    if (car.mesh.userData.lightBar) {
      car.mesh.userData.lightBar.material.color.setHex(Math.floor(performance.now() / 260) % 2 ? 0xff2222 : 0x2244ff);
    }
  }
  // Arcade driving for the player car.
  updatePlayerCar(car, dt, game) {
    const input = game.input;
    const fwd = (input.keys['KeyW'] || input.keys['ArrowUp'] ? 1 : 0) - (input.keys['KeyS'] || input.keys['ArrowDown'] ? 1 : 0);
    const steerIn = (input.keys['KeyA'] || input.keys['ArrowLeft'] ? 1 : 0) - (input.keys['KeyD'] || input.keys['ArrowRight'] ? 1 : 0);
    const handbrake = !!input.keys['Space'];
    const accel = 16;
    if (fwd > 0) car.speed += accel * dt;
    else if (fwd < 0) car.speed -= (car.speed > 0.5 ? 24 : 10) * dt;
    else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
    if (handbrake) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
    car.speed = clamp(car.speed, -11, 27);
    const steerTarget = steerIn * clamp(Math.abs(car.speed) / 8, 0, 1) * 0.55;
    car.steer = angleLerp(car.steer, steerTarget, clamp(dt * 6, 0, 1));
    car.heading += car.steer * (car.speed / 8) * dt * (car.speed >= 0 ? 1 : -1) * 2.2;
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    // Building collision: slide along walls, scrape speed.
    let blocked = false;
    for (const b of game.city.colliders) {
      if (nx > b.minX - 1.1 && nx < b.maxX + 1.1 && nz > b.minZ - 1.1 && nz < b.maxZ + 1.1) { blocked = true; break; }
    }
    if (blocked) {
      if (Math.abs(car.speed) > 9) { game.onCrash(car.speed); car.damage(Math.abs(car.speed) * 0.9, game); }
      car.speed *= 0.45;
    } else {
      car.x = nx; car.z = nz;
    }
    car.x = clamp(car.x, -HALF + 2, HALF + 60);
    car.z = clamp(car.z, -HALF + 2, HALF + 2);
    if (car.speed > 20 && this.rng() < dt * 0.5) game.addHeat(0.4); // reckless driving near cops is noticed
  }
}
