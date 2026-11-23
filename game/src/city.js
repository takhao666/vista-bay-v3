// Vista Bay — procedural 600x600 m city: roads, towers, beach, pier, lighthouse,
// casino, hospital, park, airport runway and port. All geometry and textures are
// generated at runtime from canvas textures; no external assets.
import * as THREE from 'three';
import { CITY, HALF, ROADS, ROAD_WIDTH, COLOURS } from './config.js';
import { pick, range } from './util.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(rng, base, litRatio) {
  const cols = 6 + Math.floor(rng() * 6), rows = 8 + Math.floor(rng() * 10);
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cw = w / cols, ch = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : (rng() < 0.5 ? '#2b3d4d' : '#42586e');
      g.fillRect(x * cw + 2, y * ch + 3, cw - 4, ch - 6);
    }
  });
}

function roadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#2e3138'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9a13b';
    g.fillRect(w / 2 - 2, 0, 4, 26); g.fillRect(w / 2 - 2, 64, 4, 26);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(0, 0, w, 3); g.fillRect(0, h - 3, w, 3);
  });
}

function signTexture(text, bg, fg, sub) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = 'bold 52px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h / 2 - 18 : h / 2);
    if (sub) { g.font = 'bold 30px Arial'; g.fillText(sub, w / 2, h / 2 + 34); }
  });
}

const PALETTE = ['#8a7f72', '#6f87a0', '#a08a6f', '#7d8a99', '#b0a090', '#5d7488', '#96887a', '#74818f'];
const ROOFS = [0x3a4a5a, 0x5a4a3a, 0x4a5a4a, 0x6a5a6a];

export class City {
  constructor(scene, rng) {
    this.scene = scene;
    this.rng = rng;
    this.colliders = [];   // {minX,maxX,minZ,maxZ}
    this.trafficLanes = []; // {axis:'x'|'z', line, dir}
    this.landmarks = {};
    this.beaconSpots = {};
    this.build();
  }

  addCollider(x, z, w, d) {
    this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  build() {
    const { scene, rng } = this;
    scene.fog = new THREE.Fog(COLOURS.fog, 180, 700);
    const sun = new THREE.DirectionalLight(COLOURS.sun, 2.4);
    sun.position.set(180, 260, 120);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -320; sun.shadow.camera.right = 320;
    sun.shadow.camera.top = 320; sun.shadow.camera.bottom = -320;
    sun.shadow.camera.far = 800;
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3f5a3a, 1.1));

    // Ground, sand, ocean.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(CITY, CITY),
      new THREE.MeshLambertMaterial({ color: COLOURS.ground }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(30, CITY),
      new THREE.MeshLambertMaterial({ color: COLOURS.sand }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(285, 0.05, 0); sand.receiveShadow = true; scene.add(sand);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(260, CITY + 260),
      new THREE.MeshLambertMaterial({ color: COLOURS.ocean, transparent: true, opacity: 0.94 }));
    ocean.rotation.x = -Math.PI / 2; ocean.position.set(430, 0.02, 0); scene.add(ocean);
    // Animated water shimmer is a slow opacity pulse handled in main loop via userData.
    ocean.userData.isWater = true; this.water = ocean;

    // Roads (grid) + sidewalks.
    const roadTex = roadTexture();
    roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
    const roadMat = new THREE.MeshLambertMaterial({ map: roadTex });
    for (const r of ROADS) {
      for (const [w, d, x, z, repX, repY] of [
        [CITY, ROAD_WIDTH, 0, r, 50, 1], [ROAD_WIDTH, CITY, r, 0, 1, 50]]) {
        const tex = roadTex.clone(); tex.needsUpdate = true; tex.repeat.set(repX, repY);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: tex }));
        m.rotation.x = -Math.PI / 2; m.position.set(x, 0.08, z); m.receiveShadow = true; scene.add(m);
      }
      this.trafficLanes.push({ axis: 'x', line: r, dir: 1 }, { axis: 'x', line: r, dir: -1 });
      this.trafficLanes.push({ axis: 'z', line: r, dir: 1 }, { axis: 'z', line: r, dir: -1 });
    }

    // Buildings per block.
    const blockCentres = [];
    for (let i = 0; i < ROADS.length - 1; i++) {
      for (let j = 0; j < ROADS.length - 1; j++) {
        blockCentres.push([(ROADS[i] + ROADS[i + 1]) / 2, (ROADS[j] + ROADS[j + 1]) / 2]);
      }
    }
    const special = {
      plaza: [0, 0], park: [90, -90], hospital: [-120, 120], casino: [180, -60],
      garage: [240, 120], airport: [-240, -240], port: [-240, 240],
    };
    const isSpecial = (x, z) => Object.values(special).some(([sx, sz]) => Math.abs(x - sx) < 1 && Math.abs(z - sz) < 1);
    const nearAirport = (x, z) => x < -150 && z < -150;
    const nearPort = (x, z) => x < -150 && z > 150;
    const beach = (x) => x > 240;

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    for (const [bx, bz] of blockCentres) {
      if (isSpecial(bx, bz) || nearAirport(bx, bz) || nearPort(bx, bz) || beach(bx)) continue;
      const downtown = Math.abs(bx) < 150 && Math.abs(bz) < 150;
      const n = downtown ? (rng() < 0.6 ? 1 : 2) : (rng() < 0.7 ? 2 : 3);
      for (let k = 0; k < n; k++) {
        const w = range(rng, 16, downtown ? 34 : 24);
        const d = range(rng, 16, downtown ? 34 : 24);
        const h = downtown ? range(rng, 26, 88) : range(rng, 8, 26);
        const ox = n === 1 ? 0 : (k % 2 === 0 ? -11 : 11);
        const oz = n === 1 ? 0 : (k < 2 ? -11 : 11);
        const x = bx + ox, z = bz + oz;
        const tex = buildingTexture(rng, pick(rng, PALETTE), 0.28);
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(boxGeo, mat);
        b.scale.set(w, h, d); b.position.set(x, h / 2, z);
        b.castShadow = true; b.receiveShadow = true; scene.add(b);
        const roof = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: pick(rng, ROOFS) }));
        roof.scale.set(w + 0.6, 0.8, d + 0.6); roof.position.set(x, h + 0.4, z); scene.add(roof);
        // Rooftop AC box on tall towers.
        if (h > 40) {
          const ac = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8a929a }));
          ac.scale.set(4, 2.4, 4); ac.position.set(x + w / 4, h + 1.6, z - d / 4); scene.add(ac);
        }
        this.addCollider(x, z, w, d);
      }
    }

    this.buildPlaza(special.plaza);
    this.buildPark(special.park);
    this.buildHospital(special.hospital);
    this.buildCasino(special.casino);
    this.buildGarage(special.garage);
    this.buildAirport();
    this.buildPort();
    this.buildPier();
    this.scatterTrees(rng);
    this.landmarks = { ...special, pier: [340, 0], lighthouse: [384, 0], beach: [282, 0], runway: [-240, -240] };
  }

  buildPlaza([x, z]) {
    const { scene } = this;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.4, 24),
      new THREE.MeshLambertMaterial({ color: 0xb8b0a0 }));
    stone.position.set(x, 0.2, z); stone.receiveShadow = true; scene.add(stone);
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(5, 6, 1.6, 20),
      new THREE.MeshLambertMaterial({ color: 0x7fb8d8 }));
    fountain.position.set(x, 0.8, z); scene.add(fountain);
    const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.4, 3.4, 10),
      new THREE.MeshLambertMaterial({ color: 0xcfeeff }));
    jet.position.set(x, 3, z); scene.add(jet);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTexture('VISTA BAY PLAZA', '#14324a', '#ffd23f', 'CITY CENTRE') }));
    sign.position.set(x, 9, z - 13); scene.add(sign);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x334455 }));
    pole.position.set(x, 3.5, z - 13); scene.add(pole);
    this.addCollider(x, z, 11, 11);
  }

  buildPark([x, z]) {
    const { scene, rng } = this;
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(50, 50),
      new THREE.MeshLambertMaterial({ color: 0x5d9a55 }));
    lawn.rotation.x = -Math.PI / 2; lawn.position.set(x, 0.06, z); lawn.receiveShadow = true; scene.add(lawn);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
      new THREE.MeshLambertMaterial({ color: 0x3f8fb8 }));
    pond.rotation.x = -Math.PI / 2; pond.position.set(x + 10, 0.09, z + 8); scene.add(pond);
    for (let i = 0; i < 16; i++) this.tree(x + range(rng, -22, 22), z + range(rng, -22, 22), range(rng, 0.8, 1.5));
    const benchMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
    for (const [bx, bz] of [[x - 12, z - 8], [x + 12, z - 10], [x, z + 16]]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(3, 0.9, 1), benchMat);
      bench.position.set(bx, 0.45, bz); bench.castShadow = true; scene.add(bench);
    }
  }

  tree(x, z, s) {
    const { scene } = this;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.45 * s, 2.4 * s, 8),
      new THREE.MeshLambertMaterial({ color: 0x6b4a2f }));
    trunk.position.set(x, 1.2 * s, z); trunk.castShadow = true; scene.add(trunk);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2 * s, 5 * s, 8),
      new THREE.MeshLambertMaterial({ color: 0x2f7a3a }));
    top.position.set(x, 4.4 * s, z); top.castShadow = true; scene.add(top);
    this.addCollider(x, z, 0.8 * s, 0.8 * s);
  }

  buildHospital([x, z]) {
    const { scene } = this;
    const b = new THREE.Mesh(new THREE.BoxGeometry(34, 18, 22),
      new THREE.MeshLambertMaterial({ color: 0xe8ecef }));
    b.position.set(x, 9, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xd21f2b }));
    cross.position.set(x, 14, z + 11.2); scene.add(cross);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 8, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xd21f2b }));
    cross2.position.set(x, 14, z + 11.2); scene.add(cross2);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(20, 5),
      new THREE.MeshBasicMaterial({ map: signTexture('VISTA GENERAL', '#ffffff', '#c81e2b', 'HOSPITAL') }));
    sign.position.set(x, 20.5, z + 11.2); scene.add(sign);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(6, 20),
      new THREE.MeshLambertMaterial({ color: 0x44484e }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(x + 20, 0.1, z - 14); scene.add(pad);
    this.addCollider(x, z, 34, 22);
  }

  buildCasino([x, z]) {
    const { scene } = this;
    const b = new THREE.Mesh(new THREE.BoxGeometry(36, 26, 26),
      new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
    b.position.set(x, 13, z); b.castShadow = true; b.receiveShadow = true; scene.add(b);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(37, 2, 27),
      new THREE.MeshLambertMaterial({ color: 0x8a6d1b, emissive: 0x332200 }));
    trim.position.set(x, 26.5, z); scene.add(trim);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5),
      new THREE.MeshBasicMaterial({ map: signTexture('GOLDEN PALM', '#3a2408', '#ffd23f', 'CASINO · HOTEL') }));
    sign.position.set(x, 18, z + 13.4); scene.add(sign);
    // Palm trees flanking the entrance.
    for (const [px, pz] of [[x - 14, z + 14], [x + 14, z + 14]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 7, 8),
        new THREE.MeshLambertMaterial({ color: 0x7a5a35 }));
      trunk.position.set(px, 3.5, pz); trunk.rotation.z = px < x ? 0.15 : -0.15; scene.add(trunk);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.4, 8),
        new THREE.MeshLambertMaterial({ color: 0x2f8a3a }));
      crown.position.set(px, 7.4, pz); scene.add(crown);
    }
    this.addCollider(x, z, 36, 26);
  }

  buildGarage([x, z]) {
    const { scene } = this;
    const b = new THREE.Mesh(new THREE.BoxGeometry(26, 9, 18),
      new THREE.MeshLambertMaterial({ color: 0x5a6a7a }));
    b.position.set(x, 4.5, z); b.castShadow = true; scene.add(b);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(10, 6),
      new THREE.MeshLambertMaterial({ color: 0x2c343c }));
    door.position.set(x, 3, z + 9.1); scene.add(door);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({ map: signTexture('VOSS GARAGE', '#1c2c3c', '#7dff9a') }));
    sign.position.set(x, 10.5, z + 9.1); scene.add(sign);
    this.addCollider(x, z, 26, 18);
  }

  buildAirport() {
    const { scene } = this;
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(110, 16),
      new THREE.MeshLambertMaterial({ color: 0x3a3d42 }));
    strip.rotation.x = -Math.PI / 2; strip.position.set(-240, 0.09, -240); strip.receiveShadow = true; scene.add(strip);
    const dashes = new THREE.Mesh(new THREE.PlaneGeometry(100, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    dashes.rotation.x = -Math.PI / 2; dashes.position.set(-240, 0.1, -240); scene.add(dashes);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3, 4, 26, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8dde2 }));
    tower.position.set(-196, 13, -262); tower.castShadow = true; scene.add(tower);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 4, 10),
      new THREE.MeshLambertMaterial({ color: 0x2f5a7a }));
    cab.position.set(-196, 27, -262); scene.add(cab);
    const term = new THREE.Mesh(new THREE.BoxGeometry(30, 8, 14),
      new THREE.MeshLambertMaterial({ color: 0x9aa4ac }));
    term.position.set(-230, 4, -272); term.castShadow = true; scene.add(term);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 4.5),
      new THREE.MeshBasicMaterial({ map: signTexture('VISTA BAY AIRFIELD', '#22384a', '#ffffff') }));
    sign.position.set(-230, 10, -264.8); scene.add(sign);
    this.addCollider(-196, -262, 8, 8);
    this.addCollider(-230, -272, 30, 14);
  }

  buildPort() {
    const { scene, rng } = this;
    const dock = new THREE.Mesh(new THREE.PlaneGeometry(80, 60),
      new THREE.MeshLambertMaterial({ color: 0x8a8f94 }));
    dock.rotation.x = -Math.PI / 2; dock.position.set(-255, 0.07, 240); dock.receiveShadow = true; scene.add(dock);
    const cols = [0xb03a2e, 0x2e6db0, 0x2e8a4a, 0xb08a2e, 0x7a4a9a];
    for (let i = 0; i < 14; i++) {
      const w = 12, h = range(rng, 2.6, 5.2), d = 2.6;
      const x = -285 + (i % 4) * 15 + range(rng, -2, 2);
      const z = 215 + Math.floor(i / 4) * 16 + range(rng, -2, 2);
      const c = new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
        new THREE.MeshLambertMaterial({ color: pick(rng, cols) }));
      c.position.set(x, h / 2, z); c.castShadow = true; scene.add(c);
      this.addCollider(x, z, w, d);
    }
    // Gantry crane.
    const legMat = new THREE.MeshLambertMaterial({ color: 0xd8a020 });
    for (const lx of [-282, -266]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2, 22, 2), legMat);
      leg.position.set(lx, 11, 262); scene.add(leg);
    }
    const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 2, 2), legMat);
    arm.position.set(-274, 22, 262); scene.add(arm);
    this.addCollider(-274, 262, 18, 3);
  }

  buildPier() {
    const { scene } = this;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(84, 1.2, 10),
      new THREE.MeshLambertMaterial({ color: 0x8a6a42 }));
    deck.position.set(342, 1.2, 0); deck.castShadow = true; deck.receiveShadow = true; scene.add(deck);
    for (let x = 306; x <= 378; x += 12) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4, 8),
        new THREE.MeshLambertMaterial({ color: 0x5a4630 }));
      pile.position.set(x, -0.8, -4.4); scene.add(pile);
      const pile2 = pile.clone(); pile2.position.z = 4.4; scene.add(pile2);
    }
    // Amusement stalls along the pier.
    const stallCols = [0xd85a7a, 0x4a9ad8, 0xe8b13a];
    for (let i = 0; i < 4; i++) {
      const x = 318 + i * 16;
      const stall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 7),
        new THREE.MeshLambertMaterial({ color: stallCols[i % 3] }));
      stall.position.set(x, 3.6, i % 2 === 0 ? -2.4 : 2.4); stall.castShadow = true; scene.add(stall);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 2.2, 4),
        new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
      roof.position.set(x, 6.6, stall.position.z); roof.rotation.y = Math.PI / 4; scene.add(roof);
    }
    // Lighthouse at the pier end.
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 22, 12),
      new THREE.MeshLambertMaterial({ color: 0xf2ead8 }));
    tower.position.set(386, 12, 0); tower.castShadow = true; scene.add(tower);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0xd21f2b }));
    band.position.set(386, 16, 0); scene.add(band);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
    lamp.position.set(386, 24, 0); scene.add(lamp);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 3, 12),
      new THREE.MeshLambertMaterial({ color: 0x2c343c }));
    cap.position.set(386, 27, 0); scene.add(cap);
    // Rotating light beam.
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
    beam.rotation.z = Math.PI / 2; beam.position.set(386, 24, 0);
    beam.userData.isBeam = true; scene.add(beam);
    this.beam = beam;
    this.addCollider(386, 0, 9, 9);
  }

  scatterTrees(rng) {
    for (let i = 0; i < 26; i++) {
      const x = range(rng, -290, 260), z = range(rng, -290, 290);
      if (ROADS.some(r => Math.abs(x - r) < 9 || Math.abs(z - r) < 9)) continue;
      if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
      this.tree(x, z, range(rng, 0.7, 1.2));
    }
  }
}
