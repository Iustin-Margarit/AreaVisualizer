import * as THREE from 'three';
import { kindColor } from '../palette.js';

// Low-poly models built from primitives at real-world size: each one stands on y = 0, centered
// on x/z, and fits its reference's w (x) × h (y) × d (z). Fronts face +x like the 2D silhouettes;
// people face +z, toward the default camera.

// Colours for parts that aren't the kind's main colour.
const C = {
  skin: '#e2b48c', hair: '#3b2a20', pants: '#34495e', shoe: '#262a30', eye: '#1b1d22',
  dogDark: '#5c3d22',
  glass: '#2c3a4b', tire: '#23262b', headlight: '#fff2c4', taillight: '#c0392b', trim: '#2b2f36',
  busRoof: '#d6d9de',
  trunk: '#7a5232', leafLight: '#4caf5c', leafDark: '#357f42',
  wall: '#efe6d8', door: '#6b4226', window: '#9cc3e0', chimney: '#8c4a3a',
  facade: '#c5ccd6', facadeGlass: '#4d5d75', facadeSill: '#e3e7ec', rooftop: '#9aa3b1',
  fuselage: '#eef1f5', engine: '#7f8898', fin: '#5b6b84',
  screen: '#1f2937', woodDark: '#6e4a2b',
  seats: '#6b7686', canopy: '#e3e7ec', pitch: '#3f9b4f', pitchLine: '#f4f6f8',
  ironLight: '#a88a66',
  goldLight: '#e2c35a',
  deck: '#f4f6f8', funnel: '#c0392b',
  spireCore: '#c7d3df', spireTop: '#dbe4ec',
  concrete: '#9aa0a6',
  snow: '#f4f7fa', foothills: '#5f8a4f',
  moon: '#a9a9a3',
};

// What glows at night (emissive colours; nothing glows by day).
const GLOW = {
  window: '#ffc66b', headlight: '#fff1c2', taillight: '#ff4436', cabin: '#b98d48',
  tower: '#c48a3c', pitch: '#2f7d3c', bridge: '#7a2a1c', moon: '#3d3d39', spire: '#4f6b8c',
};

// --- geometry helpers (every helper takes the y of the part's *bottom* unless it says center) ---

const place = (geometry, material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  return mesh;
};

const box = (w, h, d, m, x = 0, y = 0, z = 0) =>
  place(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m, x, y, z);

const cyl = (rTop, rBottom, h, m, x = 0, y = 0, z = 0, segments = 12) =>
  place(new THREE.CylinderGeometry(rTop, rBottom, h, segments).translate(0, h / 2, 0), m, x, y, z);

// Cylinder lying along x, positioned by its center.
const cylX = (r, length, m, x, yCenter, z, segments = 16) =>
  place(new THREE.CylinderGeometry(r, r, length, segments).rotateZ(Math.PI / 2), m, x, yCenter, z);

// Wheel: axle along z, resting on the ground.
const wheel = (r, width, m, x, z) =>
  place(new THREE.CylinderGeometry(r, r, width, 14).rotateX(Math.PI / 2), m, x, r, z);

const capsule = (r, length, m, x, yCenter, z) =>
  place(new THREE.CapsuleGeometry(r, length, 4, 10), m, x, yCenter, z);

const sphere = (r, m, x, yCenter, z) => place(new THREE.SphereGeometry(r, 14, 10), m, x, yCenter, z);

const blob = (r, m, x, yCenter, z) => place(new THREE.IcosahedronGeometry(r, 1), m, x, yCenter, z);

const shapeOf = points => new THREE.Shape(points.map(([a, b]) => new THREE.Vector2(a, b)));

// Flat slab from a top-down outline [[x, z], …], `t` thick, bottom at y.
const slabXZ = (points, t, m, y) =>
  place(new THREE.ExtrudeGeometry(shapeOf(points.map(([x, z]) => [x, -z])), { depth: t, bevelEnabled: false })
    .rotateX(-Math.PI / 2), m, 0, y, 0);

// Upright plate from a side-view outline [[x, y], …], `t` thick, centered on z.
const plateXY = (points, t, m, z = 0) =>
  place(new THREE.ExtrudeGeometry(shapeOf(points), { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2), m, 0, 0, z);

// Closed convex solid from polygon faces ([[x, y, z], …] each); faces are wound outward automatically.
export function polyhedron(faces) {
  const sub = (a, b) => a.map((v, i) => v - b[i]);
  const mean = pts => pts.reduce((acc, p) => acc.map((v, i) => v + p[i] / pts.length), [0, 0, 0]);
  const center = mean(faces.flat());
  const positions = [];
  for (let face of faces) {
    const [a, b, c] = [sub(face[1], face[0]), sub(face[2], face[0]), sub(mean(face), center)];
    const normal = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (normal[0] * c[0] + normal[1] * c[1] + normal[2] * c[2] < 0) face = [...face].reverse();
    for (let i = 1; i < face.length - 1; i++) positions.push(...face[0], ...face[i], ...face[i + 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Tapered block between two axis-aligned rectangles { x, z, hw, hd, y } (bottom, top).
export function frustumGeometry(bottom, top) {
  const ring = ({ x, z, hw, hd, y }) => [[x - hw, y, z - hd], [x + hw, y, z - hd], [x + hw, y, z + hd], [x - hw, y, z + hd]];
  const b = ring(bottom), t = ring(top);
  return polyhedron([
    [b[0], b[1], t[1], t[0]], [b[1], b[2], t[2], t[1]], [b[2], b[3], t[3], t[2]], [b[3], b[0], t[0], t[3]],
    [t[0], t[1], t[2], t[3]], [b[0], b[1], b[2], b[3]],
  ]);
}

// --- models -------------------------------------------------------------------

const BUILDERS = {
  box: ({ w, h, d }, k) => [box(w, h, d, k.mat(kindColor('box')))],

  phone: ({ w, h, d }, k) => [
    box(w, h * 0.75, d, k.mat(kindColor('phone'))),
    box(w * 0.86, h * 0.25, d * 0.9, k.mat(C.screen), 0, h * 0.75),
  ],

  chair: ({ w, h, d }, k) => {
    const wood = k.mat(kindColor('chair')), dark = k.mat(C.woodDark);
    const seatY = h * 0.48, seatT = h * 0.05, leg = w * 0.08;
    const lx = (w - leg) / 2, lz = (d - leg) / 2;
    const parts = [box(w, seatT, d, wood, 0, seatY)];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push(box(leg, seatY, leg, dark, sx * lx, 0, sz * lz));
      parts.push(box(leg, h - seatY - seatT, leg, dark, sx * lx, seatY + seatT, -lz));
    }
    parts.push(box(w, h * 0.2, leg, wood, 0, h * 0.8, -lz));
    return parts;
  },

  // Built for a 1.75 m person and scaled to the reference's height; shoulders span w.
  person: ({ w, h }, k) => {
    const s = h / 1.75;
    const shirt = k.mat(kindColor('person')), skin = k.mat(C.skin);
    const legR = 0.065 * s, legH = 0.86 * s, armR = 0.045 * s;
    const parts = [];
    for (const sx of [-1, 1]) {
      parts.push(
        capsule(legR, legH - 2 * legR, k.mat(C.pants), sx * 0.09 * s, legH / 2, 0),
        box(0.11 * s, 0.06 * s, 0.2 * s, k.mat(C.shoe), sx * 0.09 * s, 0, 0.03 * s),
        capsule(armR, 0.56 * s, shirt, sx * (w / 2 - armR), 1.13 * s, 0),
        sphere(armR * 1.05, skin, sx * (w / 2 - armR), 0.8 * s, 0),
        sphere(0.012 * s, k.mat(C.eye), sx * 0.038 * s, 1.66 * s, 0.093 * s),
      );
    }
    const torso = capsule(0.15 * s, 0.36 * s, shirt, 0, 1.15 * s, 0);
    torso.scale.z = 0.62;
    // Hair: a hemisphere 1 cm larger than the head on the same center, tipped back so it covers
    // the crown and the back of the head and leaves the face clear.
    const headY = h - 0.115 * s;
    const head = sphere(0.105 * s, skin, 0, headY, 0);
    const hair = place(new THREE.SphereGeometry(0.115 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), k.mat(C.hair), 0, headY, 0);
    hair.rotation.x = -0.5;
    return [...parts, torso, cyl(0.045 * s, 0.05 * s, 0.12 * s, skin, 0, 1.44 * s), head, hair];
  },

  // Built for a 0.8 m long, 0.6 m tall, 0.3 m wide dog, nose toward +x; narrowed to fit `d`.
  dog: ({ w, h, d }, k) => {
    const s = Math.min(h / 0.6, w / 0.8);
    const fur = k.mat(kindColor('dog')), dark = k.mat(C.dogDark);
    const parts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) parts.push(cyl(0.035 * s, 0.03 * s, 0.3 * s, fur, (sx * 0.2 - 0.02) * s, 0, sz * 0.075 * s, 8));
      parts.push(box(0.04 * s, 0.08 * s, 0.05 * s, dark, 0.25 * s, 0.52 * s, sx * 0.07 * s));
    }
    const body = capsule(0.12 * s, 0.34 * s, fur, -0.03 * s, 0.38 * s, 0);
    body.rotation.z = Math.PI / 2;
    const tail = cyl(0.012 * s, 0.02 * s, 0.14 * s, fur, -0.28 * s, 0.42 * s, 0, 6);
    tail.rotation.z = 0.9;
    const dog = new THREE.Group();
    dog.add(
      ...parts, body, tail,
      sphere(0.1 * s, fur, 0.27 * s, 0.5 * s, 0),
      box(0.09 * s, 0.07 * s, 0.08 * s, fur, 0.355 * s, 0.43 * s, 0),
      sphere(0.015 * s, dark, 0.385 * s, 0.485 * s, 0),
    );
    dog.scale.z = Math.min(1, d / (0.3 * s));
    return [dog];
  },

  car: ({ w, h, d }, k) => {
    const paint = k.mat(kindColor('car')), glass = k.mat(C.glass);
    const r = h * 0.22, tw = d * 0.13;
    const parts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(wheel(r, tw, k.mat(C.tire), sx * w * 0.31, sz * (d - tw) / 2));
    const bodyY = h * 0.2, bodyH = h * 0.42, beltY = bodyY + bodyH;
    parts.push(
      box(w, bodyH, d * 0.96, paint, 0, bodyY),
      plateXY([[-w * 0.36, beltY], [w * 0.2, beltY], [w * 0.06, h], [-w * 0.27, h]], d * 0.84, glass),
      box(w * 0.3, h * 0.04, d * 0.8, paint, -w * 0.105, h * 0.96),
    );
    for (const sz of [-1, 1]) {
      parts.push(
        box(w * 0.01, h * 0.08, d * 0.16, k.mat(C.headlight, { glow: GLOW.headlight }), w * 0.495, h * 0.45, sz * d * 0.32),
        box(w * 0.01, h * 0.08, d * 0.16, k.mat(C.taillight, { glow: GLOW.taillight }), -w * 0.495, h * 0.45, sz * d * 0.32),
      );
    }
    return parts;
  },

  // Canopy of faceted blobs on a tapered trunk.
  tree: ({ w, h, d }, k) => {
    const r = Math.min(w, d) / 2;
    return [
      cyl(r * 0.07, r * 0.11, h * 0.5, k.mat(C.trunk), 0, 0, 0, 8),
      blob(r * 0.9, k.mat(kindColor('tree')), 0, h * 0.6, 0),
      blob(r * 0.62, k.mat(C.leafLight), r * 0.15, h - r * 0.62, r * 0.1),
      blob(r * 0.6, k.mat(C.leafDark), -r * 0.36, h * 0.69, -r * 0.3),
      blob(r * 0.55, k.mat(C.leafLight), r * 0.45, h * 0.56, r * 0.35),
    ];
  },

  bus: ({ w, h, d }, k) => {
    const paint = k.mat(kindColor('bus')), glass = k.mat(C.glass), trim = k.mat(C.trim);
    const r = h * 0.16, tw = d * 0.12;
    const parts = [];
    for (const x of [w * 0.32, -w * 0.3]) for (const sz of [-1, 1]) parts.push(wheel(r, tw, k.mat(C.tire), x, sz * (d - tw) / 2));
    parts.push(
      box(w, h * 0.8, d * 0.96, paint, 0, h * 0.12),
      box(w, h * 0.03, d * 0.97, trim, 0, h * 0.42),
      box(w * 0.86, h * 0.24, d, k.mat(C.glass, { glow: GLOW.cabin }), -w * 0.03, h * 0.5),
      box(w * 0.02, h * 0.38, d * 0.86, glass, w * 0.49, h * 0.42),
      box(w * 0.2, h * 0.06, d * 0.5, k.mat(C.busRoof), -w * 0.05, h * 0.92),
    );
    for (const sx of [-1, 1]) parts.push(box(w * 0.02, h * 0.08, d * 0.96, trim, sx * w * 0.49, h * 0.14));
    return parts;
  },

  // Walls inset under a hip roof whose eaves reach the full footprint.
  house: ({ w, h, d }, k) => {
    const wallH = h * 0.52, iw = w * 0.92, id = d * 0.92, rx = w * 0.2;
    const eaves = [[-w / 2, wallH, -d / 2], [w / 2, wallH, -d / 2], [w / 2, wallH, d / 2], [-w / 2, wallH, d / 2]];
    const ridge = [[-rx, h, 0], [rx, h, 0]];
    const roof = polyhedron([
      [eaves[3], eaves[2], ridge[1], ridge[0]], // front
      [eaves[1], eaves[0], ridge[0], ridge[1]], // back
      [eaves[0], eaves[3], ridge[0]],           // left
      [eaves[2], eaves[1], ridge[1]],           // right
      eaves,                                    // underside
    ]);
    const glass = k.mat(C.window, { glow: GLOW.window }), t = d * 0.012;
    return [
      box(iw, wallH, id, k.mat(C.wall)),
      place(roof, k.mat(kindColor('house'))),
      box(w * 0.1, wallH * 0.5, t, k.mat(C.door), -w * 0.15, 0, id / 2),
      box(w * 0.14, wallH * 0.26, t, glass, w * 0.2, wallH * 0.4, id / 2),
      box(t, wallH * 0.26, d * 0.14, glass, iw / 2, wallH * 0.4, -d * 0.18),
      box(t, wallH * 0.26, d * 0.14, glass, iw / 2, wallH * 0.4, d * 0.18),
      box(w * 0.07, h * 0.25, d * 0.07, k.mat(C.chimney), w * 0.22, h * 0.68, -d * 0.16),
    ];
  },

  // Facades get a window grid: one window per ~3.5 m across and per ~3.2 m storey.
  building: ({ w, h, d }, k) => {
    const bodyH = h * 0.93;
    const floors = Math.max(1, Math.round(bodyH / 3.2));
    const alongX = k.facade(Math.max(1, Math.round(w / 3.5)), floors);
    const alongZ = k.facade(Math.max(1, Math.round(d / 3.5)), floors);
    const roof = k.mat(C.rooftop);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d).translate(0, bodyH / 2, 0), [alongZ, alongZ, roof, roof, alongX, alongX]);
    return [
      body,
      box(w * 0.18, h - bodyH, d * 0.3, k.mat(kindColor('building')), -w * 0.25, bodyH, -d * 0.1),
      box(w * 0.1, (h - bodyH) * 0.5, d * 0.15, k.mat(C.rooftop), w * 0.15, bodyH, d * 0.1),
    ];
  },

  // Jumbo jet: w = length, d = wingspan, h = tail height. Same planform as the 2D silhouette.
  plane: ({ w, h, d }, k) => {
    const u = w / 2, v = d / 2;
    const skin = k.mat(C.fuselage), wing = k.mat(kindColor('plane')), engine = k.mat(C.engine);
    const fr = h * 0.165, fy = fr + h * 0.1;          // fuselage radius and axis height
    const wingY = fy - fr * 0.45;
    const nose = sphere(fr, skin, u * 0.78, fy, 0);
    nose.scale.x = (u * 0.22) / fr;
    const tailCone = place(new THREE.ConeGeometry(fr, u * 0.22, 16).rotateZ(Math.PI / 2), skin, -u * 0.89, fy, 0);
    const parts = [
      cylX(fr, u * 1.56, skin, 0, fy, 0),
      nose,
      tailCone,
      slabXZ([[u * 0.2, 0], [-u * 0.3, v], [-u * 0.45, v], [-u * 0.25, 0], [-u * 0.45, -v], [-u * 0.3, -v]], h * 0.035, wing, wingY),
      slabXZ([[-u * 0.72, 0], [-u * 0.92, v * 0.34], [-u, v * 0.34], [-u * 0.9, 0], [-u, -v * 0.34], [-u * 0.92, -v * 0.34]], h * 0.025, wing, fy + fr * 0.2),
      plateXY([[-u * 0.62, fy + fr * 0.6], [-u * 0.9, h], [-u * 0.99, h], [-u * 0.97, fy + fr * 0.6]], d * 0.012, k.mat(C.fin)),
      box(u * 1.3, h * 0.025, fr * 2.02, k.mat(C.glass), -u * 0.05, fy + fr * 0.35),
    ];
    const er = h * 0.065, ey = wingY - er - h * 0.01;
    for (const sz of [-1, 1]) {
      parts.push(cylX(er, u * 0.13, engine, u * 0.04, ey, sz * v * 0.36), cylX(er, u * 0.13, engine, -u * 0.12, ey, sz * v * 0.66));
      parts.push(wheel(fr * 0.22, fr * 0.3, k.mat(C.tire), -u * 0.05, sz * fr * 0.7));
    }
    parts.push(wheel(fr * 0.18, fr * 0.25, k.mat(C.tire), u * 0.7, 0), cyl(fr * 0.06, fr * 0.06, fy - fr, k.mat(C.engine), u * 0.7, 0, 0, 6));
    return parts;
  },

  // Bowl on the same plan as the 2D drawing (silhouettes.js): rounded-rectangle rings from the
  // opening around the pitch (f = 0: 0.72 w × 0.6 d, corners 0.2 d) to the outer wall (f = 1: w × d,
  // corners 0.4 d), joined into stands, a rim, the wall and a canopy; a rectangular pitch inside.
  stadium: ({ w, h, d }, k) => {
    const outline = f => {
      const hw = w * (0.36 + 0.14 * f), hd = d * (0.3 + 0.2 * f), r = d * (0.2 + 0.2 * f);
      return [[1, 1], [-1, 1], [-1, -1], [1, -1]].flatMap(([sx, sz], corner) =>
        Array.from({ length: 9 }, (_, i) => {
          const a = (corner + i / 8) * Math.PI / 2;
          return [sx * (hw - r) + r * Math.cos(a), sz * (hd - r) + r * Math.sin(a)];
        }));
    };
    // A band from ring f0 at height y0 to ring f1 at y1.
    const band = (f0, y0, f1, y1, m) => {
      const [a, b] = [outline(f0), outline(f1)], n = a.length;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(a.flatMap(([x, z], i) => [x, y0, z, b[i][0], y1, b[i][1]]), 3));
      geometry.setIndex(Array.from({ length: n }, (_, i) => {
        const j = (i + 1) % n;
        return [2 * i, 2 * j, 2 * i + 1, 2 * i + 1, 2 * j, 2 * j + 1];
      }).flat());
      geometry.computeVertexNormals();
      return place(geometry, m);
    };
    const both = { side: THREE.DoubleSide };
    const shell = k.mat(kindColor('stadium'), both), seats = k.mat(C.seats, both), line = k.mat(C.pitchLine);
    const pl = w * 0.46, pw = d * 0.36, lw = Math.max(w * 0.002, 0.05), ly = h * 0.006;
    const floor = new THREE.ShapeGeometry(new THREE.Shape(outline(0).map(([x, z]) => new THREE.Vector2(x, -z))))
      .rotateX(-Math.PI / 2).translate(0, ly / 2, 0);
    return [
      band(0, 0, 0, h * 0.06, shell),
      band(0, h * 0.06, 0.82, h * 0.62, seats),
      band(0.82, h * 0.62, 1, h * 0.62, shell),
      band(1, 0, 1, h, shell),
      band(0.45, h * 0.88, 1, h, k.mat(C.canopy, both)),
      place(floor, seats),
      box(pl, ly, pw, k.mat(C.pitch, { glow: GLOW.pitch })),
      box(pl, lw, lw, line, 0, ly, -pw / 2), box(pl, lw, lw, line, 0, ly, pw / 2),
      box(lw, lw, pw, line, -pl / 2, ly, 0), box(lw, lw, pw, line, pl / 2, ly, 0), box(lw, lw, pw, line, 0, ly, 0),
      place(new THREE.RingGeometry(d * 0.05 - lw / 2, d * 0.05 + lw / 2, 32).rotateX(-Math.PI / 2), line, 0, ly + lw, 0),
    ];
  },

  // Eiffel Tower, from its real proportions (125 m base, 330 m tall): splayed legs joined by
  // arches, two platforms, a tapering top and the antenna.
  tower: ({ w, h, d }, k) => {
    const sx = w / 125, sz = d / 125, sy = h / 330;
    const iron = k.mat(kindColor('tower'), { glow: GLOW.tower }), deck = k.mat(C.ironLight, { glow: GLOW.tower });
    const legs = (y0, c0, hw0, y1, c1, hw1) => [-1, 1].flatMap(ix => [-1, 1].map(iz => place(frustumGeometry(
      { x: ix * c0 * sx, z: iz * c0 * sz, hw: hw0 * sx, hd: hw0 * sz, y: y0 * sy },
      { x: ix * c1 * sx, z: iz * c1 * sz, hw: hw1 * sx, hd: hw1 * sz, y: y1 * sy },
    ), iron)));
    // Arches spring from the legs 10 m up and meet the first platform.
    const archR = 45.7, archY = 10;
    const arches = [0, 1, 2, 3].map(i => {
      const arch = place(new THREE.TorusGeometry(archR * sx, 2.2 * sx, 6, 24, Math.PI), iron);
      const a = (i * Math.PI) / 2;
      arch.position.set(Math.sin(a) * archR * sx, archY * sy, Math.cos(a) * archR * sz);
      arch.rotation.y = a;
      return arch;
    });
    return [
      ...legs(0, 49.5, 13, 57, 28, 7),
      ...arches,
      box(72 * sx, 5 * sy, 72 * sz, deck, 0, 55 * sy),
      ...legs(60, 30, 6, 115, 16, 4),
      box(42 * sx, 4 * sy, 42 * sz, deck, 0, 113 * sy),
      ...legs(117, 14, 4, 190, 4, 2.5),
      place(frustumGeometry({ x: 0, z: 0, hw: 7 * sx, hd: 7 * sz, y: 188 * sy }, { x: 0, z: 0, hw: 3.5 * sx, hd: 3.5 * sz, y: 276 * sy }), iron),
      box(9 * sx, 7 * sy, 9 * sz, deck, 0, 276 * sy),
      cyl(0.6 * sx, 1.2 * sx, 47 * sy, iron, 0, 283 * sy, 0, 8),
    ];
  },

  coin: ({ w, h }, k) => [
    cyl(w / 2, w / 2, h * 0.9, k.mat(kindColor('coin')), 0, 0, 0, 28),
    cyl(w * 0.41, w * 0.41, h * 0.1, k.mat(C.goldLight), 0, h * 0.9, 0, 28),
  ],

  // Cruise ship, bow toward +x: hull, three white deck tiers with window bands, the funnel.
  ship: ({ w, h, d }, k) => {
    const white = k.mat(C.deck), glass = k.mat(C.glass, { glow: GLOW.window });
    return [
      slabXZ([[-w / 2, -d * 0.42], [w * 0.3, -d / 2], [w / 2, 0], [w * 0.3, d / 2], [-w / 2, d * 0.42]], h * 0.3, k.mat(kindColor('ship')), 0),
      box(w * 0.67, h * 0.2, d * 0.8, white, -w * 0.085, h * 0.3),
      box(w * 0.672, h * 0.04, d * 0.81, glass, -w * 0.085, h * 0.38),
      box(w * 0.56, h * 0.2, d * 0.72, white, -w * 0.1, h * 0.5),
      box(w * 0.562, h * 0.04, d * 0.73, glass, -w * 0.1, h * 0.58),
      box(w * 0.4, h * 0.15, d * 0.6, white, -w * 0.12, h * 0.7),
      box(w * 0.06, h * 0.15, d * 0.24, k.mat(C.funnel), -w * 0.27, h * 0.85),
    ];
  },

  // Burj Khalifa: three wings in a Y around a core, each tier shorter than the one below,
  // then the spire. Shifted so the Y's bounding box is centered.
  spire: ({ w, h }, k) => {
    const s = w / 109, sy = h / 828, ox = -10.6 * s, hw = 13 * s;
    const tiers = [[65, 150], [55, 300], [45, 430], [35, 540], [25, 620], [16, 690]];
    const parts = [];
    tiers.forEach(([length, top], i) => {
      const glass = k.mat(i % 2 ? C.spireCore : kindColor('spire'), { glow: GLOW.spire });
      for (let j = 0; j < 3; j++) {
        const wing = place(new THREE.BoxGeometry(length * s, top * sy, hw * 2).translate((length * s) / 2, (top * sy) / 2, 0), glass, ox);
        wing.rotation.y = (-j * 2 * Math.PI) / 3;
        parts.push(wing);
      }
    });
    return [...parts, cyl(16 * s, 18 * s, 720 * sy, k.mat(C.spireCore), ox, 0, 0), cyl(0.8 * s, 5 * s, 138 * sy, k.mat(C.spireTop), ox, 690 * sy, 0, 8)];
  },

  // Golden Gate Bridge: deck 67 m up, two 227 m towers 1,280 m apart, main cables, anchorages.
  bridge: ({ w, h, d }, k) => {
    const sx = w / 2737, sy = h / 227;
    const orange = k.mat(kindColor('bridge'), { glow: GLOW.bridge }), concrete = k.mat(C.concrete);
    const parts = [box(w, 5 * sy, d * 0.85, orange, 0, 64 * sy)];
    for (const s of [-1, 1]) {
      const x = s * 640 * sx;
      for (const sz of [-1, 1]) parts.push(box(10 * sx, h, d * 0.18, orange, x, 0, sz * d * 0.41));
      for (const y of [95, 145, 190, 219]) parts.push(box(8 * sx, 6 * sy, d * 0.7, orange, x, y * sy));
      parts.push(box(40 * sx, 75 * sy, d, concrete, s * 983 * sx));
      for (const px of [1180, 1340]) parts.push(box(8 * sx, 64 * sy, d * 0.6, concrete, s * px * sx));
    }
    // Main cables: sagging from the tower tops to mid-span and down to the anchorages.
    const cableY = x => {
      const ax = Math.abs(x);
      return ax <= 640 ? 72 + 148 * (ax / 640) ** 2 : 72 + 148 * ((983 - ax) / 343) ** 2;
    };
    for (const sz of [-1, 1]) {
      const points = Array.from({ length: 61 }, (_, i) => {
        const x = -983 + (1966 * i) / 60;
        return new THREE.Vector3(x * sx, cableY(x) * sy, sz * d * 0.41);
      });
      parts.push(place(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 120, 1.2 * sx, 6), orange));
    }
    return parts;
  },

  // Mount Fuji: wide gentle foothills rising to a ~30° summit cone with a crater, and its snow
  // cap lying just on top.
  mountain: ({ w, h }, k) => {
    const r = w / 2;
    const profile = [[1, 0], [0.7, 0.05], [0.5, 0.12], [0.35, 0.25], [0.22, 0.45], [0.13, 0.68], [0.08, 0.88], [0.06, 1], [0.035, 0.985], [0, 0.96]];
    const lathe = (points, grow = 1) =>
      new THREE.LatheGeometry(points.map(([pr, py]) => new THREE.Vector2(pr * r * grow, py * h)), 28);
    // Green foothills turning to bare rock higher up, so the rise reads even from far away.
    const rock = lathe(profile);
    const [green, slate, color] = [new THREE.Color(C.foothills), new THREE.Color(kindColor('mountain')), new THREE.Color()];
    const y = rock.attributes.position;
    rock.setAttribute('color', new THREE.Float32BufferAttribute(
      Array.from({ length: y.count }, (_, i) => color.copy(green).lerp(slate, Math.min(1, y.getY(i) / (h * 0.35))).toArray()).flat(), 3));
    return [
      place(rock, k.mat('#ffffff', { side: THREE.DoubleSide, vertexColors: true })),
      place(lathe(profile.slice(4), 1.012), k.mat(C.snow, { side: THREE.DoubleSide })),
    ];
  },

  // The Moon, resting on the ground, with darker maria on the side facing the camera.
  moon: ({ w }, k) => {
    const geometry = new THREE.IcosahedronGeometry(w / 2, 4);
    const maria = [[-0.3, 0.3, 0.9, 0.45], [0.35, 0.45, 0.8, 0.38], [0.1, -0.1, 1, 0.3], [0.6, 0.1, 0.75, 0.28]]
      .map(([x, y, z, radius]) => ({ dir: new THREE.Vector3(x, y, z).normalize(), radius }));
    const base = new THREE.Color(C.moon), dark = base.clone().multiplyScalar(0.45), color = new THREE.Color();
    const pos = geometry.attributes.position, v = new THREE.Vector3();
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      const shade = Math.max(0, ...maria.map(m => 1 - v.angleTo(m.dir) / m.radius));
      color.copy(base).lerp(dark, Math.min(1, shade * 2));
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeBoundingBox();
    return [place(geometry, k.mat('#ffffff', { vertexColors: true, glow: GLOW.moon }), 0, -geometry.boundingBox.min.y, 0)];
  },
};

export const MODEL_KINDS = Object.keys(BUILDERS);

export function buildModel(ref, kit) {
  const group = new THREE.Group();
  group.name = ref.id;
  group.add(...(BUILDERS[ref.kind] ?? BUILDERS.box)(ref, kit));
  return group;
}

// Shared materials for all models (flat-shaded for the low-poly look), created on first use and
// freed together. At night, parts given a `glow` colour light up. `textures: false` skips canvas
// textures, e.g. when running without a DOM.
export function createKit({ textures = typeof document !== 'undefined' } = {}) {
  const materials = new Map();
  const maps = [];
  let windowCanvas = null;
  let night = false;

  const mat = (color, { side = THREE.FrontSide, vertexColors = false, glow = null } = {}) => {
    const emissive = night && glow ? glow : '#000000';
    const key = `${color}|${side}|${vertexColors}|${emissive}`;
    if (!materials.has(key)) {
      materials.set(key, new THREE.MeshStandardMaterial({ color, side, vertexColors, emissive, flatShading: true, roughness: 0.85, metalness: 0 }));
    }
    return materials.get(key);
  };

  const texture = (canvas, repeat) => {
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(...repeat);
    map.anisotropy = 4;
    maps.push(map);
    return map;
  };

  // Facade with `cols` × `rows` windows per face; at night some of them are lit.
  const facade = (cols, rows) => {
    if (!textures) return mat(C.facade);
    const key = `facade|${cols}x${rows}|${night}`;
    if (!materials.has(key)) {
      windowCanvas ??= drawWindow();
      const lit = night ? { emissive: '#ffffff', emissiveMap: texture(drawLitWindows(cols, rows), [1, 1]) } : {};
      materials.set(key, new THREE.MeshStandardMaterial({ map: texture(windowCanvas, [cols, rows]), ...lit, flatShading: true, roughness: 0.8, metalness: 0 }));
    }
    return materials.get(key);
  };

  return {
    mat,
    facade,
    setNight(on) {
      night = on;
    },
    dispose() {
      materials.forEach(m => m.dispose());
      maps.forEach(t => t.dispose());
      materials.clear();
      maps.length = 0;
    },
  };
}

// Night facade: a warm light in roughly every other window (the same ones every time).
function drawLitWindows(cols, rows) {
  const canvas = document.createElement('canvas');
  canvas.width = cols * 16;
  canvas.height = rows * 16;
  const g = canvas.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, canvas.width, canvas.height);
  let seed = cols * 31 + rows;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const warm = ['#ffcf7a', '#ffe2a8', '#ffb95e'];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (random() > 0.45) continue;
      g.fillStyle = warm[Math.floor(random() * warm.length)];
      g.fillRect(c * 16 + 3, r * 16 + 3, 10, 9);
    }
  }
  return canvas;
}

function drawWindow() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const g = canvas.getContext('2d');
  g.fillStyle = C.facade;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = C.facadeGlass;
  g.fillRect(12, 12, 40, 36);
  g.fillStyle = C.facadeSill;
  g.fillRect(10, 48, 44, 4);
  return canvas;
}
