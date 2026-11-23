// Vista Bay — the nine-mission story chain. Original characters and plot:
// Mara Voss (casino owner), Dario Kane (rival boss), Rook (hacker friend).
// Each mission is a list of steps the engine walks through; steps declare what
// to do, what to spawn and how completion is judged.
import * as THREE from 'three';
import { CAST } from './config.js';
import { dist2 } from './util.js';

export const MISSIONS = [
  {
    id: 1, title: 'First Steps', reward: 200,
    briefing: `${CAST.mara} wants to meet you at Vista Bay Plaza. Walk over and hear her out.`,
    steps: [{ type: 'goto', x: 0, z: 0, label: 'Meet Mara Voss at Vista Bay Plaza' }],
  },
  {
    id: 2, title: 'Wheels Up', reward: 400,
    briefing: `${CAST.mara} needs a clean car. Steal any car on the street and bring it to Voss Garage.`,
    steps: [{ type: 'deliver', x: 240, z: 96, needCar: true, label: 'Steal a car and deliver it to Voss Garage' }],
  },
  {
    id: 3, title: 'Palm Heist Prep', reward: 600,
    briefing: `${CAST.rook} stashed three supply crates around the city for the casino job. Collect them all.`,
    steps: [{ type: 'collect', items: [[-150, 150], [90, 210], [-210, -30]], label: 'Collect the 3 supply crates (0/3)' }],
  },
  {
    id: 4, title: 'Dockside Deal', reward: 800,
    briefing: `${CAST.dario} is moving guns through the port. Shut the deal down — drop his three enforcers.`,
    steps: [{ type: 'kill', spawn: [[-262, 226], [-246, 250], [-278, 244]], count: 3, label: 'Eliminate Kane\u2019s enforcers at the port (0/3)' }],
  },
  {
    id: 5, title: 'Lighthouse Signal', reward: 1000,
    briefing: `${CAST.rook} needs the lighthouse lamp flashing his signal. Get to the pier end and hold off Kane\u2019s crew for 30 seconds.`,
    steps: [
      { type: 'goto', x: 384, z: 0, label: 'Reach the lighthouse at the end of the pier' },
      { type: 'defend', x: 384, z: 0, seconds: 30, spawn: [[330, -4], [330, 4], [352, 0]], label: 'Hold the lighthouse — survive 30 seconds' },
    ],
  },
  {
    id: 6, title: 'Airport Run', reward: 1500,
    briefing: `${CAST.rook} is landing at Vista Bay Airfield with the casino vault codes. Pick him up — the police will be watching.`,
    steps: [
      { type: 'goto', x: -240, z: -240, label: 'Reach the airfield runway' },
      { type: 'escape', seconds: 20, label: 'Escape the police — stay free for 20 seconds' },
    ],
  },
  {
    id: 7, title: 'Casino Bust', reward: 2000,
    briefing: `${CAST.dario} bought the Golden Palm\u2019s security. Clear his five guards out of the casino front.`,
    steps: [{ type: 'kill', spawn: [[168, -44], [192, -44], [180, -40], [162, -70], [198, -70]], count: 5, label: 'Clear the casino guards (0/5)' }],
  },
  {
    id: 8, title: 'Rooftop Chase', reward: 3000,
    briefing: `${CAST.dario} is fleeing in his armoured Comet. Ram his car until it is wrecked — don\u2019t let him reach the port.`,
    steps: [{ type: 'ram', x: 120, z: 120, label: 'Ram Dario Kane\u2019s car until it is wrecked' }],
  },
  {
    id: 9, title: 'Bay King', reward: 5000,
    briefing: `Final move. ${CAST.dario} is making his last stand on the pier with his crew. Take them all down and the bay is yours.`,
    steps: [{ type: 'kill', spawn: [[330, -4], [352, 4], [368, -3], [344, 3], [360, -4], [326, 4]], count: 6, label: 'Defeat Dario Kane and his crew on the pier (0/6)' }],
  },
];

export class MissionEngine {
  constructor(game) {
    this.game = game;
    this.missionIndex = 0;      // 0-based into MISSIONS
    this.stepIndex = 0;
    this.state = 'idle';        // 'idle' | 'active' | 'done'
    this.stepState = null;      // per-step runtime data
    this.kills = 0;
    this.collected = 0;
    this.timer = 0;
    this.pickupMeshes = [];
    this.targetCar = null;
    this.marker = null;         // {x, z} current objective position
  }
  get mission() { return MISSIONS[this.missionIndex] || null; }
  get step() { return this.mission ? this.mission.steps[this.stepIndex] : null; }
  get finished() { return this.missionIndex >= MISSIONS.length; }

  startMission(index) {
    this.missionIndex = index;
    this.stepIndex = 0;
    this.state = 'active';
    this.game.save();
    this.game.sound.missionStart();
    this.game.hud.toast(`Mission ${this.mission.id}: ${this.mission.title}`);
    this.game.hud.setObjective(this.mission.title, this.mission.briefing, null);
    this.beginStep();
  }
  beginStep() {
    const s = this.step;
    if (!s) { this.completeMission(); return; }
    this.kills = 0; this.collected = 0; this.timer = 0;
    this.clearStepObjects();
    const g = this.game;
    if (s.type === 'goto' || s.type === 'deliver') {
      this.marker = { x: s.x, z: s.z };
    } else if (s.type === 'collect') {
      this.marker = { x: s.items[0][0], z: s.items[0][1] };
      for (const [x, z] of s.items) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4),
          new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a5200 }));
        m.position.set(x, 1.6, z);
        m.userData.spin = true;
        g.scene.add(m);
        this.pickupMeshes.push({ mesh: m, x, z, taken: false });
      }
    } else if (s.type === 'kill') {
      this.marker = { x: s.spawn[0][0], z: s.spawn[0][1] };
      for (const [x, z] of s.spawn) g.people.spawnGoon(x, z);
    } else if (s.type === 'defend') {
      this.marker = { x: s.x, z: s.z };
      this.timer = s.seconds;
      for (const [x, z] of s.spawn) g.people.spawnGoon(x, z);
    } else if (s.type === 'escape') {
      this.marker = null;
      this.timer = s.seconds;
      g.addHeat(45); // police are on you
    } else if (s.type === 'ram') {
      const c = g.traffic.spawnPoliceCar(s.x, s.z);
      c.isPolice = false;
      // Repaint the target car black-and-gold: Kane's Comet.
      c.mesh.traverse(o => { if (o.isMesh && o.material && o.material.color) o.material = o.material.clone(); });
      c.mesh.children[0].material.color.setHex(0x111111);
      c.driver = 'flee';
      c.maxSpeed = 20;
      c.health = 160;
      c.model = 'Kane\u2019s Comet';
      this.targetCar = c;
      this.marker = { x: s.x, z: s.z };
    }
    this.game.hud.setObjective(this.mission.title, this.stepLabel(), this.marker);
  }
  stepLabel() {
    const s = this.step;
    if (!s) return '';
    if (s.type === 'kill') return s.label.replace(/\(\d+\/\d+\)/, `(${this.kills}/${s.count})`);
    if (s.type === 'collect') return s.label.replace(/\(\d+\/\d+\)/, `(${this.collected}/${s.items.length})`);
    if (s.type === 'defend') return `${s.label} — ${Math.ceil(this.timer)}s left`;
    if (s.type === 'escape') return `${s.label} — ${Math.ceil(this.timer)}s left`;
    return s.label;
  }
  clearStepObjects() {
    for (const p of this.pickupMeshes) this.game.scene.remove(p.mesh);
    this.pickupMeshes = [];
  }
  onKill() {
    if (this.step && this.step.type === 'kill') {
      this.kills++;
      this.game.hud.setObjective(this.mission.title, this.stepLabel(), this.marker);
      if (this.kills >= this.step.count) this.completeStep();
    }
  }
  completeStep() {
    this.stepIndex++;
    this.game.sound.pickup();
    if (this.stepIndex >= this.mission.steps.length) this.completeMission();
    else this.beginStep();
  }
  completeMission() {
    const m = this.mission;
    this.game.cash += m.reward;
    this.game.hud.toast(`Mission complete: ${m.title}  +$${m.reward}`);
    this.game.sound.missionDone();
    this.game.people.clearGoons();
    this.clearStepObjects();
    if (this.targetCar) { this.targetCar.driver = null; this.targetCar = null; }
    this.missionIndex++;
    this.stepIndex = 0;
    this.marker = null;
    this.game.save();
    if (this.finished) {
      this.state = 'done';
      this.game.hud.setObjective('Vista Bay is yours', 'All nine missions complete. The bay belongs to you — keep exploring, or start a New Game.', null);
      this.game.hud.toast('STORY COMPLETE — Vista Bay is yours!');
    } else {
      this.startMission(this.missionIndex);
    }
  }
  update(dt) {
    if (this.state !== 'active' || !this.step) return;
    const s = this.step;
    const p = this.game.player;
    const px = p.x, pz = p.z;
    // Spin pickups.
    for (const pk of this.pickupMeshes) {
      pk.mesh.rotation.y += dt * 2;
      pk.mesh.position.y = 1.6 + Math.sin(performance.now() / 300 + pk.x) * 0.25;
    }
    if (s.type === 'goto') {
      if (dist2(px, pz, s.x, s.z) < 100) this.completeStep();
    } else if (s.type === 'deliver') {
      if (p.inCar && dist2(px, pz, s.x, s.z) < 144) this.completeStep();
    } else if (s.type === 'collect') {
      let changed = false;
      for (const pk of this.pickupMeshes) {
        if (!pk.taken && dist2(px, pz, pk.x, pk.z) < 9) {
          pk.taken = true;
          this.game.scene.remove(pk.mesh);
          this.collected++;
          changed = true;
          this.game.sound.pickup();
        }
      }
      if (changed) {
        const left = this.pickupMeshes.find(q => !q.taken);
        this.marker = left ? { x: left.x, z: left.z } : null;
        this.game.hud.setObjective(this.mission.title, this.stepLabel(), this.marker);
        if (this.collected >= s.items.length) this.completeStep();
      }
    } else if (s.type === 'defend') {
      this.timer -= dt;
      this.game.hud.setObjective(this.mission.title, this.stepLabel(), this.marker);
      // Reinforcements trickle in.
      if (this.game.people.nearestGoonsAlive().length < 2 && this.timer > 5) {
        const a = 320 + Math.random() * 50;
        this.game.people.spawnGoon(a, (Math.random() < 0.5 ? -1 : 1) * 4);
      }
      if (this.timer <= 0) this.completeStep();
    } else if (s.type === 'escape') {
      if (this.game.wantedStars > 0) this.timer -= dt;
      this.game.hud.setObjective(this.mission.title, this.stepLabel(), null);
      if (this.timer <= 0) {
        this.game.clearWanted();
        this.completeStep();
      }
    } else if (s.type === 'ram') {
      const c = this.targetCar;
      if (!c || !c.alive) { this.completeStep(); return; }
      this.marker = { x: c.x, z: c.z };
      // Target car flees from the player along roads.
      const dx = c.x - px, dz = c.z - pz;
      const d = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      c.heading += (wantHeading - c.heading) * dt * 1.5;
      c.speed = Math.min(c.speed + dt * 6, c.maxSpeed);
      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      c.x = Math.max(-290, Math.min(290, c.x));
      c.z = Math.max(-290, Math.min(290, c.z));
      // Ramming: the player's car damages it on contact.
      if (p.inCar && p.car) {
        const ddx = p.car.x - c.x, ddz = p.car.z - c.z;
        if (ddx * ddx + ddz * ddz < 12) {
          c.damage(22 * dt * 4, this.game);
          p.car.speed *= 0.94;
        }
      }
      c.syncMesh();
    }
  }
}
