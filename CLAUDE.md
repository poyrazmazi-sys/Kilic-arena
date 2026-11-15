# Janissary: 1453 - Project rules

Browser first-person shooter set at the 1453 siege of Constantinople. Full plan: GAME_PLAN.md.

## Working rules
- Do not start a milestone before the previous one is approved by the user.
- Stop at the end of each milestone: live Vercel link, screenshots, test steps, and an honest
  list of what looks bad or is broken.
- Vercel preview deploys are pre-approved. Do not ask each time.
- Never use em dashes in anything written for the user (chat, docs, in-game text).
- Check historical facts before using them. Flag anything uncertain in GAME_PLAN.md section 8.
- If a file cannot be downloaded here (Mixamo and others), tell the user exactly which file
  to get and where to put it.

## Tech stack
- Three.js, TypeScript (strict), Vite. WebGL2 baseline; WebGPU optional, never required.
- pmndrs/postprocessing, Rapier (WASM), Web Audio / Howler.
- Assets: GLB with Meshopt or Draco, KTX2 textures. Hosting: Vercel.
- Keep simulation state separate from rendering and driven by inputs, so co-op can be added.

## Art rules
- Fixed sunset. Low golden sun behind the Ottoman lines (west), haze, god rays through smoke.
- Weathered limestone and brick, mud, rusted iron, worn leather, moving cloth.
- First person only. Minimal HUD with gold Ottoman line details, never sci-fi.
- Light blood puffs only. No lingering blood, no dismemberment.
- Real history, real peoples: no caricature or mockery of either side.
- All user-facing text in English and Turkish.

## Performance targets
- Good PC GPU: 60 fps at 1080p on High. Non-gaming laptop: 30+ fps on Low / Medium.
- iPad Air M1 (Safari): 30 to 60 fps on Medium, load under 20 s.
- Initial download under 60 MB (40 MB on iPad preset). At most 6 active enemies.
- Quality presets Low / Medium / High / Ultra with auto detection. PC first, iPad after.
