// Copies the parts of three.js the 3D view uses from node_modules into vendor/three/, so the site
// serves its own copy instead of loading it from a CDN (no third party sees who visits).
//
//   npm install && node tools/vendor.mjs
//
// The version is the one pinned in package.json; index.html's import map points at these files.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const FILES = [
  'LICENSE',
  'build/three.module.min.js',
  'examples/jsm/controls/OrbitControls.js',
  'examples/jsm/loaders/GLTFLoader.js',
  'examples/jsm/utils/BufferGeometryUtils.js', // used by GLTFLoader
  'examples/jsm/utils/SkeletonUtils.js',
];

const from = new URL('../node_modules/three/', import.meta.url);
const to = new URL('../vendor/three/', import.meta.url);
const { version } = JSON.parse(await readFile(new URL('package.json', from), 'utf8'));
for (const file of FILES) {
  const target = new URL(file, to);
  await mkdir(dirname(target.pathname.replace(/^\/(\w:)/, '$1')), { recursive: true });
  await copyFile(new URL(file, from), target);
}
console.log(`three.js ${version}: copied ${FILES.length} files to vendor/three/`);
