// Vista Bay — screenshot staging: ?shot=start|play|chase|mission&seed=N sets the
// game up deterministically so the maker's screenshots show real systems.
// ?shot=start  -> title menu (cover is set by shots.json instead)
// ?shot=play   -> on foot on Palm Avenue, mission 1 active
// ?shot=chase  -> driving with a 3-star chase, police behind, minimap + HUD
// ?shot=mission-> port shootout, mission 4 active, goons + objective beacon
export function applyShot(game, params) {
  const shot = params.get('shot');
  if (!shot) return false;
  const seed = Number(params.get('seed') || 7);
  game.rng = game.makeRng(seed);
  if (shot === 'start') {
    game.showMenuOnly();
    return true;
  }
  game.startGame({ fresh: true, silent: true });
  if (shot === 'play') {
    game.teleportPlayer(-30, 30, Math.PI * 0.75);
    game.missions.startMission(0);
  } else if (shot === 'chase') {
    game.teleportPlayer(30, 90, Math.PI / 2);
    const car = game.traffic.parked[0] || game.traffic.cars[0];
    game.enterCar(car, true);
    // Park the chase on the road itself, eastbound, so the car, the police
    // behind it and the city all read in the frame.
    car.x = -120; car.z = 92.6; car.heading = Math.PI / 2;
    car.speed = 18;
    game.player.car.speed = 18;
    game.addHeat(70);
    game.missions.startMission(5);
    game.spawnPoliceForShot();
  } else if (shot === 'mission') {
    game.teleportPlayer(-252, 222, -1.19);
    game.missions.startMission(3);
    game.player.mag = 12; game.player.reserve = 120;
  }
  // Let the world settle a few frames so traffic spreads out.
  for (let i = 0; i < 40; i++) game.step(1 / 30, true);
  return true;
}
