# ANGELS ZERO — 3D model credits

## F-22A Raptor (player aircraft, `assets/angels_zero_f22.glb`)
- **"F22 Raptor FREE"** by **NLM-Group** —
  https://sketchfab.com/3d-models/f22-raptor-free-2a64abf0866a405c865466c7642ca689
- License: **Creative Commons Attribution 4.0 (CC BY 4.0)** — https://creativecommons.org/licenses/by/4.0/
- Changes: rescaled to 18.92 m and re-oriented, landing gear / display plane removed,
  control surfaces re-pivoted onto their hinge lines with hinge metadata, missile
  stations regrouped (two duplicated onto the main-bay rails), textures JPEG-compressed.
  Built by `scripts/prep_f22.py` from the unmodified source file (not committed).

## Terrain erosion & shading techniques (`src/erosion.js`, terrain shader in `src/world.js`)
- **ProceduralTerrains** by **ZyFou** — https://github.com/ZyFou/ProceduralTerrains
- License: **MIT** — Copyright (c) 2026 ZyFou. Permission is hereby granted, free of charge,
  to any person obtaining a copy of this software and associated documentation files, to deal
  in the Software without restriction, subject to including the copyright notice and permission
  notice in all copies or substantial portions; the software is provided "as is", without warranty.
- Adapted: the droplet hydraulic erosion + thermal talus model (`erosion/erosionSim.js`),
  the slope-gated rock / snow and ridge-accent AO terms (`shaders/terrainColor.glsl.js`) and
  the bedded-rock / scree canyon palette ideas (`terrain/dryCanyon.js`). Re-implemented for
  the ANGELS ZERO height grid (protect masks, in-place masked blend, per-vertex analysis) and
  the three.js r160 `MeshStandardMaterial` terrain shader; no files copied verbatim.

Sound credits: see `assets/sfx/CREDITS.md`.
