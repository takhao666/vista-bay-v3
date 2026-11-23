# Vista Bay

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/takhao666/vista-bay-v3/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/takhao666/vista-bay-v3/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
<sub>Entered on [make.fun](https://make.fun/?ref=hvn9m3q0&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>

**Vista Bay** is an original open-world crime game that runs entirely in your browser — no downloads, no accounts, no network. Explore a sun-soaked 600×600 m seaside city on foot or by car, steal vehicles, outrun the Vista Bay Police through a 5-star wanted system, and play through a nine-mission story.

## The story

**Mara Voss** runs Vista Bay from the Golden Palm Casino. Her rival **Dario Kane** wants the city back, and **Rook** — your hacker friend — has a plan to take Kane down for good. Nine missions take you from a first meeting at Vista Bay Plaza to a final shootout on the pier: steal cars for the Voss Garage, shut down Kane's gun deal at the port, hold the lighthouse, pick Rook up from the airfield under police pursuit, clear the casino, chase Kane's armoured Comet across town, and settle it all on the pier.

## The city

- **Downtown** towers around Vista Bay Plaza (fountain, plaza sign)
- **Palm Avenue** and the **Golden Palm Casino**
- **Beach, pier and lighthouse** (rotating beam) on the east shore
- **Vista General Hospital** (respawn point), **the park**, **Vista Bay Airfield** (runway + control tower), and **the port** (containers + gantry crane)
- A full road grid with **26 traffic cars** and **42 pedestrians** who stroll the sidewalks and flee gunfire

## Gameplay

- **On foot & driving** — third-person camera, WASD + mouse look, Shift to run; steal any parked or traffic car with `E`, arcade driving with handbrake
- **Wanted system** — 1 to 5 stars. Crimes raise heat; police cars chase and ram you, foot cops run you down and arrest you, 4+ stars bring **roadblocks**. Lay low and heat decays. Busted or wasted costs 20% of your cash and respawns you at the hospital
- **Combat** — pistol (12-round mag, reload with `R`) and melee punch (`F`). Goons shoot back, cars take damage and **explode**
- **Missions** — 9 missions with a yellow beacon, minimap blip, objective text and distance readout; cash rewards from $200 to $5,000
- **HUD & maps** — wanted stars, cash, health, ammo, mission objective, circular minimap, full-screen map (`M`)
- **Save** — progress (cash, mission, health, ammo, position) auto-saves to `localStorage`
- **Sound** — fully synthesized WebAudio: engine hum, two-tone sirens, gunshots, explosions, mission jingles. No audio files

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Mouse | Look (click to lock) |
| Shift | Run |
| E | Enter / exit car (steal it) |
| Left click | Shoot pistol |
| F | Punch |
| R | Reload |
| Space | Handbrake (in car) |
| M | Big map |
| P / Esc | Pause |

## Run it

```sh
node serve.ts        # serves game/ at http://localhost:8080
```

Open http://localhost:8080 in desktop Chrome and press **Play Vista Bay**. The game is plain static files under `game/` (Three.js r160 vendored as `game/vendor/three.module.min.js`, everything else written for this game) and plays with zero network requests.

## Layout

```
game/
  index.html            HUD, menus, minimap, import map
  vendor/three.module.min.js   Three.js r160 (vendored)
  src/
    main.js             game loop, player, camera, combat, wanted system
    city.js             procedural 600x600 m city + landmarks
    vehicles.js         car models, traffic AI, police pursuit, driving
    people.js           pedestrians, foot police, goons
    missions.js         the 9-mission story chain
    hud.js              HUD, minimap, big map, menus, save UI
    audio.js            synthesized WebAudio sound effects
    input.js            keyboard + mouse + pointer lock
    shots.js            screenshot staging (?shot=chase|play|mission|start)
    config.js           tuning, colours, story cast
    util.js             seeded RNG + math helpers
main.ts                 hands game/ + screenshots/ in as /output/dossier.json
screenshots/            4 captures of the game running (cover first)
```

## License

MIT — see [LICENSE](LICENSE). Vista Bay is an original work: its city, characters, story, art and sounds were made for this game and are not affiliated with, or copied from, any commercial game.
