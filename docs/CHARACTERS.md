# Fighters: how they are made

All three fighters are built in Blender from scripts, so they can be rebuilt or changed at any time.

| Fighter | Who | Look |
|---|---|---|
| Davud | Young janissary | Red kaftan to the knee, blue trousers, yellow boots, white börk with a gold band |
| Theodoros | Byzantine guard, older and heavier | Mail shirt over a blue tunic, conical helmet with a nose guard |
| Lorenzo | Genoese captain, tall | Steel breastplate over a crimson doublet, red cap |

## Pipeline

1. `blender/build_cast.py` builds the bodies with **MPFB** (MakeHuman for Blender). It sets build, age and muscle per fighter, shapes the face (nose, chin, head shape), adds MPFB's Mixamo-compatible skeleton, and makes the clothes from each body's own surface so they bend exactly with it.
2. `blender/build_characters.py --preview` builds the Mixamo knight's clip library and the hand-built moves (block, dodges, leap) from motion-capture poses.
3. `blender/retarget.py` moves every clip onto each fighter. It also brings in real motion capture from the Bandai Namco dataset: sidesteps, walking backwards, two slashes, a kick, a dash and a bow. It exports `public/models/fighter_<name>.glb`.
4. `python3 tools/pack.py` packs the models for the website.

The retargeter turns each target bone to point the way the source's rest pose does, keeping its own twist, then follows the source's world rotation with that fixed offset. The hips follow the source's travel, scaled by leg length. It works between skeletons with different rest poses and bone rolls.

## Setup (once per machine)

- Blender as a Python module (`pip install bpy`, Python 3.13).
- MPFB: clone `https://github.com/makehumancommunity/mpfb2`, zip `src/mpfb`, and install it with `bpy.ops.extensions.package_install_files(..., repo='user_default', enable_on_install=True)`.
- Bandai Namco dataset: clone `https://github.com/BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset`, and point the `BANDAI` environment variable at its `dataset/Bandai-Namco-Research-Motiondataset-1/data` folder.

## Licences and credits

- **MPFB**: the code is GPL, and the generated characters and bundled assets are **CC0**, free for any use.
- **Bandai Namco Research Motion Dataset**: **CC BY-NC 4.0**. Credit is required (shown in the game menu), and it may **not be used commercially**. If the game is ever sold, these clips (`strafe_left`, `strafe_right`, `walk_back`, `slash_b`, `slash_c`, `kick`, `dash`, `bow`, `walk_mocap`, `run_mocap`) must be replaced.
- **Mixamo** animations and the knight: Adobe's Mixamo terms.

## Known gaps

- The clothes are fitted shells, closer to tights than loose fabric. Folds, cloth simulation or proper garment models would add a lot.
- There are no eyebrows, eyelashes or beards yet. The moustache was removed until it can be placed properly.
- Skin is a plain material. MPFB's layered skin uses Blender nodes that don't export to the web, so it needs baking.
- The old knight model is still downloaded once, as the reference for how the sword sits in the hand. The grip could be precomputed instead.
