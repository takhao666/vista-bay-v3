// Vista Bay — HUD: wanted stars, cash, health, ammo, mission objective, minimap
// and full-screen map, menus, toasts, and the localStorage save.
import { ROADS, TUNE } from './config.js';
import { MISSIONS } from './missions.js';

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: document.getElementById('hud'),
      stars: document.getElementById('stars'),
      cash: document.getElementById('cash'),
      healthfill: document.getElementById('healthfill'),
      ammo: document.getElementById('ammo'),
      objtitle: document.getElementById('objtitle'),
      objtext: document.getElementById('objtext'),
      objdist: document.getElementById('objdist'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
      speed: document.getElementById('speed'),
      speedval: document.getElementById('speedval'),
      toast: document.getElementById('toast'),
      minimap: document.getElementById('minimap'),
      bigmap: document.getElementById('bigmap'),
      bigmapcanvas: document.getElementById('bigmapcanvas'),
      menu: document.getElementById('menu'),
      pause: document.getElementById('pause'),
      pausestats: document.getElementById('pausestats'),
      wasted: document.getElementById('wasted'),
      wastedtitle: document.getElementById('wastedtitle'),
      wastedsub: document.getElementById('wastedsub'),
      btncontinue: document.getElementById('btncontinue'),
      contmission: document.getElementById('contmission'),
    };
    this.minimapCtx = this.el.minimap.getContext('2d');
    this.bigmapCtx = this.el.bigmapcanvas.getContext('2d');
    this.toastTimer = null;
    this.objective = { title: '', text: '', marker: null };
  }
  showHud(on) { this.el.hud.classList.toggle('on', on); }
  showMenu(on) { this.el.menu.style.display = on ? 'flex' : 'none'; }
  showPause(on) { this.el.pause.style.display = on ? 'flex' : 'none'; }
  setObjective(title, text, marker) {
    this.objective = { title, text, marker };
    this.el.objtitle.textContent = title || '';
    this.el.objtext.textContent = text || '';
  }
  toast(msg, ms) {
    this.el.toast.textContent = msg;
    this.el.toast.style.opacity = '1';
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { this.el.toast.style.opacity = '0'; }, ms || 3200);
  }
  update() {
    const g = this.game;
    const stars = g.wantedStars;
    let s = '';
    for (let i = 0; i < 5; i++) s += `<span class="${i < stars ? '' : 'off'}">★</span>`;
    this.el.stars.innerHTML = s;
    this.el.cash.textContent = `$${g.cash.toLocaleString('en-US')}`;
    this.el.healthfill.style.width = `${Math.max(0, g.player.health)}%`;
    this.el.healthfill.style.background = g.player.health > 50
      ? 'linear-gradient(90deg,#37e05a,#9dff6e)' : g.player.health > 25
        ? 'linear-gradient(90deg,#e0a537,#ffd23f)' : 'linear-gradient(90deg,#e03737,#ff7a6e)';
    this.el.ammo.textContent = `🔫 ${g.player.mag} / ${g.player.reserve}`;
    this.el.crosshair.style.display = (!g.player.inCar && g.playing) ? 'block' : 'none';
    this.el.speed.style.display = g.player.inCar ? 'block' : 'none';
    if (g.player.inCar && g.player.car) this.el.speedval.textContent = Math.round(Math.abs(g.player.car.speed) * 3.6);
    if (this.objective.marker) {
      const d = Math.hypot(g.player.x - this.objective.marker.x, g.player.z - this.objective.marker.z);
      this.el.objdist.textContent = `${Math.round(d)} m — follow the yellow beacon`;
    } else this.el.objdist.textContent = '';
    this.drawMinimap();
  }
  // Shared map drawing: roads, beach, ocean, landmarks, blips.
  drawMap(ctx, size, big) {
    const g = this.game;
    const scale = size / 660;
    const toMap = (x, z) => [(x + 330) * scale, (z + 330) * scale];
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#274b2e'; ctx.fillRect(0, 0, size, size);
    // Ocean + beach on the east edge.
    ctx.fillStyle = '#1e6f9e'; ctx.fillRect((300 + 330) * scale, 0, size - (300 + 330) * scale, size);
    ctx.fillStyle = '#e8d29a'; ctx.fillRect((270 + 330) * scale, 0, 30 * scale, size);
    // Roads.
    ctx.strokeStyle = '#3a3f47'; ctx.lineWidth = Math.max(2, 9 * scale);
    for (const r of ROADS) {
      const [x1, y1] = toMap(-300, r); const [x2, y2] = toMap(300, r);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      const [x3, y3] = toMap(r, -300); const [x4, y4] = toMap(r, 300);
      ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
    }
    // Landmarks.
    ctx.fillStyle = '#ffd23f';
    for (const [name, [lx, lz]] of Object.entries(g.city.landmarks)) {
      const [mx, my] = toMap(lx, lz);
      ctx.beginPath(); ctx.arc(mx, my, big ? 7 : 4, 0, Math.PI * 2); ctx.fill();
      if (big) { ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial'; ctx.fillText(name.toUpperCase(), mx + 10, my + 4); ctx.fillStyle = '#ffd23f'; }
    }
    // Mission marker.
    if (this.objective.marker) {
      const [mx, my] = toMap(this.objective.marker.x, this.objective.marker.z);
      const pulse = 6 + Math.sin(performance.now() / 220) * 2;
      ctx.fillStyle = '#ffe14d';
      ctx.beginPath(); ctx.arc(mx, my, (big ? 10 : 6) + pulse * 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a5c00'; ctx.lineWidth = 2; ctx.stroke();
    }
    // Traffic dots.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of g.traffic.cars) {
      if (!c.alive) continue;
      const [mx, my] = toMap(c.x, c.z);
      ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // Police.
    ctx.fillStyle = '#ff4d4d';
    for (const c of g.traffic.policeCars) {
      const [mx, my] = toMap(c.x, c.z);
      ctx.beginPath(); ctx.arc(mx, my, big ? 6 : 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const cop of g.people.cops) {
      const [mx, my] = toMap(cop.x, cop.z);
      ctx.beginPath(); ctx.arc(mx, my, big ? 5 : 3, 0, Math.PI * 2); ctx.fill();
    }
    // Player arrow (rotates with heading).
    const [px, py] = toMap(g.player.x, g.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(g.player.heading), Math.cos(g.player.heading)));
    ctx.fillStyle = '#4dc3ff';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    // North marker.
    if (big) { ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.fillText('N ↑', size - 40, 24); }
  }
  drawMinimap() { this.drawMap(this.minimapCtx, 190, false); }
  drawBigmap() { this.drawMap(this.bigmapCtx, 640, true); }
  toggleBigmap(on) {
    this.el.bigmap.style.display = on ? 'flex' : 'none';
    if (on) this.drawBigmap();
  }
  showWasted(title, sub) {
    this.el.wastedtitle.textContent = title;
    this.el.wastedsub.textContent = sub;
    this.el.wasted.style.display = 'flex';
    setTimeout(() => { this.el.wasted.style.display = 'none'; }, 2600);
  }
  refreshMenu(save) {
    if (save && save.missionIndex < MISSIONS.length) {
      this.el.btncontinue.style.display = 'inline-block';
      this.el.contmission.textContent = String(save.missionIndex + 1);
    } else {
      this.el.btncontinue.style.display = 'none';
    }
  }
  pauseStats() {
    const g = this.game;
    const m = g.missions.mission;
    this.el.pausestats.innerHTML =
      `Cash: <b>$${g.cash.toLocaleString('en-US')}</b> &nbsp;·&nbsp; Wanted: <b>${g.wantedStars}★</b><br>` +
      `Mission: <b>${m ? m.id + ' — ' + m.title : 'Story complete'}</b> &nbsp;·&nbsp; Health: <b>${Math.round(g.player.health)}</b>`;
  }
}
