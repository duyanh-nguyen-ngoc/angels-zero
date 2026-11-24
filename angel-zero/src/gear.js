// ANGELS ZERO — procedural F-15C tricycle landing gear (the Sketchfab asset's
// struts were stripped in prep_f15.py). Three units hang from hinge points
// under the fuselage / intakes (model space: nose -Z, up +Y, right +X, metres):
//   nose  hinge (0, -1.50, -4.95): strut swings FORWARD into the nose bay
//   mains hinge (+/-1.30, -1.24, 0.70): struts swing FORWARD-INBOARD under the intakes
// Each unit = hinge group -> oleo strut + torque link + axle + tyre/hub, plus a
// bay door that opens first and closes last. Fully extended, every tyre's
// contact patch sits at y = -2.90 (GEAR_H), so the jet rests level on the runway.
// progress 0 = up and locked (units hidden), 1 = down and locked.
export const GEAR_H = 2.9;                                   // CG height above the runway on the wheels
export const GEAR_PTS = { nose: [0, -GEAR_H, -4.95], mainL: [-1.3, -GEAR_H, 0.7], mainR: [1.3, -GEAR_H, 0.7] };

// Per-aircraft unit tables (model space). Every tyre bottom lands on -GEAR_H:
// hinge y - L - r = -2.90. F-22A positions come from assets/f22_prep_report.json
// (wheel centres of the source model's own gear, belly at y -1.92).
export const GEAR_UNITS = {
  F15C: {
    nose: { x: 0, y: -1.5, z: -4.95, L: 1.12, r: 0.28, w: 0.2, twin: false, axis: 'x', angle: 1.62, doorSide: 1 },
    mainL: { x: -1.3, y: -1.24, z: 0.7, L: 1.24, r: 0.42, w: 0.3, twin: false, axis: 'xz', angle: 1.55, doorSide: -1 },
    mainR: { x: 1.3, y: -1.24, z: 0.7, L: 1.24, r: 0.42, w: 0.3, twin: false, axis: 'xz', angle: 1.55, doorSide: 1 }
  },
  F22A: {
    nose: { x: 0, y: -1.75, z: -5.54, L: 0.89, r: 0.26, w: 0.2, twin: false, axis: 'x', angle: 1.62, doorSide: 1 },
    mainL: { x: -1.52, y: -1.75, z: 0.7, L: 0.83, r: 0.32, w: 0.28, twin: false, axis: 'xz', angle: 1.55, doorSide: -1 },
    mainR: { x: 1.52, y: -1.75, z: 0.7, L: 0.83, r: 0.32, w: 0.28, twin: false, axis: 'xz', angle: 1.55, doorSide: 1 }
  }
};
// Point the shared ground-contact table (read by the flight / ground physics) at
// an aircraft's units. Arrays are mutated in place so every importer sees it.
export function setGearPoints(units) {
  for (const k of ['nose', 'mainL', 'mainR']) { const u = units[k], p = GEAR_PTS[k]; p[0] = u.x; p[1] = -GEAR_H; p[2] = u.z; }
}

export function createGear(THREE, model, spec = GEAR_UNITS.F15C) {
  const strutMat = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.55, roughness: 0.35 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeef2f5, metalness: 0.95, roughness: 0.12 });
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.0, roughness: 0.92 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xbfc4c8, metalness: 0.7, roughness: 0.3 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x8a939c, metalness: 0.2, roughness: 0.6 });
  const bayMat = new THREE.MeshStandardMaterial({ color: 0xc9cdd1, metalness: 0.1, roughness: 0.75, side: THREE.DoubleSide });
  const root = new THREE.Group(); root.name = 'LandingGear';
  model.add(root);

  // One unit: hinge at (x, y, z); strut of length L straight down when extended,
  // tyre radius r / width w; retract = rotation about the unit's swing axis.
  function unit({ x, y, z, L, r, w, twin, axis, angle, doorSide }) {
    const hinge = new THREE.Group(); hinge.position.set(x, y, z); root.add(hinge);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, L * 0.6, 14), strutMat);
    upper.position.y = -L * 0.3; hinge.add(upper);
    const oleo = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, L * 0.45, 14), chromeMat);
    oleo.position.y = -L * 0.72; hinge.add(oleo);
    // Torque link (scissor) on the front of the oleo.
    for (const s of [-1, 1]) {
      const link = new THREE.Mesh(new THREE.BoxGeometry(0.03, L * 0.24, 0.05), strutMat);
      link.position.set(0, -L * 0.62 + s * L * 0.1, -0.09); link.rotation.x = s * 0.45; hinge.add(link);
    }
    // Drag brace back to the bay.
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L * 0.75, 10), strutMat);
    brace.position.set(0, -L * 0.33, 0.28); brace.rotation.x = -0.62; hinge.add(brace);
    const axle = new THREE.Group(); axle.position.y = -L; hinge.add(axle);
    const tyreG = new THREE.CylinderGeometry(r, r, w, 28).rotateZ(Math.PI / 2);
    const hubG = new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.06, 20).rotateZ(Math.PI / 2);
    const offs = twin ? [-w * 0.62, w * 0.62] : [0];
    for (const ox of offs) {
      const t = new THREE.Mesh(tyreG, tyreMat); t.position.x = ox; axle.add(t);
      const h = new THREE.Mesh(hubG, hubMat); h.position.x = ox; axle.add(h);
    }
    // Bay door: hinged on its outboard edge, opens downward.
    const door = new THREE.Group(); door.position.set(x + doorSide * 0.22, y + 0.04, z + (axis === 'x' ? -0.1 : 0.15)); root.add(door);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, L * 0.9), doorMat);
    panel.position.x = -doorSide * 0.21; door.add(panel);
    // Bay well (only visible while the door is open).
    const well = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, L * 0.92), bayMat);
    well.position.set(x, y + 0.13, z + (axis === 'x' ? -L * 0.45 : -L * 0.38)); root.add(well);
    return { hinge, door, well, axis, angle, doorSide, wheel: axle, wheelY: -L, r };
  }
  // Tyre bottoms at -GEAR_H: hingeY - L - r = -2.90.
  // +rotation about X swings the downward strut toward -Z (forward).
  const units = { nose: unit(spec.nose), mainL: unit(spec.mainL), mainR: unit(spec.mainR) };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let progress = 0, spin = 0, compression = 0;
  // Touchdown oleo travel: lift the wheels into their struts (0..0.35 m).
  // Collision / GEAR_H are untouched, so the jet still rests level on its wheels.
  function compress(amount) { compression = Math.max(0, Math.min(0.35, amount || 0)); }
  // Pose for a progress value: doors 0-0.3 open (and close again at the top),
  // struts swing 0.18-0.95, wheels spin with ground speed.
  function pose(p, groundSpeed = 0, dt = 0) {
    progress = p;
    const strut = sm(0.18, 0.95, p);                          // 0 stowed .. 1 down
    const doorOpen = p < 0.02 ? 0 : p > 0.98 ? 0.35 : sm(0.0, 0.3, p);   // stays cracked open when down (F-15 main doors close, nose door stays)
    spin += groundSpeed * dt;
    for (const [k, u] of Object.entries(units)) {
      const a = (1 - strut) * u.angle;                        // swing forward (and inboard for the mains)
      if (u.axis === 'x') u.hinge.rotation.set(a, 0, 0);
      else u.hinge.rotation.set(a, 0, -Math.sign(u.doorSide) * (1 - strut) * 0.32);
      u.door.rotation.z = u.doorSide * doorOpen * 1.45;
      const vis = p > 0.015;
      u.hinge.visible = vis; u.door.visible = vis; u.well.visible = p > 0.015 && doorOpen > 0.05;
      u.wheel.rotation.x = -spin / u.r;                       // rolling without slipping on this unit's tyre
      u.wheel.position.y = u.wheelY + compression * (k === 'nose' ? 0.5 : 1);
    }
  }
  pose(progress);
  return { root, pose, compress, get progress() { return progress; }, get compression() { return compression; }, units };
}
