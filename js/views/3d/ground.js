import * as THREE from 'three';
import { MIN_CELL_PX } from './math.js';

// Grid lines at every power of ten of the grid unit (1 m or 1 ft), anchored at the area's corner.
// Each pixel draws the finest level whose cells are still at least uMinCellPx wide — fading it out
// as it gets denser — plus the next level up. Zooming never makes lines pop, and the far-away
// ground automatically switches to coarser lines instead of turning into moiré.
const GRID_GLSL = /* glsl */ `
uniform vec2 uGridOrigin;
uniform float uGridUnit;
uniform vec3 uGridColor;
uniform float uMinCellPx;
uniform float uGridStrength;
varying vec2 vGridPos;

// Coverage (0–1) of anti-aliased lines \`width\` px wide every \`cell\` grid units; fw = grid units per pixel.
float gridLines(vec2 p, vec2 fw, float cell, float width) {
  vec2 px = abs(fract(p / cell + 0.5) - 0.5) * cell / fw;
  return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, min(px.x, px.y));
}

float gridAlpha(vec2 worldXZ) {
  vec2 p = (worldXZ - uGridOrigin) / uGridUnit;
  vec2 fw = max(fwidth(p), vec2(1e-7));
  float lod = log2(max(fw.x, fw.y) * uMinCellPx) * 0.30103; // log10 of the smallest readable cell
  float level = ceil(lod);
  float fine = pow(10.0, level);
  float f = level - lod;  // 1 → fine cells are 10× the minimum size, 0 → they hit the minimum
  // Fine lines stay solid until they get dense, then fade; near f = 1 they thicken to match the
  // coarse lines they are about to become, so switching levels is seamless.
  float fineWidth = mix(1.0, 1.7, smoothstep(0.75, 1.0, f));
  return max(gridLines(p, fw, fine, fineWidth) * smoothstep(0.0, 0.45, f), gridLines(p, fw, fine * 10.0, 1.7));
}
`;

export function createGround() {
  const uniforms = {
    uGridOrigin: { value: new THREE.Vector2() },
    uGridUnit: { value: 1 },
    uGridColor: { value: new THREE.Color() },
    uMinCellPx: { value: MIN_CELL_PX },
    uGridStrength: { value: 0.8 },
  };

  // A standard material (so the ground takes light and shadows) with the grid mixed into its colour.
  const material = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGridPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGridPos = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GRID_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uGridColor, uGridStrength * gridAlpha(vGridPos));');
  };

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material);
  mesh.receiveShadow = true;

  return {
    mesh,
    setGrid(originX, originZ, unitMeters) {
      uniforms.uGridOrigin.value.set(originX, originZ);
      uniforms.uGridUnit.value = unitMeters;
    },
    setGridStrength(strength) {
      uniforms.uGridStrength.value = strength;
    },
    setColors(ground, line) {
      material.color.set(ground);
      uniforms.uGridColor.value.set(line);
    },
    // The plane follows the camera's look-at point and only needs to reach the fogged-out horizon.
    place(center, size) {
      mesh.position.set(center.x, 0, center.z);
      mesh.scale.set(size, 1, size);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
