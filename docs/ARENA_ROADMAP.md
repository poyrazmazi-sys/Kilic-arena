# Kılıç Arena: analysis, research and roadmap

This covers the duel inside the arena. The crowd is left out on purpose and will be handled separately.

## 1. What the fight simulator found

`tools/simulate.mjs` plays bot-against-bot rounds at full speed and counts what happened to every swing. Run it with:

```
npm run arena                                   # dev server on port 5174
PW=$(npm root -g)/playwright node tools/simulate.mjs 20 1 1
```

`tools/mirror.mjs` gives both bots the same dice and mirrored starting spots. In a fair game, the fight plays out as an exact mirror, and the first frame where it stops being a mirror points at the bug.

| | Before | After |
|---|---|---|
| Light swings that land | 9% | 44 to 52% |
| Light swings parried | about 1 in 5 of the swings that connect | about 1 in 7 |
| Average round | 57 s | 17 to 25 s |
| Rounds won by one side | 20 of 20 | 13 vs 7, and 6 vs 6 with the looks swapped |
| Leaping strike lands | 100% (unrealistic, it steered in mid-air) | 47% against an alert opponent; still kills a target standing still |
| Frames where bodies overlap | 0.01 to 1.2% | 0 to 0.04% |

Bugs it found and that are now fixed:

1. **The loser of round 1 was crippled for the rest of the match.** The death animation kept playing underneath everything after the reset, so every later move was half-blended with lying on the floor.
2. **Trades of blows were unfair.** When both blades landed in the same frame, the second blow's type was read after the first blow had already knocked the attacker into "hit", so a heavy counted as a light.
3. **Every reactive block became a parry.** The parry window was 0.22 s and bots raised their guard 0.1 s before impact. The window is now 0.15 s, bots block early, and a parry has to be timed to meet the blade.
4. **Bots swung at air.** They attacked from 2.5 m, while the kılıç reaches about 1.7 m.
5. **The leap steered in mid-air.** It now aims once, at take-off.

What the numbers still say is wrong:

- **Heavy attacks land only about 12% of the time.** The wind-up is long, the lunge is short, and the bot only reaches for a heavy when the target is already backing off.
- **"Missed" is overcounted.** The simulator counts each swing of a combo separately, so a three-swing combo that lands once still logs two misses. It needs a per-combo count.
- **A dodge almost never shows up as an "evade".** Dodges work by moving out of reach rather than letting the blade pass through, so they're logged as misses. That's realistic, but the stat should say so.

## 2. Market research: what realistic sword games do

| Game | What makes it feel real | What to take from it |
|---|---|---|
| **Half Sword** | Fully physics-simulated bodies and weapons. No attack button: you move the sword with the mouse. Weapons have real weight and balance. Built with HEMA practitioners. Stamina stops wild flailing. | Physics-driven arms layered on animation ("active ragdoll"): a hidden animated skeleton gives the target, and joint motors pull the physical body toward it. |
| **Hellish Quart** | Every fencing move is motion-captured from real fencers. One-on-one duels, with physics on contact. Often called the closest to real swordfighting. | Real mocap for every move, with physics only where blades and bodies meet. This is the most achievable model for us. |
| **Kingdom Come: Deliverance II** | Directional attacks, a perfect block with a visible timing cue, and a "master strike" (a perfect block that turns into a counter-cut). Stamina drains when blocking. | Directional guard, a readable parry cue, and counter-cuts. |
| **For Honor** | Three-direction guard (left, right, top), parries that need a matching heavy, feints, guard breaks, and a guard meter. | Directions turn the duel into reading the opponent. Feints beat a turtling defender. |
| **Chivalry 2 / Mordhau** | A riposte right after a successful parry, plus feints, drags and accels (stretching or speeding a swing). | Riposte and feints give skilled players expression. |
| **Sekiro** (from general knowledge, not searched this session) | A posture meter fills when you block and empties when you're idle. Breaking posture opens a deathblow. Deflects build the enemy's posture. | Posture instead of pure health makes defence active. Our leaping finisher could become a posture-break finisher. |

What matters most for us:

1. Realism comes from **real motion capture for every move**, from **contact physics** (blades stop on bone and bounce off steel), and from **commitment** (you can't cancel a swing or steer a jump).
2. The best duels are **reading games**: direction, timing, feints and spacing.
3. **Feedback** sells the impact: hit-stop, a camera kick, a different sound per surface, blood that matches the cut.

## 3. Realistic characters and motion beyond Mixamo

| Source | What it is | Licence | Can I fetch it from here? |
|---|---|---|---|
| **MPFB 2** (MakeHuman for Blender) | Generates realistic human bodies with skin, hair, eyes and clothes, rigged automatically, inside Blender. | Software GPL. Generated characters and bundled assets are **CC0**, free for anything. | Yes, likely. It's a Blender extension, and I already run Blender here. This is the best path to **different characters**: janissaries, Byzantine guards, a Genoese captain, each with their own face and build. |
| **Bandai Namco Research Motion Dataset** | About 3,000 professional mocap moves in BVH format, including fighting. | **Non-commercial**. Fine for a free game; check the LICENSE file. | Possibly, if GitHub downloads work. |
| **MoCap Online, free sword pack** | Sword mocap: slashes, thrusts, parries, blocks, ripostes, combos. FBX. | A licence is included, but the terms need reading before any commercial use. | No. It needs an account, so you would download it and drop it here. |
| **Rokoko free mocap library** | Free mocap moves, FBX or BVH, usable in Blender. | Free. | No. It needs an account. |
| **CMU Motion Capture Database** (general knowledge, not checked this session) | A large free academic mocap library. Mostly everyday motion, with some fighting. | Free to use. | Possibly. |
| **Sketchfab** | Many downloadable medieval soldier models, some under CC-BY. | Varies per model. | No. It needs an account. |

Recommended path:

1. Build three or four distinct fighters with **MPFB** in Blender here: different builds, faces and outfits.
2. Get **real sword mocap**: the MoCap Online free sword pack is the best match (you download it), plus the Bandai Namco dataset for footwork and reactions.
3. Retarget everything onto one shared skeleton in Blender, the same pipeline used for the leap.

## 4. Over 200 improvements for inside the arena

### Movement and footwork

1. Real strafe left and right animations instead of walking with a turned body.
2. A walking-backward animation with a guard held up.
3. Foot locking (inverse kinematics) so feet stop sliding when the speed doesn't match the step.
4. Feet that follow the ground and plant on contact.
5. A turn-in-place animation when the facing changes a lot.
6. A fencing-style "advance" and "retreat" step instead of walking.
7. Speed that depends on stance, slower in a low guard.
8. Sprinting only out of range, with the guard dropped while sprinting.
9. Momentum: no instant 180° turns while sprinting.
10. A quick backstep as a separate, cheaper move than the full dodge.
11. Stumble animations when knocked back hard.
12. Slipping on blood stains in the sand, as a rare event.
13. Leaning the torso toward the direction of travel.
14. Breathing heavier as stamina drops.
15. Staying in a guard stance between attacks instead of returning to a relaxed idle.
16. Pivot steps around the opponent (circling) as a dedicated input.
17. Closing distance faster when the opponent is stunned.
18. A slight step back after being blocked.
19. Fighters can't walk through the sword arm of a blocking opponent.
20. Feet kick up sand puffs on fast moves.

### Attacks

21. Directional attacks (left, right, overhead and thrust) chosen by mouse or stick direction.
22. Real mocap for each direction.
23. A thrust, the fastest and longest-reaching attack, with a narrow hit area.
24. Feints: cancel a heavy during its wind-up at a stamina cost.
25. A riposte: a fast counter-cut available right after a successful parry.
26. Combos that change with direction, such as left then right then overhead.
27. A chambered attack: attack into an incoming attack in the same direction to deflect it and strike.
28. Attack speed scales with stamina, so tired fighters swing slower.
29. Accel and drag: turning while swinging speeds up or delays the hit.
30. A pommel strike at very close range.
31. A shoulder barge or shove to create space.
32. A kick to break a turtling guard.
33. A grab and throw at very close range.
34. Swings bounce off and stop when they hit the opponent's blade.
35. A cut that hits the arena wall stops with sparks and a recoil.
36. Attacks can be released early or held, like Half Sword's freeform input.
37. The heavy wind-up shows a readable "glint" a moment before release.
38. Wind-up length varies a little so players can't count it exactly.
39. Hit area follows the real blade arc each frame (already true), with motion blur on the blade.
40. A drawn-out final blow when the opponent is near death, as an optional cinematic.
41. The leaping finisher is earned by building momentum instead of being free once.
42. The leap shows a meter or glow when it's available.
43. A low sweep at the legs as a counter to someone who blocks high.
44. A rising cut from a low guard.
45. Holding the kılıç two-handed for a slower, stronger mode.
46. A dual-wield variant for one character.
47. Attacking while backing off, weaker but safer.
48. Attacks that miss leave you briefly open (recovery frames that can be punished).
49. A combo ender that pushes the opponent back.
50. Light attacks chip stamina off a blocker.

### Defence: block, parry and dodge

51. Directional guard: block left, right or top to match the attack.
52. A visible guard-direction indicator, minimal and gold, in keeping with the HUD.
53. A perfect-block cue: a small flash at the right moment, like Kingdom Come.
54. A parry animation that actually deflects the enemy blade aside.
55. Parry success depends on matching direction and timing.
56. A failed parry (too early) leaves you briefly open.
57. Holding block drains stamina over time.
58. A guard break when stamina hits zero while blocking (exists, needs its own animation).
59. A block that turns the blade (edge deflection) for a skilled late block.
60. Dodge directions: left, right, back and a forward roll past the opponent.
61. Dodge invulnerability tied to the animation, not a fixed timer.
62. A dodge-cancel into an attack (a counter-dodge).
63. A dodge costs more stamina when done twice in a row.
64. Real dodge mocap: side-steps, ducks and leans.
65. Ducking under a high horizontal cut.
66. Jumping over a low sweep.
67. Blocking with the forearm or vambrace at close range, which hurts but stops the blade.
68. A posture meter (Sekiro style) that fills when you block and drains when you rest.
69. A posture break opens a finisher, instead of the free once-a-match leap.
70. The defender's guard visibly wobbles as posture fills.
71. Parry timing windows scale with difficulty.
72. A bind: blades lock, and both push until one wins.
73. Disarms: a perfect parry on a heavy can knock the sword away.
74. Picking up a dropped sword from the sand.
75. Catching a blade with a grab at very high risk and reward.

### Hit reactions and damage

76. Hit reactions that depend on where you were hit (head, chest, left arm, right arm, legs).
77. Hit reactions that depend on direction (pushed left, right or back).
78. Additive flinches so a light hit doesn't stop your own swing entirely.
79. Limping after leg wounds.
80. A weaker sword arm after right-arm wounds: slower attacks.
81. Dizziness after head hits: a camera sway in first person.
82. Bleeding: wounds drain a little health over time.
83. Bandaging between rounds to stop bleeding.
84. Armour zones: mail stops light cuts on the torso, while arms and legs are open.
85. Glancing blows: a hit at a shallow angle does less damage and slides off.
86. Cut versus thrust damage: thrusts go deeper, cuts bleed more.
87. Blade edge versus flat: hitting with the flat only bruises.
88. Wounds that line up with the blade's direction (the angle is random now).
89. Wound size from blade speed at impact.
90. Clothes that tear where cut.
91. Blood that drips from wounds over time, not only on impact.
92. Blood on the blade after a hit, cleaned between rounds.
93. Blood soaking into the sand over time.
94. Kneeling when health is critical, with a last-stand option.
95. Yielding: hold a button to surrender a round.
96. Deaths that fall the way the blow pushed them (physics ragdoll on death).
97. A ragdoll blended with the animation for big hits (partial physics).
98. Knockdowns: heavy hits can put someone on the ground, and they must roll up.
99. Getting up from the ground with a vulnerable window.
100. A finishing blow on a downed opponent.

### Physics

101. An active ragdoll: physical bodies driven by joint motors toward the animation, as in Half Sword.
102. A weighted sword with real inertia: the swing arc follows mass and arm strength.
103. Blade-on-blade collision, so swords can't pass through each other.
104. Blade-on-body collision stops the blade instead of passing through.
105. A rigid-body physics engine (Rapier or cannon-es) for bodies and props.
106. Capsule colliders per limb (bodies already use bone circles).
107. Knockback scaled by the attacker's momentum.
108. Impacts transfer momentum into the defender's upper body (head snap, torso twist).
109. Friction on sand: slower acceleration, slight slide on sharp turns.
110. Jumping with real gravity and air time (the leap uses an authored arc now).
111. Dead bodies stay as physical obstacles.
112. Swords that fall with physics when dropped.
113. Hat physics: the börk can be knocked off by a head hit.
114. Cloth simulation for robes and sashes.
115. Arena props that react: weapon racks, barrels and banners at the arena edge.
116. Wall collision that reflects knockback (bounce off the wall).
117. Server-side physics for multiplayer fairness.
118. A deterministic physics step (fixed 60 Hz) for replays and netcode.
119. Hit-stop scaled by mass and impact speed (fixed values now).
120. Slow motion on the final blow of a match.

### Animation

121. Real mocap for every move. This is the single biggest realism upgrade.
122. One shared skeleton for all characters, retargeted in Blender.
123. Root motion from mocap for attacks, so the feet stay planted.
124. Motion matching: pick the best animation frame for the current speed and direction.
125. Inertialisation blending instead of cross-fades, for snappier transitions.
126. Upper and lower body layers: walk and swing at the same time.
127. Head look-at: always watch the opponent.
128. Eyes that follow the opponent.
129. Facial expressions: strain when attacking, pain when hit.
130. Breathing animation on the chest.
131. Finger poses on the grip (the hand pose is generic now).
132. A left-hand pose that balances or grips during swings.
133. Weapon trails during fast swings, subtle and only above a speed threshold.
134. Anticipation poses before attacks for readability.
135. Recovery poses after attacks.
136. Unique idle animations per character.
137. Victory and defeat animations at round end.
138. Taunts and salutes before a round (bowing to the Sultan).
139. Walk-in animations from the gate at the start of a match.
140. Sheathing and unsheathing animations.

### Weapons

141. The current kılıç with correct balance (weight toward the yelman, the widened tip).
142. A shamshir variant: more curve, slicing.
143. A Byzantine spathion or straight arming sword for opponents.
144. A Genoese longsword for the captain.
145. A mace or bozdogan: blunt, breaks guards, slow.
146. A spear: long reach, thrust only, weak up close.
147. Shields: the round kalkan for janissaries, a kite shield for knights.
148. Daggers for off-hand parrying.
149. Per-weapon reach, speed, damage and parry window.
150. Weapon wear: blades chip after many parries.
151. Choosing a weapon before the match.
152. Unlocking weapons by winning.
153. Weapon cosmetics: hilts, engravings, gold inlay.
154. Throwing a weapon as a desperate move.
155. Weapon-specific sounds: whoosh, clang, flesh.

### Characters

156. Three or four distinct fighters built with MPFB: a janissary, a Byzantine guard, a Genoese captain, a sipahi.
157. Different builds: light and fast versus heavy and strong.
158. Real faces with skin detail (MPFB skin textures).
159. Historically grounded outfits: janissary kaftan and börk, lamellar armour, mail.
160. Armour that changes stats: heavier is slower but takes less damage.
161. Visible damage on armour (dents and scratches).
162. A character select screen with a short bio for each.
163. Left-handed fighters (mirrored animations).
164. Custom colours for the kaftan and sash.
165. A name and emblem shown on the banner during the match.

### Bot opponents

166. Bots that use directional attacks and guards.
167. Bots that feint.
168. Bots that learn your habits within a match (if you always dodge left...).
169. Personalities: aggressive, defensive, counter-puncher.
170. Bots that retreat to recover stamina.
171. Bots that use the wall to corner you.
172. Bots whose difficulty changes reaction time, not only health.
173. A training dummy and a practice mode.
174. Bots that taunt after a successful parry.
175. A boss-level champion with unique moves.

### Camera

176. A first-person head bob from the real head motion, already used, but smoothed better.
177. A first-person view that shows your own body when looking down.
178. A third-person camera that frames both fighters automatically.
179. Camera shake scaled by impact.
180. A short slow-motion close-up on a finisher.
181. A kill-cam replay of the final blow.
182. A free photo mode.
183. Camera collision with arena props.
184. A choice of field of view in settings.
185. A spectator drone that predicts big moments, cutting to the side view on a wind-up.

### Controls

186. Mouse direction for attack and guard direction (For Honor or Half Sword style).
187. Controller right stick for direction.
188. Rumble feedback on hits and parries for controllers.
189. Touch gestures: swipe direction to attack on iPad.
190. Remappable keys.
191. Hold-versus-tap settings for block.
192. An input buffer: actions pressed slightly early still come out.
193. Aim assist for direction on touch.
194. A control tutorial overlay for each device.
195. Sensitivity settings for touch look.

### Feel and feedback

196. A separate sound per surface: flesh, mail, blade and wood.
197. Recorded audio instead of synthesised sound: real steel clashes and grunts.
198. Voice grunts on effort and pain.
199. Heartbeat audio at low health.
200. A screen-edge red vignette that matches wound severity.
201. A muffled audio moment on a heavy head hit.
202. Spark direction that follows the blade contact.
203. A dust burst on knockdowns.
204. Hit-stop on parries that feels different from hits.
205. A subtle slow-down on a perfect parry.

### The arena itself (not the crowd)

206. Sand that shows footprints and drag marks.
207. Raked sand patterns that get disturbed during the fight.
208. Dynamic time of day per match: noon, sunset, torch-lit night.
209. Rain or wind weather that affects footing.
210. Gates that open for the walk-in and close behind you.
211. Weapon racks along the wall you can grab from.
212. Wooden posts or pillars as obstacles in some arena variants.
213. Different arenas: a palace courtyard, a ship deck, a snowy fortress.
214. Arena hazards in a "wild" mode: fire pits and spikes.
215. Sun glare in some directions, affecting play in first person.
216. Real shadows from the stands across the sand.
217. Banners on the arena wall reacting to the wind.
218. Braziers that can be knocked over.

### Rules and modes

219. Best of three or best of five settings.
220. First blood mode: one hit wins.
221. Point-based fencing mode: clean hits score.
222. Last janissary standing: 1 v 1 v 1 v 1.
223. 2 v 2 team duels.
224. A tournament bracket with a final in front of the Sultan.
225. Ranked online duels with a rating.
226. Daily challenges such as "win only with parries".

### Multiplayer

227. Rollback netcode for fair hits at higher ping.
228. Prediction of the opponent's movement between updates.
229. Server-confirmed hits to stop cheating.
230. Ping shown in the HUD.
231. Rematch button and an invite link that fills in the code.
232. Spectator chat with quick phrases only (safe for younger players).
233. A fallback relay server for networks that block direct connections.

### Interface, onboarding and quality

234. A short interactive tutorial: move, attack, block, parry, dodge, leap.
235. A post-match stats screen: hits, parries, damage, longest combo.
236. A replay of the whole match with the drone camera.
237. Accessibility: colour-blind safe HUD and subtitles for all sounds.
238. Performance targets checked automatically by the simulator.
239. The simulator run on every push (a GitHub Action) so balance breaks get caught.
240. A per-combo miss count and an "evaded by moving" stat in the simulator.

## 5. Recommended order

1. **Real mocap and real characters.** Get the MoCap Online sword pack and build MPFB fighters. This is the biggest jump in realism.
2. **Directional combat.** Directional attacks and guards, parries that deflect, ripostes and feints. This is the biggest jump in depth.
3. **Contact physics.** Blades stop on bodies and bounce off blades, with a partial ragdoll on big hits.
4. **Feedback.** Recorded sounds, surface-specific impacts and hit reactions by body zone.
5. **Characters, weapons and modes.**

## Sources

- [Is Hellish Quart the most realistic swordfighting game ever? (Black Gate)](https://www.blackgate.com/?p=476852)
- [How Half Sword makes bloody, brutal medieval combat feel real (Epic Games Store)](https://store.epicgames.com/news/how-half-sword-makes-bloody-brutal-medieval-combat-feel-real)
- [Half Sword review (Windows Central)](https://www.windowscentral.com/gaming/the-first-new-game-i-played-in-2025-is-the-medieval-combat-sim-ive-always-wanted-and-its-free-to-try)
- [Half Sword developer comments (itch.io)](https://knives-frank.itch.io/halfsword/comments?after=0)
- [UE5 active ragdoll write-up (Unreal Engine forums)](https://forums.unrealengine.com/t/how-i-spent-weeks-fighting-ue5-physics-to-create-a-gta-4-rdr2-style-active-ragdoll-and-the-exact-blueprint-to-do-it/2851065)
- [Kingdom Come: Deliverance II block, parry, dodge and riposte (Beebom)](https://beebom.com/how-to-block-parry-dodge-riposte-in-kingdom-come-deliverance-2)
- [Kingdom Come: Deliverance basic combat (wiki)](https://kingdomcomedeliverance.wiki.gg/wiki/Basic_Combat)
- [How to parry, feint, throw and deflect in For Honor (Ubisoft)](https://ubisoft.com/en-us/game/for-honor/news-updates/2VDFay31pTMHwu1vX99TO3/how-to-parry-feint-throw-and-deflect-for-honor-tips)
- [Rock, paper, guard breaks: a mechanics deep dive into For Honor (Game Developer)](https://gamedeveloper.com/design/rock-paper-guard-breaks-a-mechanics-deep-dive-into-for-honor)
- [Chivalry 2 combat guide (PC Gamer)](https://pcgamer.com/chivalry-2-weapons-classes-guide)
- [MPFB on GitHub](https://github.com/makehumancommunity/mpfb2)
- [About MPFB](https://static.makehumancommunity.org/mpfb/about.html)
- [MPFB 2 overview (CG Channel)](https://www.cgchannel.com/2025/03/check-out-open-source-blender-character-generation-plugin-mpfb-2)
- [3,000 free mocap moves from Bandai Namco (CG Channel)](https://www.cgchannel.com/2022/05/download-3000-free-mocap-moves-from-bandai-namco-research/)
- [MoCap Online free sword animation pack (itch.io)](https://mocaponline.itch.io/free-3d-sword-animation-pack)
- [MoCap Online T.C. sword animation pack](https://mocaponline.com/blogs/mocap-news/tc-sword-animations)
- [MoCap Online free animations](https://mocaponline.com/pages/free-animations)
- [Touché: data-driven interactive sword fighting in VR (University of Bath)](https://researchdata.bath.ac.uk/754)
