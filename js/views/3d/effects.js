import * as THREE from 'three';

// Finishing touches for the 3D view's area, and the easings of its opening animation. The glow is
// a few lines of shader maths on one flat plane, so phones draw it as easily as the rest.

// The area's glow: brightest along its edge, fading inward over `inner` and outward over the
// ground over `outer`. Worked out per pixel from the distance to the outline (rectangle or circle).
const GLOW_GLSL = /* glsl */ `
uniform vec2 uHalf;     // half width and depth of a rectangle
uniform float uRadius;  // > 0 for a circle
uniform float uInner;
uniform float uOuter;
uniform vec2 uAlpha;    // strength inside, outside
varying vec2 vLocal;

float edgeDistance(vec2 p) { // signed: negative inside
  if (uRadius > 0.0) return length(p) - uRadius;
  vec2 q = abs(p) - uHalf;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float glowAlpha(vec2 p) {
  float d = edgeDistance(p);
  float k = d < 0.0 ? 1.0 - smoothstep(0.0, uInner, -d) : 1.0 - smoothstep(0.0, uOuter, d);
  return (d < 0.0 ? uAlpha.x : uAlpha.y) * k * k;
}
`;

export function areaGlowMaterial() {
  const uniforms = {
    uHalf: { value: new THREE.Vector2(1, 1) },
    uRadius: { value: 0 },
    uInner: { value: 1 },
    uOuter: { value: 1 },
    uAlpha: { value: new THREE.Vector2() },
  };
  const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position.xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLOW_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= glowAlpha(vLocal);');
  };
  material.userData.uniforms = uniforms;
  return material;
}

// A ground-level plane for the glow around `shape`, sized to reach `outer` beyond its edge.
// (The glow material is shared, so its shape uniforms are set here too.)
export function areaGlow(shape, material, inner, outer) {
  const u = material.userData.uniforms;
  u.uHalf.value.set(shape.width / 2, shape.depth / 2);
  u.uRadius.value = shape.type === 'circle' ? shape.radius : 0;
  u.uInner.value = inner;
  u.uOuter.value = outer;
  return new THREE.Mesh(new THREE.PlaneGeometry(shape.width + 2 * outer, shape.depth + 2 * outer).rotateX(-Math.PI / 2), material);
}

// Bouncy ease for things popping up: overshoots a touch, then settles.
export const easeOutBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;
export const easeOutCubic = t => 1 - (1 - t) ** 3;
