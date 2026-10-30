import * as THREE from 'three';

// The sky: a dome drawn by a small shader, so it stays crisp at any screen size. By day a blue
// gradient, a glow toward the sun and soft clouds; by night a deep blue with the Milky Way (the
// stars and the moon are separate, see nightSky). Rendered once into a small cube, the same sky
// becomes the soft light the scene gets from it (see view3d's applyColors).

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;  // the fog colour, so the ground fades into the sky without a seam
uniform vec3 uSun;
uniform float uNight;
varying vec3 vDir;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Layered noise: big soft shapes with finer and finer detail on top.
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.31;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  // Below the horizon: plain haze behind the ground, with nothing to work out. That's most of the
  // screen from the usual camera angles, so the clouds and stars are only computed where they show.
  vec3 col = uHorizon;
  float h = d.y;
  float aboveHorizon = smoothstep(0.0, 0.04, h);
  if (h > 0.0 && uNight < 0.5) {
    col = mix(uHorizon, uTop, pow(h, 0.5));
    // Brighter toward the sun: a broad glow, and a warm haze low on the sun's side of the sky.
    float s = max(dot(d, uSun), 0.0);
    float side = max(dot(normalize(d.xz + 1e-5), normalize(uSun.xz)), 0.0);
    col += vec3(1.0, 0.92, 0.78) * (0.25 * pow(s, 8.0) + 0.12 * pow(side, 3.0) * exp(-h * 6.0)) * aboveHorizon;
    // Clouds on a flat layer high up, so perspective makes them smaller toward the horizon. Each
    // is lit on the side facing the sun (where it thins out toward the sun) and shaded below.
    vec2 uv = d.xz / (h + 0.1) * 1.3;
    float n = fbm(uv);
    float toward = fbm(uv + uSun.xz * 0.3);
    float density = smoothstep(0.52, 0.72, n) * smoothstep(0.015, 0.2, h);
    float lit = clamp(0.6 + (n - toward) * 5.0, 0.0, 1.0);
    vec3 cloud = mix(vec3(0.5, 0.56, 0.68), vec3(1.0), lit);
    cloud = mix(uHorizon, cloud, smoothstep(0.0, 0.25, h)); // far clouds fade into the haze
    col = mix(col, cloud, density * 0.95);
  } else if (h > 0.0) {
    col = mix(uHorizon, uTop, pow(h, 0.6));
    // The Milky Way: a band of mottled light rising from the horizon just ahead, leaning as it
    // climbs, with dark dust lanes along it, a warmer core and countless faint stars crowding it.
    vec2 uv = d.xz / (1.0 + h);
    float across = dot(d, normalize(vec3(0.95, 0.25, 0.2)));
    float band = exp(-across * across / 0.02);
    float rise = smoothstep(0.0, 0.12, h);
    float light = band * (0.25 + 1.3 * fbm(uv * 5.0 + 2.0));
    float dust = band * smoothstep(0.5, 0.7, fbm(uv * 9.0 + 11.0));
    vec3 tint = mix(vec3(0.6, 0.68, 1.0), vec3(1.0, 0.9, 0.78), band * band);
    col += tint * max(light - dust * 0.9, 0.0) * 0.08 * rise;
    vec2 grid = uv * 320.0;
    float pick = hash(floor(grid));
    float speck = smoothstep(0.32, 0.0, length(fract(grid) - 0.5)) * max(pick - 0.93, 0.0) / 0.07;
    col += vec3(0.9, 0.93, 1.0) * speck * band * (1.0 - dust) * 0.4 * rise;
    // A faint glow along the horizon.
    col += vec3(0.025, 0.03, 0.06) * exp(-h * 12.0) * aboveHorizon;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function createSky() {
  const uniforms = {
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uNight: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, side: THREE.BackSide, depthWrite: false, depthTest: false,
  });
  const geometry = new THREE.SphereGeometry(1, 64, 32);
  // Travels with the camera just inside the far plane (view3d's render), drawn before everything.
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  // The same sky in a scene of its own, for working out the light it casts.
  const lighting = new THREE.Scene();
  const inside = new THREE.Mesh(geometry, material);
  inside.scale.setScalar(50);
  lighting.add(inside);
  return {
    dome,
    lighting,
    set({ top, horizon, sun, night }) {
      uniforms.uTop.value.set(top);
      uniforms.uHorizon.value.set(horizon);
      uniforms.uSun.value.copy(sun);
      uniforms.uNight.value = night ? 1 : 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

const seeded = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const MOON = new THREE.Vector3(0.45, 0.24, -0.86).normalize(); // low in the sky ahead of the default camera
const MOON_SIZE = 0.045; // the disc's width, as a share of the sky dome's radius

// The moon: NASA's Lunar Reconnaissance Orbiter photo of its near side (public domain, credited in
// the footer; assets/moon.webp is that photo cropped, brightened and cut to a circle), in a soft glow.
function moon() {
  const size = 256, R = size * MOON_SIZE / 0.16 / 2; // the glow sprite is 0.16 wide
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const halo = g.createRadialGradient(size / 2, size / 2, R * 0.9, size / 2, size / 2, size / 2);
  for (const [at, alpha] of [[0, 0.5], [0.05, 0.26], [0.15, 0.12], [0.4, 0.04], [1, 0]]) halo.addColorStop(at, `rgba(200, 212, 255, ${alpha})`);
  g.fillStyle = halo;
  g.fillRect(0, 0, size, size);
  const sprite = map => {
    map.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map, fog: false, depthWrite: false, transparent: true }));
  };
  const glow = sprite(new THREE.CanvasTexture(canvas));
  glow.position.copy(MOON);
  glow.scale.setScalar(0.16);
  const disc = sprite(new THREE.TextureLoader().load('assets/moon.webp'));
  disc.position.copy(MOON).multiplyScalar(0.999); // a hair nearer, so it's drawn over its glow
  disc.scale.setScalar(MOON_SIZE);
  return new THREE.Group().add(glow, disc);
}

// Night sky objects: crisp pixel-sized stars and the moon, on a dome that travels with the camera
// just inside the far plane, so the ground hides whatever is below the horizon.
export function nightSky() {
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
    points.renderOrder = -1; // drawn before the moon, so it hides the stars behind it
    return points;
  };
  const sky = new THREE.Group();
  sky.add(layer(1100, 1, 0.65), layer(220, 1.6, 0.85), layer(40, 2.4, 1), moon());
  return sky;
}
