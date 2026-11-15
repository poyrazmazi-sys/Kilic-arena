# Janissary: 1453 - Game Plan

Status: DRAFT, waiting for approval. No game code is written until this is approved.

## 1. What we are building

A short, highly polished first-person shooter in the browser. You play a janissary during the
Ottoman siege of Constantinople, 1453. One level first, made to look as good as possible.

Signature moment: standing on a captured tower of the outer wall at sunset, arquebus in hand,
smoke drifting, the great bombard firing from the Ottoman lines, the city glowing gold ahead.

## 2. Decisions from the interview

| Topic | Decision |
|---|---|
| Realism vs fun | Grounded but fun. Authentic weapons and look, reload about 6 to 8 s, generous ammo |
| Engine | Three.js + TypeScript + Vite. Unreal stays a possible later port |
| Hosting | Vercel. Preview deploys without asking |
| Devices | PC browser first (Chrome / Edge). iPad Air M1 (Safari) after the PC build works |
| PC hardware | Unknown / non-gaming laptop plus a stronger second PC. Auto quality detection, manual Low / Medium / High / Ultra |
| Controls | Keyboard and mouse first, iPad touch second, controller later |
| Player side | Ottoman attacker. Level 1: hold a captured section of the outer wall against counterattacks |
| Level 1 length | 8 to 10 minutes |
| Players | Single player first. Co-op for 2 to 4 by invite link after Level 1 feels right. No PvP |
| Difficulty | Easy / Normal / Hard |
| Finale | Boss: an enemy captain in heavy armour |
| Time of day | Fixed sunset |
| Camera | First person only |
| HUD | Minimal: compass, health, ammo, reload cue. Gold Ottoman line details. Fades when idle |
| Story | Fictional named janissary. Short text before and after the level. No cutscenes |
| Language | English and Turkish text with a switch. Turkish battlefield shouts with subtitles |
| Violence | Light blood puffs on hit. Nothing lingering, no dismemberment |
| Level 1 weapons | Matchlock arquebus and kilic (slash and block). Bow and fire pots in milestone 5 |
| Saving | Checkpoint at the start of each wave. Settings and progress stored in the browser. No unlocks yet |
| Music | Mehter instruments (davul, zurna, kos) over a low orchestral bed that builds with the waves |
| Name | Janissary: 1453 |
| Check-ins | Stop at the end of every milestone with a link, screenshots and an honest problem list |

## 3. Level 1: The Walls at Sunset

Setting: a tower and stretch of walkway on the outer Theodosian wall, just taken by the Ottomans.
To the west: the moat, siege lines, the camp, the bombard, and the setting sun.
To the east: the taller inner wall and the city, lit gold.

Flow (8 to 10 minutes):

1. Arrival (about 1 min). Text card with date and place. You climb onto the wall. No enemies.
   Time to look around. This is the signature view.
2. Wave 1 (about 1.5 min). A few spearmen come along the walkway. Teaches fire, reload, sword.
3. Wave 2 (about 2 min). Crossbowmen on the inner wall plus spearmen from both sides. Teaches cover.
4. Bombard beat (about 30 s). The great bombard fires. Impact, dust, camera shake, debris.
5. Wave 3 (about 2 min). Largest wave. Early handgunners join. Enemies flank through the tower.
6. Boss (about 2 min). The enemy captain in plate armour with a small guard. Armour shrugs off
   poorly placed shots, so reload timing and the sword block matter.
7. Ending. Banner raised on the tower, short text, results screen.

Enemy count on Normal: about 4, 7 and 10 per wave, at most 6 active at once (iPad budget).
Easy and Hard change enemy health, accuracy and count.

Enemy types: spearman (rushes), crossbowman (slow, accurate, uses cover), handgunner (rare,
loud, inaccurate), captain (boss). AI: take cover, flank, fall back when hurt.

## 4. Weapons

Arquebus: one heavy shot, large muzzle flash and a smoke cloud that really blocks your view,
strong recoil, visible multi-step reload of about 6 to 8 s. Reload can be interrupted by
switching to the sword. Around 30 shots carried.

Kilic: fast slash, heavier slash, block. The answer to being rushed while reloading.

## 5. Tech

- Three.js, TypeScript, Vite. WebGL2 as the baseline. WebGPU only as an optional extra on PC
  if it proves stable; the game must never depend on it.
- pmndrs/postprocessing: bloom, ambient occlusion, god rays, fog, colour grading, tone mapping.
  Depth of field only on High and Ultra.
- Rapier (WASM) for collision, character controller and debris.
- glTF / GLB with Meshopt or Draco, KTX2 textures.
- Web Audio with positional sound (Howler if it saves time).
- Lighting: fixed sunset means static lighting can be baked. One real-time shadowed sun,
  baked lightmaps and ambient occlusion for the wall, HDR sky from Poly Haven.
- Co-op readiness: game state (players, enemies, shots) kept separate from rendering, and the
  simulation driven by inputs, so a network layer can be added later without a rewrite.
  Note: Vercel does not host long-lived game servers, so co-op will need either peer to peer
  (WebRTC) or a small separate realtime server. Decided at the co-op milestone.

Performance targets:

| Device | Target |
|---|---|
| Good PC GPU | 60 fps at 1080p on High |
| Non-gaming laptop | 30+ fps on Low / Medium |
| iPad Air M1 | 30 to 60 fps on Medium, load under 20 s |

Rough budgets: initial download under 60 MB (under 40 MB on the iPad preset), about 300k
triangles on screen on iPad, 2k textures on iPad and 4k only for hero assets on PC.

## 6. Assets and tools

| Need | Source |
|---|---|
| Concept art (3 directions to choose from) | Higgsfield |
| Sky and stone / wood / ground textures | Poly Haven (free, CC0) |
| Arquebus, kilic, bombard, props | Higgsfield 3D, cleaned up in Blender |
| Wall section and lightmap baking | Blender (needs the laptop connected) |
| Soldier animations | Mixamo. Needs your Adobe login, so I will list the exact files for you to download |
| Sound effects, music, voice shouts | Higgsfield audio, plus free CC0 libraries |
| Hosting | Vercel |

Blender is not connected to this session yet. If it stays unavailable, the fallback is to build
the wall geometry in code and bake less, which will look somewhat worse.

## 7. Milestones

| # | Milestone | Done when |
|---|---|---|
| 0 | Plan | This file and CLAUDE.md approved |
| 1 | Look test | 3 concept directions shown, one approved, then a walkable wall at sunset with final lighting. No enemies. Vercel link |
| 2 | Gun feel | Arquebus with recoil, smoke, reload and sound. Target dummies. Sword basics |
| 3 | Combat | Enemies with animations and AI, waves, health, HUD, checkpoints |
| 4 | Level 1 complete | Start screen, settings, difficulty, boss, ending, both languages. iPad touch controls and iPad tuning |
| 5 | Co-op | 2 to 4 players by invite link on Level 1 |
| 6 | Expand | Bow, fire pots, controller, Level 2 (The Breach) |

Each milestone ends with: a live link, screenshots, how to test, and a list of what looks bad
or does not work.

## 8. Historical notes and things to check

Confirmed:
- Siege: 6 April to 29 May 1453, Ottoman army led by Sultan Mehmed II.
- Theodosian land walls: moat, outer wall, taller inner wall.
- Orban's great bombard; Ottoman ships moved overland into the Golden Horn (22 April).

Flags where the game departs from history or I am not certain:
- Sun direction. The land walls face west, so the sun sets behind the Ottoman lines, not over
  the Golden Horn (which lies to the north-east). The plan uses the real geography: sunset
  behind the camp, city front-lit in gold. The Golden Horn is visible in the distance only.
- Holding a captured stretch of outer wall at sunset is invented. The final assault began
  before dawn on 29 May. The text will present the level as fiction set within the siege.
- Firearms. Janissaries used early handguns in this period, but a true matchlock arquebus
  with a trigger mechanism is slightly ahead of its time for 1453. Kept on purpose for feel.
- Uniform. The white bork is right. Standardised red and blue coats are better documented for
  later centuries, so colours here are a reasonable reconstruction, not a certainty.
- The boss is a fictional Genoese officer, not the real commander Giovanni Giustiniani, out of
  respect for real people. Both sides are shown as capable soldiers, with no caricature.
- Turkish shouts will be modern-leaning Turkish. Authentic 15th century Ottoman Turkish needs
  review by you or a specialist.

## 9. Honest expectations

- Three.js can get the lighting, haze, smoke and weapon very convincing in stills and short
  clips. It will not match a Call of Duty budget in character faces, animation blending or
  large crowds. Enemies seen up close are the most likely weak point.
- AI generated 3D models often need clean-up. Some may need several attempts or a swap for
  hand-picked free models.
- Co-op is the largest single engineering item after the level itself.

## 10. Open questions

1. Player character name. Suggestion: Davud, a young janissary. Yours to change.
2. Anything you definitely do NOT want in the game?
3. Blender: connect the laptop before milestone 1, or start with the code-built fallback?
