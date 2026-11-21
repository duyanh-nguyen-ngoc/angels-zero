# TASK_SPEC — IR vs RADAR Missile Counterplay: Flares, Chaff, Radar Notching, RWR Tags (for OpenCode)

> Repo root = this folder. Everything deployable is in `angel-zero/`.
> Read `angel-zero/AGENTS.md`, `angel-zero/PLAN.md` and `CODEBASE_MAP.md` first, then implement **all** of this in one pass.
> Line numbers were taken from the working tree at build **`s53a`**. Locate code by the quoted snippet; lines drift.

## 0. Preconditions (do these first)
1. **Pending changes.** The tree has **uncommitted** edits in `index.html`, `src/blastfx.js`, `src/nvg.js`, `src/vfx.js` and `src/world.js`. That is a previous performance pass at `s53a`.
   - If they are yours and verified, commit them first with their own message.
   - Otherwise stop and report.
   - Never fold them into this feature's commit.
2. **Build tag.** This feature ships as build **`s54a`**. Bump **every** `?v=s53a` in `index.html` to `?v=s54a`, and bump `difficulty.js?v=` inside `src/combat.js` too.
3. **Encoding.** Never rewrite files with PowerShell `Get-Content` / `Set-Content`; use the editor tools, or Python with `encoding='utf-8'`.

## 1. Objective & Design

Two guidance families, each with its own counter:

| | `'IR'` (heat seeker) | `'RADAR'` (radar guided) |
|---|---|---|
| Who fires it | Bandit shots at **≤ 2,500 m** (close dogfight), from `BANDIT_FULL` / `BANDIT_SOFT` | Bandit shots at **> 2,500 m** (BVR), **every** land SAM site and shipborne SAM (`SAM_Q`) |
| Defeated by | **Flares** (`X`): the existing decoy roll at `DIFF.flareDecoyP` | **Chaff** (`V`): new decoy roll at `DIFF.chaffDecoyP` |
| Also defeated by | Existing high-G / barrel-roll break inside 900 m, terrain masking, cloud | **Notch**: fly 75°–105° to the missile's velocity below 1,200 ft AGL for > 1.4 s. Also the existing break, terrain masking and cloud. |
| Ignores | Chaff | Flares |
| RWR glyph | `IR`, red (`WARN`) | `RDR`, amber (`AMBER`) |

**Chaff stock** is separate from flares and scales with difficulty: **ROOKIE 10 / NORMAL 8 / ACE 6**. It recharges +1 every 10 s, as flares do every 8 s, and refills on pit stop / reset.

**Pre-launch locks:**
- Flares now break only bandit seeker locks inside 2,500 m (IR trackers).
- Chaff breaks bandit locks beyond 2,500 m (radar trackers).
- ECM (`Z`) is unchanged and still breaks any lock.

**Key binding: chaff goes on `V`, not `Z`.** `Z` is already the ALQ-135 ECM jammer (`index.html` ~L1309: `if (k === 'z' && !e.repeat) combatSys.activateECM();`), and `V` is free. If the owner explicitly wants chaff on `Z`, apply the alternative in §3.10 instead. Do not silently remove ECM.

**Out of scope (do not change):**
- Missile kinematics: the 940 m/s cap, the 320 m/s² boost, the `turn` / `N` / `fov` guidance objects.
- Damage values, fuse ranges, `CombatDirector` maths, `DIFF.flareDecoyP` values.
- Cloud-loss behaviour: radar missiles keep losing lock in thick cloud exactly as today. A known simplification; leave it.
- ECM, enemy AI flight, scoring outside the new +250 / +300 events, and every visual-pass system (§4).

## 2. File & Function Map (complete)

| # | File | Anchor (s53a) | Change |
|---|---|---|---|
| A | `src/difficulty.js` | L8-45 `DIFFICULTY_PRESETS` | Add `chaffMax` and `chaffDecoyP` to all three presets (§3.1). |
| B | `src/combat.js` | L27 `const FLR_MAX = 4, FLR_RECHARGE = 8, FLR_PER_SALVO = 6, FLR_DECOY_RANGE = 1.2 * NM;` | Add IR / chaff / notch constants on the next line (§3.2). |
| C | `src/combat.js` | L41-46 `function applyDifficulty(id)` | Set `C.chaffMax` and clamp `C.chaff` (§3.2). |
| D | `src/combat.js` | L52 `Object.assign(C, { weapon: 'MSL', … flares: FLR_MAX, flareMax: FLR_MAX });` | Add `chaff`, `chaffMax`, `notchT`, `notching`, `notches`, `chaffBreaks` (§3.2). |
| E | `src/combat.js` | L294 missile pool `missiles.push({ mesh: g, … smokeAcc: 0 })` | Add `guidance: 'IR', notchT: 0, chaffSalvo: -1, notched: false` (§3.3). |
| F | `src/combat.js` | L325 `function launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual)` and L329-333 reset block | New 8th param `guidance`; set and reset the per-missile fields (§3.3). |
| G | `src/combat.js` | L1097-1108 bandit engage block (`BANDIT_FULL` / `BANDIT_SOFT` launches) | Pass `null, dist > IR_RANGE ? 'RADAR' : 'IR'` (§3.3). |
| H | `src/combat.js` | L1748-1775 `function updateRWR(playerActive)` | Every RWR entry gains `g: 'IR' \| 'RADAR'` (§3.7). |
| I | `src/combat.js` | L1805 `function updateMissiles(dt, playerActive)` | Reset `C.notching`; add the notch block after the cloud-loss block (L1831-1840); add a `tgt.isChaff` fuse branch beside `tgt.isFlare` (L1888) (§3.5, §3.6). |
| J | `src/combat.js` | L2181-2263 flares section: `dispenseFlares()`, `updateFlares(dt)` | Flares become IR-only. Remove the chaff bloom from flares; add the orange decoy burst; IR-only lock break; add `dispenseChaff()`, `updateChaff(dt)` (§3.4). |
| K | `src/combat.js` | L2666-2675 `function surfaceSAM(from, label)` | `launch(…, SAM_Q)` → `launch(…, SAM_Q, null, 'RADAR')` (§3.3). |
| L | `src/combat.js` | `update()` projectile tail: `updateBombs(dt); updateRings(dt); updateFlares(dt);` | Append `updateChaff(dt);` (§3.4). |
| M | `src/combat.js` | L3098-3106 `pitStop()`, L3107-3117 `resetPlayer()` | Refill chaff; clear live chaff and notch state (§3.8). |
| N | `src/combat.js` | returned API (L3296-3424): `banditShot(i, soft, aim)`, `stats()` | `banditShot` gains a `guidance` param; add `dispenseChaff`, `get chaffLive()`; `stats().ew` block (§3.9). |
| O | `src/audio.js` | after `function flare(intensity = 1)` (L354-~375); return object (the line starting `init, resume, suspend, update, explosion, …`) | New `chaff(intensity)` one-shot; export it (§3.11). |
| P | `src/hud.js` | L1056-1082 RWR block; L1094-1109 radar corner labels; L1153 stores `FLR` row; L1268-1287 `drawCenterBanners` | `IR` / `RDR` glyphs, lock-spike tags, `NOTCH xx%` meter, `CHF` row, NOTCHED banner (§3.12). |
| Q | `index.html` | keydown ~L1309-1310 (`z` ECM, `x` flares); keybind list L310 / L314 (briefing); `onSfx` ~L2001 (`type === 'flare'`); warp loop hooks ~L2438 / ~L2453 (`ecmat`, `flareat`) | `V` = chaff, binding text, `chaff` SFX, debug hooks `chaffat`, `irshot`, `radarshot`, `notchat` (§3.10, §3.13). |
| R | `angel-zero/PLAN.md` | after the latest entry; "Debug URL flags" | New `[x]` entry + new flags (§5.8). |

## 3. Exact Code

### 3.1 `src/difficulty.js`
Add two fields to each preset, after `missileIgniteP`:

```js
    missileIgniteP: 0.2,
    chaffMax: 10, chaffDecoyP: 0.9                    // chaff dispenser load / RADAR-missile decoy chance
```
```js
    missileIgniteP: 0.28,
    chaffMax: 8, chaffDecoyP: 0.82
```
```js
    missileIgniteP: 0.35,
    chaffMax: 6, chaffDecoyP: 0.72
```

Those three blocks are ROOKIE, NORMAL and ACE in that order. Keep the trailing-comma style valid.

### 3.2 `src/combat.js`: constants, difficulty hook, C state
After L27 (`const FLR_MAX = 4, …`), add:

```js
  // IR vs RADAR guidance (s54a): bandit shots at <= IR_RANGE are heat seekers, beyond are radar (BVR);
  // every SAM is radar. Chaff (V) decoys RADAR missiles; flares (X) only IR. Notch: hold 75-105 deg to a
  // RADAR missile's velocity below 1,200 ft AGL for > 1.4 s and its doppler gate loses you.
  const IR_RANGE = 2500;
  const CHAFF_RECHARGE = 10, CHAFF_CD = 0.5, CHAFF_DECOY_RANGE = 900, CHAFF_LIFE = 4.5;
  const NOTCH_MIN = 75 * D2R, NOTCH_ALT = 1200 * FT, NOTCH_T = 1.4;
```

`FT` and `D2R` already exist at module top (L12). `NOTCH_MIN` alone covers 75°–105°, because the angle test folds `|cos|` (see §3.5).

In `applyDifficulty(id)` (L41-46), after `director.max = …; director.stagger = …;`, add:

```js
    C.chaffMax = p.chaffMax;
    C.chaff = C.chaff === undefined ? p.chaffMax : Math.min(C.chaff, p.chaffMax);
```

Change L52 to:

```js
  Object.assign(C, { weapon: 'MSL', bombs: 0, bombMax: 0, bombReload: 0, ccip: null, ccipTof: 0, flares: FLR_MAX, flareMax: FLR_MAX,
    notchT: 0, notching: 0, notches: 0, chaffBreaks: 0 });
```

`chaff` / `chaffMax` are set by `applyDifficulty`. Do **not** overwrite them here; L52 runs before `applyDifficulty` (L321), so they stay as `applyDifficulty` sets them.

**Order check.** `applyDifficulty` is called at L321, after L52. `C.chaff` is therefore `undefined` on the first call and gets `p.chaffMax`. Good.

The briefing's difficulty selector calls `combatSys.setDifficulty(id)`, which calls `applyDifficulty` + `director.reset()`. Make it **refill** chaff to the new max. In the returned API, find `setDifficulty(id) { applyDifficulty(id); director.reset(); return C.difficulty; },` and change it to:

```js
    setDifficulty(id) { applyDifficulty(id); director.reset(); C.chaff = C.chaffMax; return C.difficulty; },
```

### 3.3 Guidance tag: pool, `launch()`, call sites
**Pool (L294).** Append to the pushed object literal:

```js
guidance: 'IR', notchT: 0, chaffSalvo: -1, notched: false
```

**`launch()` (L325).** Change the signature to:

```js
  function launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual, guidance) {
```

After the reset line `m.terrainLost = false; m.maskT = 0; m.sam = false; m.friendly = false;` (L333), add:

```js
    m.guidance = guidance || (quality === SAM_Q ? 'RADAR' : 'IR');      // player AIM-9s default 'IR' (cosmetic)
    m.notchT = 0; m.chaffSalvo = -1; m.notched = false;
```

`SAM_Q` is a `const` declared later (L2476) in the same function scope. `launch()` only ever runs after construction, so the reference is safe.

**Bandit shots (L1099 and L1105).** In the engage block, `dist` is the bandit-to-player distance, already in scope. Change the two calls to:

```js
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_FULL, null, dist > IR_RANGE ? 'RADAR' : 'IR')) {
```
```js
        if (launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, target, true, BANDIT_SOFT, null, dist > IR_RANGE ? 'RADAR' : 'IR')) {
```

Make the launch callouts tell the player what is coming. Replace the two `say(...)` strings:

```js
          say(e.ace ? `${e.label} — FOX ${dist > IR_RANGE ? 'THREE' : 'TWO'}! BREAK! BREAK!` : (dist > IR_RANGE ? 'RADAR MISSILE — CHAFF / NOTCH!' : 'IR MISSILE — FLARES! BREAK!'), 2.2, '#ff4d3d');
```
```js
          e.mslCD = 12 + rand() * 6; say(dist > IR_RANGE ? 'RADAR MISSILE — LOW-QUALITY TRACK' : 'IR MISSILE — LOW-QUALITY TRACK', 1.8, '#ffbf3f');
```

(FOX TWO = IR, FOX THREE = active radar.)

**`surfaceSAM` (L2670).** Change the call to:

```js
    const m = launch(_da.copy(from), _q, _db.copy(_dv).multiplyScalar(70), PLAYER_TGT, true, SAM_Q, null, 'RADAR');
```

and the callout (L2673) to:

```js
    say(`SAM LAUNCH — ${label}! RADAR — CHAFF / NOTCH!`, 2.0, '#ff4d3d');
```

**`banditShot` debug (L3320-3325).** Change it to:

```js
    banditShot(i, soft, aim, guidance) {
      const e = enemies[i]; if (!e || !e.alive) return null;
      if (aim) { e.fwd.copy(S.position).sub(e.pos).normalize(); e.vel.copy(e.fwd).multiplyScalar(e.speed); orient(e); }   // nose on the player first
      const g = guidance || (e.pos.distanceTo(S.position) > IR_RANGE ? 'RADAR' : 'IR');
      const m = launch(e.pos.clone().addScaledVector(e.fwd, 6), e.quat, e.vel, { pos: S.position, vel: S.velocity, alive: true, isPlayer: true }, true, soft ? BANDIT_SOFT : BANDIT_FULL, null, g);
      e.mslCD = 99;
      return m ? g : null;
    },
```

### 3.4 Flares become IR-only; new chaff system (`combat.js` L2181-2263)
Update the section header comment (L2182-2185) to:

```js
  // X: six magnesium flares from the tail dispensers. FLR 4 -> 0, +1 every 8 s. IR missiles
  // within 1.2 NM of a burning flare roll once per salvo (DIFF.flareDecoyP) to divert onto it.
  // RADAR missiles ignore flares. Dispensing breaks IR seeker locks (bandits <= IR_RANGE).
  // V: chaff -- one foil cloud per press (stock DIFF.chaffMax, +1 / 10 s). RADAR missiles within
  // 900 m roll once per cloud (DIFF.chaffDecoyP) to lock the cloud instead; breaks radar locks.
```

**In `dispenseFlares()`:**

(a) **Delete** the chaff bloom loop (L2203-2208), from `for (let i = 0; i < 70; i++) {                      // chaff bloom: glittering foil` through its closing `}`.

(b) Replace it with an orange decoy burst. It's additive, but keep each particle's `rgb * a ≤ 0.8`, so only overlapping cores can approach the 0.92 bloom threshold, which is already true of flares:

```js
    for (let i = 0; i < 28; i++) {                      // orange decoy burst off the dispensers
      const p = DISPENSERS[i % 2].clone().applyQuaternion(S.quaternion).add(S.position);
      const v = S.velocity.clone().multiplyScalar(0.9).add(new THREE.Vector3(rand() - 0.5, rand() - 0.3, rand() - 0.5).multiplyScalar(55));
      fire.spawn({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.35 + rand() * 0.45, s0: 2.6, s1: 0.8, r: 0.95, g: 0.5, b: 0.12, a: 0.8, drag: 2.2 });
    }
```

(c) Replace `for (const e of enemies) e.bLock = 0;               // seekers break lock` (L2209) with:

```js
    for (const e of enemies) if (e.alive && e.pos.distanceTo(S.position) <= IR_RANGE) e.bLock = 0;   // IR seekers break lock
```

**In `updateFlares(dt)`, decoy loop (L2251-2262).** Change the skip condition (L2252) to:

```js
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack || m.guidance !== 'IR') continue;
```

**New chaff code.** Insert after the closing `}` of `updateFlares` (L2263) and before `/* === surface targets */`:

```js
  const chaffs = [];
  let chaffCD = 0, chaffRecharge = 0, chaffSalvo = 0;
  function dispenseChaff() {
    if (!env.isReady() || C.dead || C.chaff <= 0 || chaffCD > 0) return false;
    C.chaff--; chaffCD = CHAFF_CD; chaffSalvo++;
    if (C.chaff < C.chaffMax && chaffRecharge <= 0) chaffRecharge = CHAFF_RECHARGE;
    const pos = DISPENSERS[chaffSalvo % 2].clone().applyQuaternion(S.quaternion).add(S.position);
    const vel = S.velocity.clone().multiplyScalar(0.35);                 // foil blooms and slows hard behind the jet
    chaffs.push({ pos, vel, age: 0, life: CHAFF_LIFE, alive: true, isChaff: true, salvo: chaffSalvo, emit: 0 });
    // Metallic foil sparkle: silver-white glints (additive, per-particle rgb * a <= 0.7) + a faint grey haze.
    for (let i = 0; i < 90; i++) {
      const w = 0.6 + rand() * 0.25;
      const v = S.velocity.clone().multiplyScalar(0.4).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(36));
      fire.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: v.x, vy: v.y, vz: v.z, life: 0.6 + rand() * 1.2, s0: 0.7, s1: 0.3, r: w, g: w, b: w * 1.06, a: 0.8, drag: 3.2 });
    }
    for (let i = 0; i < 10; i++) {
      smoke.spawn({ x: pos.x, y: pos.y, z: pos.z, vx: (rand() - 0.5) * 8, vy: (rand() - 0.5) * 4, vz: (rand() - 0.5) * 8,
        life: 3.2 + rand() * 1.2, s0: 5, s1: 22 + rand() * 8, r: 0.74, g: 0.76, b: 0.8, a: 0.3, drag: 1.4, rise: -0.3 });
    }
    for (const e of enemies) if (e.alive && e.pos.distanceTo(S.position) > IR_RANGE) e.bLock = 0;    // radar trackers break lock
    say('CHAFF — ' + C.chaff + ' LEFT', 1.0, '#cfe3ff');
    if (env.onSfx) env.onSfx('chaff', S.position, 1);
    return true;
  }
  function updateChaff(dt) {
    chaffCD = Math.max(0, chaffCD - dt);
    if (C.chaff < C.chaffMax) {
      chaffRecharge -= dt;
      if (chaffRecharge <= 0) { C.chaff++; chaffRecharge = C.chaff < C.chaffMax ? CHAFF_RECHARGE : 0; }
    }
    for (let i = chaffs.length - 1; i >= 0; i--) {
      const c = chaffs[i];
      c.age += dt;
      c.vel.multiplyScalar(Math.exp(-dt * 1.8)); c.vel.y -= 1.5 * dt;    // foil drifts down slowly
      c.pos.addScaledVector(c.vel, dt);
      if (c.age > c.life || c.pos.y < groundLevel(c.pos.x, c.pos.z)) { c.alive = false; chaffs.splice(i, 1); continue; }
      // Residual glitter for the first 1.5 s (a few glints per frame, same budget as flare sparks).
      if (c.age < 1.5) {
        c.emit += dt * 24;
        while (c.emit >= 1) {
          c.emit -= 1;
          const w = 0.55 + rand() * 0.2;
          fire.spawn({ x: c.pos.x + (rand() - 0.5) * 14, y: c.pos.y + (rand() - 0.5) * 10, z: c.pos.z + (rand() - 0.5) * 14, vx: c.vel.x, vy: c.vel.y - 2, vz: c.vel.z,
            life: 0.25 + rand() * 0.3, s0: 0.6, s1: 0.2, r: w, g: w, b: w * 1.06, a: 0.75, drag: 1 });
        }
      }
    }
    // Decoy roll for RADAR missiles near a fresh cloud (once per missile per chaff salvo).
    for (const m of missiles) {
      if (!m.active || !m.enemy || !m.target || !m.target.isPlayer || m.lostTrack || m.guidance !== 'RADAR') continue;
      let near = null;
      for (const c of chaffs) if (c.alive && c.salvo !== m.chaffSalvo && c.pos.distanceTo(m.mesh.position) < CHAFF_DECOY_RANGE) { near = c; break; }
      if (!near) continue;
      m.chaffSalvo = near.salvo;
      if (rand() < DIFF.chaffDecoyP) {
        m.target = near; m.losPrev.copy(near.pos).sub(m.mesh.position).normalize();
        C.chaffBreaks++; C.score += 250;
        pushEvent('EVADED', 'CHAFF // RADAR MISSILE DECOYED', 250, '#9fd4ff');
        say('RADAR MISSILE DECOYED', 1.8, '#9fd4ff');
      }
    }
  }
```

**Allocation note.** `dispenseChaff` allocates per **key press** (event), as `dispenseFlares` does today. `updateChaff` uses no `new THREE.*`. Its `fire.spawn({...})` object literals match the existing flare-spark pattern.

**Hook it into the frame.** In `update()`, change `updateBombs(dt); updateRings(dt); updateFlares(dt);` to:

```js
    updateBombs(dt); updateRings(dt); updateFlares(dt); updateChaff(dt);
```

### 3.5 Radar notching (`updateMissiles`)
At the very top of `function updateMissiles(dt, playerActive) {` (L1805), before `for (const m of missiles) {`, add:

```js
    C.notching = 0;                                                     // strongest notch progress this frame (HUD meter 0..1)
```

Insert this block **directly after** the cloud-loss block. That block ends with `if (env.onSfx) env.onSfx('lockdrop', null, 1);` and its closing `}` near L1840. Put the new block before `if (tgt && !m.enemy && !tgt.isPlayer && !tgt.isFlare && tgt.alive) {`:

```js
        // Radar notch: beam a RADAR missile (75-105 deg between our velocity and its velocity) below
        // 1,200 ft AGL for > 1.4 s -- its doppler gate loses us in the ground / sea clutter.
        if (tgt && m.enemy && tgt.isPlayer && !m.lostTrack && playerActive && m.guidance === 'RADAR') {
          const ps = S.velocity.length(), ms = m.vel.length();
          let inNotch = false;
          if (ps > 40 && ms > 40) {
            // |cos| folds 75-105 deg onto 75-90 deg, so one lower bound covers the whole beam band.
            const ang = Math.acos(clamp(Math.abs(S.velocity.dot(m.vel)) / (ps * ms), 0, 1));
            inNotch = ang >= NOTCH_MIN && S.radalt < NOTCH_ALT;
          }
          m.notchT = inNotch ? m.notchT + dt : 0;
          if (inNotch) C.notching = Math.max(C.notching, Math.min(1, m.notchT / NOTCH_T));
          if (m.notchT > NOTCH_T) {
            m.lostTrack = true; m.notched = true; m.life = Math.min(m.life, m.age + 2.0);
            C.notches++; C.notchT = performance.now(); C.missileWarning = 0; C.score += 300;
            pushEvent('NOTCHED', '[ NOTCHED // RADAR LOCK BROKEN ]', 300, '#00ff66');
            say('NOTCHED — RADAR LOCK BROKEN', 1.8, '#4dff91');
            if (env.onSfx) env.onSfx('lockdrop', null, 1);
          }
        }
```

`S.radalt` (height above ground / sea) is set every physics step in `index.html` (`state.radalt = state.position.y - ground;`, ~L1564). Use it as is.

### 3.6 Chaff as a missile target (fuse)
In the fuse branch (L1882-1892), the existing line is:

```js
              else if (tgt.isFlare) { explosion(pos, 0.6); tgt.alive = false; }
```

Add **right after** it:

```js
              else if (tgt.isChaff) { explosion(pos, 0.5); }                     // proximity-fused into the foil cloud
```

and change the `logShot` result on the next lines from `tgt.isFlare ? 'FLARE' : 'HIT'` to:

```js
              logShot(m, tgt.isFlare ? 'FLARE' : tgt.isChaff ? 'CHAFF' : 'HIT');
```

Also in the end-of-life `logShot` (~L1914), change `m.cloudLost ? 'CLOUD' : m.terrainLost ? 'TERRAIN' : …` to start with `m.notched ? 'NOTCH' : m.cloudLost ? 'CLOUD' : …`.

`tAlive` for a chaff target is `tgt.alive` (not `isPlayer`), so once the cloud expires the missile goes ballistic. The seeker-FOV and PN code work unchanged against `{ pos, vel }`.

### 3.7 RWR entries carry guidance (`updateRWR`, L1748-1775)
- **Bandit spikes:** change `list.push({ b: relBearing(e.pos), kind, d, id: e.id });` to:

  ```js
        list.push({ b: relBearing(e.pos), kind, d, id: e.id, g: d > IR_RANGE ? 'RADAR' : 'IR' });
  ```

- **Missiles:** change `list.push({ b: relBearing(m.mesh.position), kind: 'msl', d: m.mesh.position.distanceTo(S.position) });` to:

  ```js
        list.push({ b: relBearing(m.mesh.position), kind: 'msl', d: m.mesh.position.distanceTo(S.position), g: m.guidance });
  ```

- **Task-force paints:** change `list.push({ b: relBearing(t.pos), kind: 'paint', d, id: t.id });` to:

  ```js
        list.push({ b: relBearing(t.pos), kind: 'paint', d, id: t.id, g: 'RADAR' });
  ```

### 3.8 Resets (`pitStop`, `resetPlayer`)
In `pitStop()` (L3098-3106), after `resetEngines();`, add:

```js
    C.chaff = C.chaffMax; chaffRecharge = 0;
```

In `resetPlayer()` (L3107-3117), after `flareRecharge = 0;`, add:

```js
    C.chaff = C.chaffMax; chaffRecharge = 0; chaffCD = 0;
    for (const c of chaffs) c.alive = false; chaffs.length = 0;
    Object.assign(C, { notchT: 0, notching: 0 });
```

### 3.9 API + stats (`combat.js` return object)
- Next to the existing `dispenseFlares` export in the returned object, add `dispenseChaff,`.
- Next to `get flaresLive() { return flares; },` add `get chaffLive() { return chaffs; },`.
- In `stats()` (L3378), add a new top-level field `ew` right after `ecm: {…},`:

```js
        ew: { chaff: C.chaff, chaffMax: C.chaffMax, chaffLive: chaffs.length, chaffBreaks: C.chaffBreaks, decoyed: C.decoyed || 0,
          notches: C.notches, notching: +C.notching.toFixed(2),
          msl: missiles.filter(m => m.active && m.enemy).map(m => (m.guidance === 'RADAR' ? 'R' : 'I') + (m.sam ? 's' : '')
            + (m.notchT > 0 ? '/n' + m.notchT.toFixed(1) : '') + (m.target && m.target.isChaff ? '/chaff' : m.target && m.target.isFlare ? '/flare' : '')
            + (m.notched ? '/notched' : m.lostTrack ? '/lost' : '')).join(' ') },
```

Also change the `rwr` stat line to include the guidance letter:

```js
        rwr: { level: C.rwrLevel, list: C.rwr.map(r => r.kind + (r.g ? (r.g === 'RADAR' ? 'R' : 'I') : '') + '@' + Math.round(r.b / D2R)).join(' ') },
```

### 3.10 Keys + briefing binds (`index.html`)
Keydown (~L1309-1310) currently has:

```js
  if (k === 'z' && !e.repeat) combatSys.activateECM();
  if (k === 'x' && !e.repeat) combatSys.dispenseFlares();
```

Add directly below them:

```js
  if (k === 'v' && !e.repeat) combatSys.dispenseChaff();                 // V: chaff (defeats RADAR missiles)
```

Briefing keybind list (L310 and L314):

```html
            <div class="bind"><span class="k"><kbd>X</kbd></span><span class="a">Deploy flares (defeats IR missiles)</span></div>
            <div class="bind"><span class="k"><kbd>V</kbd></span><span class="a">Deploy chaff (defeats RADAR missiles) · notch: beam it low</span></div>
```

The first line replaces L314. The second is new; insert it right after. Keep L310 (`Z` ECM) as is.

**Alternative only if the owner insists on `Z` = chaff:**
- Change `if (k === 'z' …)` to `combatSys.dispenseChaff()`.
- Add `if (k === 'j' && !e.repeat) combatSys.activateECM();`.
- Change the L310 bind to `<kbd>J</kbd> ALQ-135 ECM Jammer` and the chaff bind to `<kbd>Z</kbd>`.
- Update the `// Z: ALQ-135 …` comment in `combat.js` (~L1776) to `J:`.

### 3.11 `src/audio.js`: chaff one-shot
Add after `function flare(intensity = 1) { … }` (ends ~L375):

```js
  // Chaff: two dull pneumatic cartridge pops + a dry metallic foil rustle (band-passed noise,
  // amplitude-chopped like scattering strips) fading over ~1.4 s.
  function chaff(intensity = 1) {
    if (!ready) return;
    const t = ctx.currentTime, k = Math.min(1, Math.max(0.1, intensity));
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.06;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(190, at); o.frequency.exponentialRampToValueAtTime(58, at + 0.08);
      const g = gain(0); g.gain.setValueAtTime(0.5 * k, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.09);
      o.connect(g).connect(cockpitLP); o.start(at); o.stop(at + 0.1);
    }
    const s = ctx.createBufferSource(); s.buffer = N.white;
    const bp = filt('bandpass', 6500, 0.7);
    const sg = gain(0); sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.14 * k, t + 0.05); sg.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(31, t); lfo.frequency.linearRampToValueAtTime(17, t + 1.4);
    const depth = gain(0.07 * k); lfo.connect(depth).connect(sg.gain);
    s.connect(bp).connect(sg).connect(cockpitLP); s.start(t, Math.random()); s.stop(t + 1.5); lfo.start(t); lfo.stop(t + 1.5);
    N.chaffCount = (N.chaffCount || 0) + 1;
  }
```

Add `chaff` to the returned object, on the same line as `flare`. In `index.html` `onSfx` (~L2001), next to `else if (type === 'flare') audio.flare(firstPerson ? 0.8 : 1);`, add:

```js
  else if (type === 'chaff') audio.chaff(firstPerson ? 0.8 : 1);
```

### 3.12 `src/hud.js`: RWR glyphs, notch meter, CHF row, NOTCHED banner
**(a) RWR missile glyph (L1063-1069).** Replace the `'M'` drawing with a guidance tag:

```js
        if (r.kind === 'msl') {
          const on = mslFlash(), radar = r.g === 'RADAR', col = radar ? AMBER : WARN;
          glow(ctx, col, on ? 8 : 2); ctx.globalAlpha = on ? 1 : 0.5; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx + sx * 9, cy + sy * 9); ctx.lineTo(px + sx * 6, py + sy * 6); ctx.stroke();
          ctx.font = f(radar ? 12 : 13, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(radar ? 'RDR' : 'IR', px + sx * 16, py + sy * 16);
          ctx.globalAlpha = 1;
        } else {
```

`glow(ctx, col, …)` must set `fillStyle` / `strokeStyle` the way it does for `WARN` today. If `glow` only sets shadow, also set `ctx.fillStyle = ctx.strokeStyle = col;`.

**(b) Lock / acquire spike tag.** Inside the `else` branch (fighter spikes, L1070-1079), after `ctx.stroke(); ctx.restore();` and before `ctx.globalAlpha = 1;`, add:

```js
          if (r.kind !== 'paint' && r.g) {                                   // what the next shot will be
            ctx.font = f(9, true); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(r.g === 'RADAR' ? 'R' : 'I', px + sx * 13, py + sy * 13);
          }
```

**(c) Notch meter.** In the radar-corner labels, after the `if (C.rwrTrack || C.banditLock >= 1) { … }` block (L1105-1109), add:

```js
    if (C.notching > 0.02) {                                               // radar notch building (0..1.4 s)
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.font = f(11, true);
      labelText(ctx, `NOTCH ${Math.round(C.notching * 100)}%`, x0 + 6, y0 + s - 6, CYAN, 4);
      glow(ctx, CYAN, 3); ctx.fillRect(x0 + 6, y0 + s - 4, (s - 12) * C.notching, 2);
    }
```

`x0`, `y0` and `s` are the radar frame variables already used at L1095-1102; `CYAN` is the existing ECM colour.

**(d) Stores row (L1153).** After the `FLR` row, add:

```js
    if (C.chaff !== undefined) rows.push(['  CHF', String(C.chaff), C.chaff > 0 ? G : AMBER]);
```

**(e) NOTCHED banner (`drawCenterBanners`, L1268-1287).** After the existing Mach-1 banner block (`if (C.mach1T && now - C.mach1T < 1400) { … }`), add:

```js
    if (C.notchT && now - C.notchT < 1600) {
      const age = now - C.notchT, mach = C.mach1T && now - C.mach1T < 1400;
      drawBanner(ctx, cx, upperY + (alertOn() || mach ? 36 : 0), '[ NOTCHED // RADAR LOCK BROKEN ]', '#00ff66', 360, 1 - age / 1600);
    }
```

Then stop the generic event banner from duplicating it. Change:

```js
      const latest = (C.events || []).slice().reverse().find(ev => now - ev.born < 1500);
```

to:

```js
      const latest = (C.events || []).slice().reverse().find(ev => now - ev.born < 1500 && ev.kind !== 'NOTCHED');
```

The NOTCHED event still appears in the small floating event list beside the radar, which is intended.

### 3.13 Debug hooks (`index.html` warp loop, next to `ecmat` / `flareat` ~L2438-2453)
```js
      // EW tests: ?chaffat=s  ?irshot=s[,dist]  ?radarshot=s[,dist]  ?notchat=s (hold a beam on the first RADAR missile)
      if (Q.has('chaffat') && Number(Q.get('chaffat')) >= t0 && Number(Q.get('chaffat')) < t1) console.log('[ANGELS_ZERO] chaff @', t1.toFixed(2), combatSys.dispenseChaff());
      for (const [key, g, defD] of [['irshot', 'IR', 1500], ['radarshot', 'RADAR', 3200]]) {
        if (!Q.has(key)) continue;
        const [ts, dd] = Q.get(key).split(',').map(Number);
        if (ts >= t0 && ts < t1) { combatSys.placeBehind(0, dd || defD); console.log('[ANGELS_ZERO]', key, '@', t1.toFixed(2), combatSys.banditShot(0, false, true, g)); }
      }
      if (Q.has('notchat') && t1 >= Number(Q.get('notchat'))) {
        const m = combatSys.missiles.find(x => x.active && x.enemy && x.guidance === 'RADAR' && x.target && x.target.isPlayer && !x.lostTrack);
        if (m) {                                                            // fly level, perpendicular to the missile's horizontal velocity
          const mv = m.vel.clone().setY(0);
          if (mv.lengthSq() > 1) {
            const dir = new THREE.Vector3(-mv.z, 0, mv.x).normalize();
            if (dir.dot(state.velocity) < 0) dir.negate();
            state.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().negate(), new THREE.Vector3(0, 1, 0)));
            state.velocity.copy(dir).multiplyScalar(state.velocity.length());
            state.pitchRate = state.rollRate = state.yawRate = 0;
          }
        }
      }
```

The `new THREE.*` calls in `notchat` are **debug-only, inside the headless warp loop**, never in the shipped frame loop. They're allowed there, the same way `wingtrack` does it.

**Orientation sign.** Confirm `lookAt(origin, -dir, up)` makes the nose point along `dir`. The jet's nose is −Z, so a `Matrix4.lookAt` aiming **at** `-dir` from the origin yields a quaternion whose −Z faces `dir`. If the logged velocity and heading disagree, use `lookAt(new THREE.Vector3(), dir, up)` instead; `wingtrack` (~L2400) uses `lookAt(state.position, aim, up)`. Verify by checking the `ew.msl` entry gains `/n` within a few frames.

## 4. Strict Do-Not-Touch Guardrails
1. **Pass 1 bloom.** Leave `src/nvg.js` alone: `EffectComposer` / `RenderPass` / `UnrealBloomPass` (threshold **0.92**, strength 0.48, radius 0.32) / `OutputPass`, and whatever resolution and MSAA the committed perf pass set. No new post passes. New additive particles keep `rgb * a ≤ 0.8` each.
2. **Pass 2.** Leave the wingtip / LEX vapor ribbons and the wind-rush audio bus alone.
3. **Pass 3.** Leave `DAYLIGHT // CLOUD SEA`, the cloud-sea banks, `deckMat` and the volumetric deck alone. Don't change cloud-loss rules for missiles.
4. **Pass 4.** Leave the patchwork farmland shader, the forest `InstancedMesh` and `heightAt` alone.
5. **Pass 5.** Leave `src/blastfx.js`, `blastShake` and `audio.explosion` alone. `explosion(pos, s)` calls are reused as is.
6. **Mach cone / sonic boom** (commit `a57c92c`): untouched.
7. **CombatDirector and difficulty.** Leave `director` maths, `hostileTracking()`, `maxEnemyMissiles`, `launchStagger` and all existing preset values alone. Only **add** `chaffMax` / `chaffDecoyP`.
   - Decoyed or notched missiles free director slots automatically. Both change `target` or set `lostTrack`, and that is intended.
8. **Cockpit and canopy.** Leave the `CanvasTexture` gauge throttling (`src/cockpit3d.js`), the canopy glass and the startup `renderer.compile` / `compileAsync` / `gpuWarm` alone. **No new materials or shaders**: the program count must stay identical to the pre-change count.
9. **Flight physics.** Leave the 6-DOF model alone. The notch reads `S.velocity` / `S.radalt` only.
10. **Missile flight.** Leave missile kinematics, guidance objects, fuse ranges, damage and the high-G break odds alone.
11. **Size and assets.** Add no binary assets; stay under **25 MB**. Don't touch `assets/angels_zero_jet.glb` or `prototype_flight_index.html`.
12. **Allocation.** No new `new THREE.*` allocations per frame in shipped code paths. Per key-press allocations in `dispenseChaff` are allowed. Debug-only warp hooks are exempt.

## 5. OpenCode Verification Checklist

Serve from the repo root (port 8090, no browser):

```powershell
python server.py --no-browser
```

Headless runner (fresh profile per run):

```powershell
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --user-data-dir=$env:TEMP\az_ew_$(Get-Random) --window-size=1280,720 --enable-logging=stderr --log-level=0 --virtual-time-budget=40000 --screenshot=out.png "<URL>" 2> out.log
```

Keep only `CONSOLE` lines whose `source:` starts with `http://127.0.0.1`. Every `logat=` line prints `combatSys.stats()`, which includes `ew` and `rwr`.

### 5.1 Static
- [ ] `git diff --stat` touches only:
  - `src/difficulty.js`, `src/combat.js`, `src/audio.js`, `src/hud.js`
  - `index.html`, `PLAN.md`
  - `TASK_SPEC.md` (optional)
- [ ] `git grep -c "?v=s53a" angel-zero/index.html` → `0`.
- [ ] `git grep -n "chaff bloom" angel-zero/src/combat.js` → no matches (removed from flares).
- [ ] `git grep -n "guidance" angel-zero/src/combat.js` shows: pool, `launch`, bandit ×2, `surfaceSAM`, `banditShot`, flare skip, chaff loop, notch block, RWR, stats.

### 5.2 IR missile is beaten by flares, not by chaff
- [ ] Flares beat it:
  ```
  ?nointro&debug&at=-2000,900,3000,0&spd=220&irshot=1.0,1500&flareat=1.6&warp=6&logat=1.2,2.0,4.0
  ```
  - The `irshot` log returns `"IR"`.
  - `ew.msl` at 1.2 shows `I`; by 2.0 or 4.0 it shows `I/flare`, or the missile is gone with `shots` ending in `:FLARE`.
  - `ew.decoyed >= 1`.
  - Repeat 5 times. At least 4 of 5 should decoy on NORMAL (p = 0.9).
- [ ] Chaff does nothing to it:
  ```
  ?nointro&debug&at=-2000,900,3000,0&spd=220&irshot=1.0,1500&chaffat=1.6&warp=6&logat=1.2,2.0,4.0
  ```
  - `ew.msl` **never** shows `/chaff`; `ew.chaffBreaks` = 0; `ew.chaff` = 7 (8 − 1).

### 5.3 RADAR missile is beaten by chaff, not by flares
- [ ] Flares do nothing to it:
  ```
  ?nointro&debug&at=-2000,900,3000,0&spd=220&radarshot=1.0,3200&flareat=2.0&warp=7&logat=1.5,3.0,5.0
  ```
  - The `radarshot` log returns `"RADAR"`.
  - `ew.msl` shows `R` and never `/flare`; `ew.decoyed` stays 0.
- [ ] Chaff beats it:
  ```
  ?nointro&debug&at=-2000,900,3000,0&spd=220&radarshot=1.0,3200&chaffat=3.2&warp=7&logat=1.5,3.6,6.0
  ```
  - `ew.msl` shows `R/chaff`, or the missile ends with `shots` result `CHAFF`.
  - `ew.chaffBreaks >= 1`.
  - Repeat 5 times. At least 3 of 5 should decoy on NORMAL (p = 0.82). Missiles that run out of range before the roll are excluded.
  - Tune `chaffat` so the cloud is within 900 m of the missile: log the missile distance at 1.5 s and adjust.
- [ ] SAM tagging: `?nointro&debug&phase=2&at=fleet&warp=40&logat=10,20,30,40`. Every `ew.msl` entry from the fleet is `Rs` (radar + sam).

### 5.4 Radar notch
- [ ] Positive case, low over the sea:
  ```
  ?nointro&debug&at=-2000,250,3000,0&spd=220&radarshot=1.0,3200&notchat=1.3&warp=6&logat=1.4,2.0,2.6,3.2,4.5
  ```
  - `ew.msl` shows `R/n0.x` climbing.
  - Once it passes 1.4 s, `ew.notches = 1` and the entry shows `/notched`.
  - The console has the say line; `shots` ends in `:NOTCH` when the missile expires.
- [ ] Negative, too high: the same URL with `at=-2000,900,3000,0` (2,950 ft AGL). `ew.notches = 0`, and no `/n`.
- [ ] Negative, IR missile: `irshot=1.0,1500&notchat=1.3` at 250 m. No `/n`, because the notch is RADAR only.
- [ ] Banner screenshot: `…radarshot=1.0,3200&notchat=1.3&warp=3.0&freeze` with the warp ending about 0.3 s after the notch fires. Adjust `warp` from the `t` log. The screenshot shows `[ NOTCHED // RADAR LOCK BROKEN ]` in emerald, plus the `NOTCH` meter when it's captured mid-build.

### 5.5 Stock by difficulty + key + resets
- [ ] `?nointro&debug&difficulty=ROOKIE&warp=1&logat=0.5` → `ew.chaff = 10`, `chaffMax = 10`. NORMAL → 8. ACE → 6.
- [ ] Recharge: `chaffat=0.5` then `logat=0.6,11.0`. Chaff is 7, then back to 8 by 10.6 s.
- [ ] Pane / devtools at `?nointro&debug`:
  - `dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }))`, then keyup → `__az.combatSys.stats().ew.chaff` decrements by 1.
  - `key: 'z'` still starts ECM: `stats().ecm.st === 'ACTIVE'`.
  - `key: 'x'` still fires flares.
- [ ] Reset (`Backspace`) and pit stop restore chaff to max; `chaffLive.length === 0` after the reset.
- [ ] Briefing screenshot (`?debug`, no `nointro`): the keybind list shows `X` flares (IR) and `V` chaff (RADAR); `Z` ECM is unchanged.

### 5.6 RWR + HUD
- [ ] Pane: fire one of each with `__az.combatSys.placeBehind(0, 3200); __az.combatSys.banditShot(0, false, true, 'RADAR'); __az.combatSys.placeBehind(1, 1500); __az.combatSys.banditShot(1, false, true, 'IR')`. If the director cap blocks the second shot, wait `stagger` seconds or use `?difficulty=ACE`.
  - `__az.combat.rwr` has two `msl` entries with `g: 'RADAR'` and `g: 'IR'`.
  - The screenshot shows an amber `RDR` and a red `IR` glyph on the radar's inner ring.
  - The stores list shows `CHF 8` under `FLR`.
- [ ] Fighter lock spikes show a small `R` (beyond 2.5 km) or `I` (inside 2.5 km).

### 5.7 Regression, performance, errors
- [ ] `?nointro&debug&warp=3` → `[ANGELS_ZERO] warp` line present.
- [ ] Director: `?nointro&debug&phase=2&at=fleet&difficulty=ROOKIE&warp=40&logat=10,20,30,40` → `director.peak <= director.max` in every line.
- [ ] `?nointro&debug&blastat=1.0,air,380&warp=1.08&freeze&fxhold` → flash and ring render (Pass 5 untouched).
- [ ] Mach-1 still works (the commit `a57c92c` hooks): `?nointro&debug&spd=330&ab&warp=4` → `[ MACH 1.0 // SUPERSONIC ]` path unaffected, no errors.
- [ ] Pane: `__az.renderer.info.programs.length` is identical before and after the change.
  - 8 chaff presses in 4 s: average `__frame()` stays within +0.5 ms of baseline.
  - `stats().stores.fireOn` stays under the `fire` pool size (900).
- [ ] **Zero** `127.0.0.1` console lines containing `error`, `Uncaught`, `WebGL:` or `GL_INVALID` across every run above.

### 5.8 Ship
- [ ] Add a `PLAN.md` entry for build **`s54a`** covering:
  - the guidance table;
  - `IR_RANGE`, the chaff numbers (stock 10 / 8 / 6, decoy p 0.9 / 0.82 / 0.72, 900 m, 4.5 s, +1 / 10 s);
  - the notch rule (75–105°, < 1,200 ft AGL, > 1.4 s, +300);
  - the RWR glyphs and the key `V`;
  - the measured decoy / notch results from §5.2-5.4;
  - new debug flags `chaffat`, `irshot`, `radarshot`, `notchat`.
- [ ] Commit and deploy:
  ```powershell
  git add -A
  git commit -m "feat(combat): IR vs RADAR missile guidance, chaff dispenser (V), radar notching, RWR IR/RDR tags"
  git push origin main
  ```
- [ ] `gh run watch` → `deploy` succeeds. Live check `https://angels-zero.pages.dev/index.html?nointro&debug&radarshot=1.0,3200&chaffat=3.2&warp=7&logat=6&cb=s54a`: `ew.chaffBreaks` ≥ 0, the page source has `?v=s54a`, zero console errors.
