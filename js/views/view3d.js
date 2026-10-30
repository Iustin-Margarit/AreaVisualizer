import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { formatLength, formatLengths, escapeHTML } from '../core/format.js';
import { keyDimension } from '../core/references.js';
import { layoutLabels } from './labels.js';
import { toolsHTML, legendHTML, cameraDockHTML, coarsePointer } from './stage-ui.js';
import { t } from '../i18n/index.js';
import { translatePage } from '../i18n/dom.js';
import { buildModel, createKit } from './3d/models.js';
import { loadModel, placeModel } from './3d/gltf.js';
import { MODELS } from '../data/models.js';
import { createGround } from './3d/ground.js';
import { orbitBasis, fitDistance, gridLevels } from './3d/math.js';

const deg = THREE.MathUtils.degToRad;
const FOV = 40;                                   // vertical field of view, degrees
const TAN_HALF_FOV = Math.tan(deg(FOV / 2));
const AZIMUTH = deg(-28);                         // default camera swung to the front-left
const MARGIN = 0.8;                               // share of the view the content may fill
const MIN_DISTANCE = 1 / 1000;                    // zoom limits, relative to the fitted distance
const MAX_DISTANCE = 4;
const EYE_HEIGHT = 1.65;
const SUN = new THREE.Vector3(-0.45, 1, 0.6).normalize();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const TINY_PX = 10;                               // smaller on screen than this → locator ring
const FT = 0.3048;

// Day and night lighting (night follows the dark theme).
const LIGHTS = {
  day: { sky: '#dcebff', ground: '#a7b29b', hemi: 1.55, sun: '#fff2df', sunIntensity: 2.2 },
  night: { sky: '#9fb3ff', ground: '#1c2230', hemi: 1.0, sun: '#cdd9ff', sunIntensity: 1.4 },
};
const MOON = new THREE.Vector3(0.45, 0.24, -0.86).normalize(); // low in the sky ahead of the default camera

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
// Default camera height: low on wide screens, steeper on tall ones, where a low view of a flat
// area would leave the top of the stage as empty ground.
const elevationFor = aspect => deg(THREE.MathUtils.mapLinear(THREE.MathUtils.clamp(aspect, 0.75, 1.5), 0.75, 1.5, 40, 25));
const easeInOut = t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

// The area's outline as a 2D shape (shape y = -z); with `band`, a frame that wide centered on the edge.
function outline(shape, band = 0) {
  const path = grow => {
    const s = new THREE.Shape();
    if (shape.type === 'circle') return s.absarc(0, 0, shape.radius + grow, 0, Math.PI * 2, false);
    const hw = shape.width / 2 + grow, hd = shape.depth / 2 + grow;
    return s.moveTo(-hw, -hd).lineTo(hw, -hd).lineTo(hw, hd).lineTo(-hw, hd).closePath();
  };
  if (!band) return path(0);
  const frame = path(band / 2);
  frame.holes.push(path(-band / 2));
  return frame;
}

// Flat strips along polylines on the ground (WebGL lines are always 1 px thin).
function ribbons(lines, closed, width, y) {
  const positions = [];
  for (const line of lines) {
    const pts = closed ? [...line, line[0]] : line;
    for (let i = 0; i < pts.length - 1; i++) {
      const [[ax, az], [bx, bz]] = [pts[i], pts[i + 1]];
      const len = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / len) * width / 2, nz = ((bx - ax) / len) * width / 2;
      const quad = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
      for (const k of [0, 1, 2, 0, 2, 3]) positions.push(quad[k][0], y, quad[k][1]);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// Soft round glow (a radial gradient) — clouds, the Milky Way and the moon are made of these.
function puff(g, x, y, r, rgb, alpha) {
  const gradient = g.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  gradient.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = gradient;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

// Sky dome texture (equirectangular: top row straight up, middle row the horizon). A gradient from
// `top` to `horizon` — the fog colour, so the ground fades into it seamlessly — with soft clouds
// by day and a faint Milky Way at night.
function skyTexture(top, horizon, night) {
  const [W, H] = [1024, 512];
  const half = H / 2;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, half);
  const blend = k => `#${new THREE.Color(top).lerp(new THREE.Color(horizon), k).getHexString()}`;
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.55, blend(0.3)); // stays properly blue well down the sky,
  gradient.addColorStop(0.9, blend(0.75)); // then pales into the horizon haze
  gradient.addColorStop(1, horizon);
  g.fillStyle = gradient;
  g.fillRect(0, 0, W, half);
  g.fillStyle = horizon;
  g.fillRect(0, half, W, half);

  const random = seeded(night ? 29 : 11);
  const rowAt = elevationDeg => half * (1 - elevationDeg / 90);
  if (night) {
    // A band of faint light winding across the sky.
    for (let i = 0; i < 260; i++) {
      const t = random();
      const y = rowAt(30 + 22 * Math.sin(t * Math.PI * 2 + 0.8)) + (random() - 0.5) * 26;
      puff(g, t * W, y, 14 + random() * 26, '170, 185, 255', 0.035);
    }
  } else {
    // Clouds: clusters of soft puffs, flatter and smaller toward the horizon.
    for (let c = 0; c < 16; c++) {
      const x = 80 + random() * (W - 160);
      const elevation = 3 + random() * 24;
      const spread = 50 + random() * 110;
      for (let i = 0; i < 9; i++) {
        const r = (12 + random() * 18) * (0.6 + elevation / 30);
        puff(g, x + (random() - 0.5) * spread, rowAt(elevation) + (random() - 0.5) * 8, r, '255, 255, 255', 0.8);
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The moon: a pale disc with a few darker seas, in a soft blue halo.
function moonSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d');
  puff(g, 128, 128, 128, '170, 190, 255', 0.35);
  g.fillStyle = '#eef1f7';
  g.beginPath();
  g.arc(128, 128, 34, 0, Math.PI * 2);
  g.fill();
  for (const [x, y, r] of [[116, 118, 9], [137, 112, 6], [134, 136, 8], [119, 140, 5]]) {
    g.fillStyle = 'rgba(160, 170, 190, 0.55)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, fog: false, depthWrite: false, transparent: true }));
  sprite.position.copy(MOON);
  sprite.scale.setScalar(0.22);
  return sprite;
}

// Night sky objects: crisp pixel-sized stars and the moon, on a dome that travels with the camera
// just inside the far plane, so the ground hides whatever is below the horizon.
function nightSky() {
  const random = seeded(7);
  const layer = (count, size, opacity) => {
    const positions = [];
    while (positions.length < count * 3) {
      const y = random();                 // uniform over the dome
      if (y < 0.04) continue;             // leave the horizon haze clear
      const a = random() * Math.PI * 2, r = Math.sqrt(1 - y * y);
      positions.push(r * Math.cos(a), y, r * Math.sin(a));
    }
    const points = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)),
      new THREE.PointsMaterial({ size, sizeAttenuation: false, color: '#ffffff', transparent: true, opacity, fog: false, depthWrite: false }),
    );
    points.frustumCulled = false;
    return points;
  };
  const sky = new THREE.Group();
  sky.add(layer(1100, 1, 0.65), layer(220, 1.6, 0.85), layer(40, 2.4, 1), moonSprite());
  return sky;
}

const capitalize = s => s[0].toUpperCase() + s.slice(1);

const extrudeUp = (shape2d, height) =>
  new THREE.ExtrudeGeometry(shape2d, { depth: height, bevelEnabled: false, curveSegments: 72 }).rotateX(-Math.PI / 2);

// Perspective view with orbit controls. Renders only when something changes (camera moves,
// new area, theme switch) or while spinning, to save battery. Labels are HTML on top of the
// canvas, so they stay crisp and use the page's fonts and colours.
export function createView() {
  let root, labelsEl, legendScale, hint, dock;
  let renderer, scene, camera, controls, ground, kit, sun, hemi, stars;
  let content = null, model = null;
  let opts = { system: 'metric', both: false, areaLabel: '', volumeLabel: '', night: false, settings: { grid: true, labels: true, measures: true, shadows: true } };
  let fitted = null;        // { center, radius, points (relative), distance, limits: Box3 }
  let labels = [];
  let vw = 0, vh = 0;
  let frame = 0, tween = null, introDone = false;
  let preset = 'angle'; // the camera view picked last; null once the visitor moves the camera
  let resizeObserver = null;
  const materials = {};
  const skies = {};
  const tmp = new THREE.Vector3();

  function requestRender() {
    if (!frame && renderer) frame = requestAnimationFrame(render);
  }

  // --- camera ----------------------------------------------------------------

  // Distance at which the whole scene fits when seen from this angle.
  const distanceFor = (elevation, azimuth) => {
    const tanY = TAN_HALF_FOV * MARGIN;
    return Math.max(fitDistance(fitted.points, orbitBasis(elevation, azimuth), tanY * camera.aspect, tanY), fitted.radius * 0.5);
  };

  function viewAt(distance, elevation = elevationFor(camera.aspect), azimuth = AZIMUTH) {
    const [x, y, z] = orbitBasis(elevation, azimuth).toCamera;
    return { target: fitted.center.clone(), position: fitted.center.clone().add(new THREE.Vector3(x, y, z).multiplyScalar(distance)) };
  }

  const framedFrom = (elevation, azimuth) => viewAt(distanceFor(elevation, azimuth), elevation, azimuth);

  // Standing in front of the scene with eyes 1.65 m up, a little to the left, just far enough back
  // to see the area and every object beside it.
  function eyeLevelView() {
    const { shape, bounds } = model;
    const left = -shape.width / 2, right = Math.max(bounds.maxX, shape.width / 2);
    const target = new THREE.Vector3((left + right) / 2, 0, 0);
    const back = Math.max((right - left) / 2 / (TAN_HALF_FOV * camera.aspect * 0.85), 3);
    const azimuth = deg(-18);
    return {
      target,
      position: new THREE.Vector3(target.x + Math.sin(azimuth) * back, EYE_HEIGHT, shape.depth / 2 + Math.cos(azimuth) * back),
    };
  }

  const PRESETS = {
    angle: () => viewAt(fitted.distance),
    top: () => framedFrom(deg(89), 0),
    front: () => framedFrom(deg(10), 0),
    eye: eyeLevelView,
  };

  function jump(view) {
    tween = null;
    controls.target.copy(view.target);
    camera.position.copy(view.position);
    controls.update();
  }

  // Glides target and camera together, orbiting (not cutting straight) between the two views.
  function animateTo(view, ms) {
    if (reducedMotion() || ms <= 0) return jump(view);
    const sph = (position, target) => new THREE.Spherical().setFromVector3(tmp.subVectors(position, target));
    const from = { target: controls.target.clone(), sph: sph(camera.position, controls.target) };
    const to = { target: view.target.clone(), sph: sph(view.position, view.target) };
    to.sph.theta = from.sph.theta + THREE.MathUtils.euclideanModulo(to.sph.theta - from.sph.theta + Math.PI, Math.PI * 2) - Math.PI;
    tween = { from, to, start: performance.now(), ms };
    requestRender();
  }

  function stepTween(now) {
    const { from, to, start, ms } = tween;
    const k = Math.min(1, Math.max(0, (now - start) / ms));
    const e = easeInOut(k);
    controls.target.lerpVectors(from.target, to.target, e);
    const radius = from.sph.radius * (to.sph.radius / from.sph.radius) ** e; // even zoom speed
    const phi = THREE.MathUtils.lerp(from.sph.phi, to.sph.phi, e);
    const theta = THREE.MathUtils.lerp(from.sph.theta, to.sph.theta, e);
    camera.position.setFromSphericalCoords(radius, phi, theta).add(controls.target);
    if (k === 1) tween = null;
    else requestRender();
  }

  function zoomBy(factor) {
    const offset = tmp.subVectors(camera.position, controls.target);
    const distance = THREE.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance);
    preset = null;
    animateTo({ target: controls.target.clone(), position: controls.target.clone().add(offset.setLength(distance)) }, 260);
  }

  function turnBy(angle) {
    const sph = new THREE.Spherical().setFromVector3(tmp.subVectors(camera.position, controls.target));
    sph.theta += angle;
    preset = null;
    animateTo({ target: controls.target.clone(), position: new THREE.Vector3().setFromSpherical(sph).add(controls.target) }, 500);
  }

  function resetView() {
    preset = 'angle';
    if (fitted) animateTo(PRESETS.angle(), 650);
  }

  function setSpin(on) {
    controls.autoRotate = on;
    dock.querySelector('[data-cam="spin"]').setAttribute('aria-pressed', String(on));
    if (on) {
      tween = null;
      requestRender();
    }
  }

  // Points that must be in view: the area's footprint with its dimension lines, each object's
  // box and the landmark. (A box around everything would also frame the empty air above the area.)
  function keyPoints() {
    const { shape, references, span, height } = model;
    const off = span * 0.07;
    const points = [];
    for (const x of [-shape.width / 2 - off, shape.width / 2]) {
      for (const z of [-shape.depth / 2, shape.depth / 2 + off]) {
        for (const y of [0, height]) points.push(new THREE.Vector3(x, y, z));
      }
    }
    if (height) {
      const [x, z] = heightMarkAt(shape, span, height);
      points.push(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, height, z));
    }
    for (const r of references) {
      for (const x of [r.x - r.w / 2, r.x + r.w / 2]) for (const y of [0, r.h]) for (const z of [r.z - r.d / 2, r.z + r.d / 2]) {
        points.push(new THREE.Vector3(x, y, z));
      }
    }
    const lm = model.landmark;
    if (lm) {
      for (const x of [lm.x - lm.shape.width / 2, lm.x + lm.shape.width / 2]) {
        for (const z of [lm.z - lm.shape.depth / 2, lm.z + lm.shape.depth / 2]) points.push(new THREE.Vector3(x, 0, z));
      }
    }
    return points;
  }

  // Frames the scene from the default angle, as tightly as the margin allows.
  function fitView() {
    const points = keyPoints();
    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(...points.map(p => p.distanceTo(center)));
    fitted = { center, radius, points: points.map(p => [p.x - center.x, p.y - center.y, p.z - center.z]), limits: box.clone().expandByScalar(radius * 0.5) };
    fitted.distance = distanceFor(elevationFor(camera.aspect), AZIMUTH);
    controls.minDistance = fitted.distance * MIN_DISTANCE;
    controls.maxDistance = fitted.distance * MAX_DISTANCE;
  }

  // --- scene -----------------------------------------------------------------

  function disposeContent() {
    if (!content) return;
    content.traverse(o => { if (!o.userData.shared) o.geometry?.dispose(); });
    scene.remove(content);
    content = null;
  }

  // Where the height is measured: standing at the front-left corner, beyond both ground lines
  // (left of a circle), and further out beside a tall, narrow box.
  const heightMarkAt = (shape, span, height) => {
    const off = Math.max(span * 0.07, height * 0.05);
    return [-shape.width / 2 - off, shape.type === 'circle' ? 0 : shape.depth / 2 + off];
  };

  function dimensionMarks(shape, span, height) {
    const lw = span * 0.004, lift = span * 0.0008, off = span * 0.07, tick = span * 0.04;
    const bar = (sx, sy, sz, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materials.dims);
      mesh.position.set(x, y, z);
      return mesh;
    };
    const strip = (length, alongX, x, z) => bar(alongX ? length : lw, lift, alongX ? lw : length, x, lift / 2, z);
    const zf = shape.depth / 2 + off;
    const marks = [strip(shape.width, true, 0, zf), strip(tick, false, -shape.width / 2, zf), strip(tick, false, shape.width / 2, zf)];
    if (shape.type !== 'circle') {
      const xl = -shape.width / 2 - off;
      marks.push(strip(shape.depth, false, xl, 0), strip(tick, true, xl, -shape.depth / 2), strip(tick, true, xl, shape.depth / 2));
    }
    if (height) {
      // Thin enough not to swamp a low box, thick enough to see beside a tall one.
      const w = Math.min(Math.max(span, height) * 0.004, height * 0.03);
      const [x, z] = heightMarkAt(shape, span, height);
      const end = Math.max(tick, w * 6);
      marks.push(bar(w, height, w, x, height / 2, z), bar(end, w, w, x, w / 2, z), bar(end, w, w, x, height - w / 2, z));
    }
    const group = new THREE.Group();
    group.add(...marks);
    return group;
  }

  // The comparison landmark lying on the ground: translucent fill, outline, markings.
  function landmarkGroup({ x, z, shape }, span) {
    const size = Math.max(span, shape.width, shape.depth);
    const lift = size * 0.0004;
    const line = Math.min(size * 0.003, Math.max(shape.width, shape.depth) * 0.03);
    const fill = new THREE.Mesh(
      new THREE.ShapeGeometry(shape.rings.map(r => new THREE.Shape(r.map(([px, pz]) => new THREE.Vector2(px, -pz))))).rotateX(-Math.PI / 2),
      materials.landmarkFill,
    );
    fill.position.y = lift;
    fill.receiveShadow = true;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.add(
      fill,
      new THREE.Mesh(ribbons(shape.marks, false, line * 0.6, lift * 2), materials.landmarkMarks),
      new THREE.Mesh(ribbons(shape.rings, true, line, lift * 3), materials.landmarkLine),
    );
    return group;
  }

  // With a height the area becomes a see-through box (or cylinder): glass walls and lid, with
  // solid edges. It's a measuring aid like the area itself, so it casts no shadow.
  function volumeGroup(shape, span, height) {
    const edge = Math.min(Math.max(span, height) * 0.005, Math.min(span, height) * 0.05);
    const glass = materials.walls;
    const group = new THREE.Group();
    const walls = shape.type === 'circle'
      ? new THREE.Mesh(new THREE.CylinderGeometry(shape.radius, shape.radius, height, 72), [glass, glass, materials.hidden]) // side, top, bottom
      : new THREE.Mesh(new THREE.BoxGeometry(shape.width, height, shape.depth), [glass, glass, glass, materials.hidden, glass, glass]); // ±x, top, bottom, ±z
    walls.position.y = height / 2;
    const lip = Math.min(edge, height * 0.02);
    const lid = new THREE.Mesh(extrudeUp(outline(shape, edge), lip), materials.rim);
    lid.position.y = height - lip;
    group.add(walls, lid);
    if (shape.type !== 'circle') {
      for (const x of [-1, 1]) for (const z of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(edge, height, edge), materials.rim);
        post.position.set(x * shape.width / 2, height / 2, z * shape.depth / 2);
        group.add(post);
      }
    }
    return group;
  }

  let measureMarks = null;

  function rebuildContent() {
    disposeContent();
    const { shape, references, span, height } = model;
    const t = span * 0.004;
    content = new THREE.Group();

    // Translucent area so the ground grid shows through (count the squares), with a solid rim.
    const area = new THREE.Mesh(extrudeUp(outline(shape), t), materials.area);
    area.position.y = t * 0.2;
    area.receiveShadow = true;
    const rim = new THREE.Mesh(extrudeUp(outline(shape, span * 0.006), t * 1.4), materials.rim);
    rim.receiveShadow = true;
    measureMarks = dimensionMarks(shape, span, height);
    content.add(area, rim, measureMarks);
    if (height) content.add(volumeGroup(shape, span, height));

    if (model.landmark) content.add(landmarkGroup(model.landmark, span));

    // Downloaded models arrive a moment later (once, then they're cached); the built-in model
    // stands in only if one can't be loaded.
    const group = content;
    for (const ref of references) {
      const holder = new THREE.Group();
      holder.position.set(ref.x, 0, ref.z);
      content.add(holder);
      const builtIn = () => {
        const object = buildModel(ref, kit);
        object.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
        holder.add(object);
      };
      const spec = MODELS[ref.id];
      if (!spec) {
        builtIn();
        continue;
      }
      loadModel(spec).then(
        model => holder.add(placeModel(model, spec, ref, opts.night)),
        err => { console.warn(`Model ${spec.file} failed, using the built-in one`, err); builtIn(); },
      ).then(() => {
        if (!renderer || content !== group) return; // closed, or the scene has moved on
        renderer.shadowMap.needsUpdate = true;
        requestRender();
      });
    }
    scene.add(content);
  }

  // Sun and its shadow camera sized to the scene; shadows only re-render when the scene changes.
  function placeSun() {
    const { center, radius } = fitted;
    sun.target.position.set(center.x, 0, center.z);
    sun.position.copy(sun.target.position).addScaledVector(SUN, radius * 3);
    const cam = sun.shadow.camera;
    cam.left = cam.bottom = -radius * 1.15;
    cam.right = cam.top = radius * 1.15;
    cam.near = radius * 0.5;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = radius * 0.0015;
    renderer.shadowMap.needsUpdate = true;
  }

  // Colours come from the page's CSS tokens, so the 3D scene follows the theme and area colour.
  function applyColors() {
    const css = getComputedStyle(root);
    const get = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
    const horizon = get('--sky', '#e8edf4');
    const mode = opts.night ? 'night' : 'day';
    const key = `${mode}|${horizon}`;
    if (!skies[key]) skies[key] = skyTexture(get('--sky-top', '#bcd3ee'), horizon, opts.night);
    scene.background = skies[key];
    stars.visible = opts.night;
    scene.fog.color.set(horizon);
    ground.setColors(get('--ground', '#f4f5f7'), get('--ground-line', '#aab2bf'));
    materials.area.color.set(get('--area-3d', '#3b82f6'));
    materials.walls.color.set(get('--area-3d', '#3b82f6'));
    materials.rim.color.set(get('--shape-stroke', '#2563eb'));
    materials.dims.color.set(get('--muted', '#5d6470'));
    for (const m of [materials.landmarkFill, materials.landmarkLine, materials.landmarkMarks]) m.color.set(get('--landmark', '#d97706'));
    const light = LIGHTS[mode];
    hemi.color.set(light.sky);
    hemi.groundColor.set(light.ground);
    hemi.intensity = light.hemi;
    sun.color.set(light.sun);
    sun.intensity = light.sunIntensity;
  }

  function applySettings() {
    const { grid, measures, shadows } = opts.settings;
    ground.setGridStrength(grid ? 0.8 : 0);
    legendScale.hidden = !grid;
    measureMarks.visible = measures;
    sun.castShadow = shadows;
    renderer.shadowMap.needsUpdate = true;
  }

  // --- labels ----------------------------------------------------------------

  function buildLabels() {
    labelsEl.textContent = '';
    const { shape, references, span, height } = model;
    const fmt = m => formatLengths(m, opts.system, opts.both);
    const off = span * 0.07;
    const make = (cls, html) => {
      const el = document.createElement('div');
      el.className = `l3 ${cls}`;
      el.innerHTML = html;
      labelsEl.append(el);
      return el;
    };
    labels = [
      { type: 'dim', el: make('l3-dim', shape.type === 'circle' ? `⌀ ${fmt(shape.width)}` : fmt(shape.width)), point: new THREE.Vector3(0, 0, shape.depth / 2 + off) },
    ];
    if (shape.type !== 'circle') {
      labels.push({ type: 'dim', el: make('l3-dim', fmt(shape.depth)), point: new THREE.Vector3(-shape.width / 2 - off, 0, 0) });
    }
    if (height) {
      const [x, z] = heightMarkAt(shape, span, height);
      // Sits left of its line, and slides along it if another measurement is in the way.
      labels.push({
        type: 'dim', el: make('l3-dim', `↕ ${fmt(height)}`), point: new THREE.Vector3(x, height / 2, z), size: height,
        left: true, slide: [0.5, 0.75, 0.9, 0.25].map(k => new THREE.Vector3(x, height * k, z)),
      });
    }
    if (opts.areaLabel) {
      const volume = height && opts.volumeLabel ? `<small>${opts.volumeLabel}</small>` : '';
      labels.push({ type: 'area', el: make('l3-area', opts.areaLabel + volume), point: new THREE.Vector3(0, span * 0.006, 0) });
    }
    const lm = model.landmark;
    if (lm) {
      labels.push({
        type: 'landmark', el: make('l3-landmark', capitalize(lm.name)),
        point: new THREE.Vector3(lm.x, 0, lm.z), size: Math.max(lm.shape.width, lm.shape.depth),
      });
    }
    for (const ref of references) {
      const key = keyDimension(ref);
      labels.push({
        type: 'ref',
        el: make('l3-ref', `${escapeHTML(ref.name)} <small>${key.symbol} ${fmt(key.value)}</small>`),
        ring: make('l3-ring', ''),
        leader: make('l3-leader', ''),
        top: new THREE.Vector3(ref.x, ref.h, ref.z),
        middle: new THREE.Vector3(ref.x, ref.h / 2, ref.z),
        size: Math.max(ref.w, ref.h, ref.d),
      });
    }
    // Measure once while visible, then hide until the first frame positions them.
    for (const l of labels) {
      l.width = l.el.offsetWidth;
      for (const el of [l.el, l.ring, l.leader]) if (el) el.hidden = true;
    }
  }

  function updateLabels() {
    const { labels: showNames, measures } = opts.settings;
    const pxPerMeter = p => vh / (2 * TAN_HALF_FOV * Math.max(camera.position.distanceTo(p), 1e-9));
    const project = p => {
      tmp.copy(p).project(camera);
      return { x: (tmp.x + 1) / 2 * vw, y: (1 - tmp.y) / 2 * vh, visible: tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 };
    };
    const move = (el, x, y, anchor) => { el.style.transform = `translate(${x}px, ${y}px) translate(${anchor})`; };
    const areaVisible = model.span * pxPerMeter(fitted.center) > 70;

    const refs = [];
    const taken = []; // screen boxes of the measurement labels placed so far
    const box = (l, p) => (l.left ? [p.x - 8 - l.width, p.y - 10, p.x - 8, p.y + 10] : [p.x - l.width / 2, p.y - 10, p.x + l.width / 2, p.y + 10]);
    const free = b => !taken.some(t => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
    for (const l of labels) {
      if (l.type !== 'ref') {
        const wanted = l.type === 'landmark' ? showNames : measures;
        let p = project(l.point);
        if (l.slide) p = l.slide.map(project).find(c => c.visible && free(box(l, c))) ?? p;
        const big = l.type === 'landmark' ? l.size * pxPerMeter(l.point) > 30 : l.size ? l.size * pxPerMeter(l.point) > 40 : areaVisible;
        l.el.hidden = !wanted || !p.visible || !big;
        if (l.el.hidden) continue;
        move(l.el, p.x, p.y, l.left ? 'calc(-100% - 8px), -50%' : '-50%, -50%');
        taken.push(box(l, p));
        continue;
      }
      const tiny = l.size * pxPerMeter(l.middle) < TINY_PX;
      const p = project(tiny ? l.middle : l.top);
      l.ring.hidden = !showNames || !tiny || !p.visible;
      if (!l.ring.hidden) move(l.ring, p.x, p.y, '-50%, -50%');
      l.el.hidden = l.leader.hidden = true;
      if (showNames && p.visible) refs.push({ l, anchorX: p.x, anchorY: tiny ? p.y - 12 : p.y, width: l.width });
    }
    // Object labels float above the objects; overlapping ones stack upward with a leader line.
    for (const it of layoutLabels(refs, { direction: -1, offset: 6, lineHeight: 22, gap: 6 })) {
      it.l.el.hidden = false;
      move(it.l.el, it.x, it.y, '-50%, -100%');
      if (it.shift) {
        it.l.leader.hidden = false;
        it.l.leader.style.height = `${it.anchorY - it.y}px`;
        move(it.l.leader, it.x, it.anchorY, '-50%, -100%');
      }
    }
  }

  // Names the grid squares at the middle of the view: measures how many pixels one grid unit
  // spans there along x and z, then picks the level the ground shader draws at that density.
  function updateLegend() {
    const unit = opts.system === 'imperial' ? FT : 1;
    const center = controls.target.clone().setY(0);
    const pxAlong = axis => {
      const a = tmp.copy(center).addScaledVector(axis, -unit / 2).project(camera);
      const [ax, ay] = [a.x, a.y];
      const b = tmp.copy(center).addScaledVector(axis, unit / 2).project(camera);
      return Math.hypot((b.x - ax) * vw, (b.y - ay) * vh) / 2;
    };
    const unitsPerPx = 1 / Math.max(Math.min(pxAlong(X_AXIS), pxAlong(Z_AXIS)), 1e-9);
    const { fine, coarse, fade } = gridLevels(unitsPerPx);
    const side = formatLength((fade > 0.2 ? fine : coarse) * unit, opts.system);
    legendScale.textContent = t('legend.square', { side });
  }

  // --- frame -----------------------------------------------------------------

  function render(now) {
    frame = 0;
    if (!model || !vw || !vh) return;
    if (tween) stepTween(now);
    controls.update(); // applies damping and spin, and asks for another frame while still moving
    if (controls.autoRotate) requestRender();

    // Clipping and fog follow the zoom so everything from a phone to a city reads well.
    const distance = camera.position.distanceTo(controls.target);
    const reach = Math.max(distance, fitted.radius);
    scene.fog.near = Math.max(distance * 2.2, fitted.radius * 3);
    scene.fog.far = Math.max(distance * 7, fitted.radius * 9);
    camera.near = Math.min(distance * 0.002, EYE_HEIGHT * 0.5);
    camera.far = scene.fog.far * 1.5 + reach;
    camera.updateProjectionMatrix();
    ground.place(controls.target, scene.fog.far * 3);
    stars.position.copy(camera.position);
    stars.scale.setScalar(camera.far * 0.9);

    renderer.render(scene, camera);
    updateLabels();
    updateLegend();
  }

  // --- input -----------------------------------------------------------------

  function onInteractionStart() {
    tween = null;
    preset = null;
    hint.hidden = true;
    if (controls.autoRotate) setSpin(false);
  }

  function onControlsChange() {
    if (fitted) controls.target.clamp(fitted.limits.min, fitted.limits.max);
    requestRender();
  }

  // Double-click glides toward the clicked spot on the ground.
  function onDoubleClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    if (!hit || !fitted) return;
    hit.clamp(fitted.limits.min, fitted.limits.max);
    const offset = tmp.subVectors(camera.position, controls.target);
    offset.setLength(Math.max(offset.length() / 2, controls.minDistance));
    preset = null;
    hint.hidden = true;
    animateTo({ target: hit, position: hit.clone().add(offset) }, 450);
  }

  function onKey(e) {
    if (e.key === '+' || e.key === '=') zoomBy(1.5);
    else if (e.key === '-' || e.key === '_') zoomBy(1 / 1.5);
    else if (e.key === '0') resetView();
    else if (e.key === '[') turnBy(Math.PI / 4);
    else if (e.key === ']') turnBy(-Math.PI / 4);
    else return;
    e.preventDefault();
  }

  function onToolClick(e) {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'in') zoomBy(1.6);
    else if (act === 'out') zoomBy(1 / 1.6);
    else if (act === 'fit') resetView();
  }

  function onDockClick(e) {
    const cam = e.target.closest('[data-cam]')?.dataset.cam;
    if (!cam || !fitted) return;
    hint.hidden = true;
    if (cam === 'spin') return setSpin(!controls.autoRotate);
    if (cam === 'left') return turnBy(Math.PI / 4);
    if (cam === 'right') return turnBy(-Math.PI / 4);
    setSpin(false);
    preset = cam;
    animateTo(PRESETS[cam](), cam === 'eye' ? 900 : 700);
  }

  function onResize() {
    vw = root.clientWidth;
    vh = root.clientHeight;
    if (!vw || !vh) return;
    renderer.setSize(vw, vh, false);
    camera.aspect = vw / vh;
    camera.updateProjectionMatrix();
    root.classList.toggle('narrow', vw < 560);
    // Keep the picked camera view framed as the stage changes size (e.g. full screen).
    if (model) {
      fitView();
      if (preset && !tween) jump(PRESETS[preset]());
    }
    requestRender();
  }

  // --- lifecycle -------------------------------------------------------------

  return {
    mount(container) {
      root = document.createElement('div');
      root.className = 'view-3d';
      root.innerHTML = `<div class="labels-3d" aria-hidden="true"></div>${toolsHTML}${cameraDockHTML}${legendHTML(
        coarsePointer() ? 'hint.3dTouch' : 'hint.3dMouse',
      )}`;
      translatePage(root);
      labelsEl = root.querySelector('.labels-3d');
      legendScale = root.querySelector('.legend-scale');
      hint = root.querySelector('.legend-hint');
      dock = root.querySelector('.camera-dock');
      container.append(root);

      // Throws without WebGL; the app then falls back to 2D.
      renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      const canvas = renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute('role', 'img');
      root.prepend(canvas);

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0xffffff, 1, 2);
      camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 1000);

      hemi = new THREE.HemisphereLight();
      sun = new THREE.DirectionalLight();
      sun.castShadow = true;
      const mapSize = coarsePointer() ? 1024 : 2048;
      sun.shadow.mapSize.set(mapSize, mapSize);
      sun.shadow.bias = -0.0004;
      scene.add(hemi, sun, sun.target);

      ground = createGround();
      stars = nightSky();
      scene.add(ground.mesh, stars);
      kit = createKit();
      materials.area = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.9 });
      materials.rim = new THREE.MeshStandardMaterial({ roughness: 0.6 });
      materials.walls = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, roughness: 0.9 });
      materials.hidden = new THREE.MeshBasicMaterial({ visible: false });
      materials.dims = new THREE.MeshBasicMaterial();
      materials.landmarkFill = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide });
      materials.landmarkLine = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      materials.landmarkMarks = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7, side: THREE.DoubleSide });

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.screenSpacePanning = false;           // drag along the ground, like a map
      controls.maxPolarAngle = Math.PI / 2 - 0.002;  // down to eye level, never below the ground
      controls.zoomToCursor = true;
      controls.autoRotateSpeed = 1.2;
      controls.listenToKeyEvents(canvas);            // arrow keys pan
      controls.addEventListener('start', onInteractionStart);
      controls.addEventListener('change', onControlsChange);
      canvas.addEventListener('dblclick', onDoubleClick);
      canvas.addEventListener('keydown', onKey);
      root.querySelector('.stage-tools').addEventListener('click', onToolClick);
      dock.addEventListener('click', onDockClick);

      resizeObserver = new ResizeObserver(onResize);
      resizeObserver.observe(root);
      onResize();
    },

    update(nextModel, nextOpts = {}) {
      model = nextModel;
      opts = { ...opts, ...nextOpts };
      const reframe = nextOpts.reframe !== false || !fitted;
      kit.setNight(opts.night);
      rebuildContent();
      fitView();
      placeSun();
      applyColors();
      applySettings();
      const { shape } = model;
      ground.setGrid(-shape.width / 2, -shape.depth / 2, opts.system === 'imperial' ? FT : 1);
      buildLabels();
      renderer.domElement.setAttribute('aria-label', t('aria.3d', { area: opts.areaLabel }) +
        (model.height ? t('aria.high', { d: formatLength(model.height, opts.system) }) : '') +
        (model.references.length ? t('aria.nextTo', { list: model.references.map(r => r.name).join(', ') }) : ''));

      // Something new to show starts framed (the very first one glides in); a setting or theme
      // change keeps the camera where the visitor put it.
      if (reframe) {
        preset = 'angle';
        setSpin(false);
        if (!introDone && !reducedMotion()) {
          jump(viewAt(fitted.distance * 1.8, elevationFor(camera.aspect) + 0.4, AZIMUTH - 0.7));
          animateTo(viewAt(fitted.distance), 1400);
        } else {
          jump(viewAt(fitted.distance));
        }
        introDone = true;
      }
      requestRender();
    },

    unmount() {
      cancelAnimationFrame(frame);
      frame = 0;
      tween = null;
      resizeObserver?.disconnect();
      controls?.dispose();
      if (scene) disposeContent();
      ground?.dispose();
      kit?.dispose();
      Object.values(materials).forEach(m => m.dispose());
      Object.values(skies).forEach(t => t.dispose());
      stars?.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
      renderer?.dispose();
      renderer?.forceContextLoss();
      root?.remove();
      renderer = root = null;
    },
  };
}
