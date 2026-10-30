import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

// Downloaded models (see data/models.js and tools/models.mjs). Each file loads once; every use
// is a cheap copy that shares geometry and materials with it.

const loader = new GLTFLoader();
const templates = new Map(); // file → Promise<{ root, box }>

// The model as loaded: rigged ones frozen in their idle pose (nothing animates), turned so the
// length runs along +x, and measured.
export function loadModel(spec) {
  if (!templates.has(spec.file)) {
    templates.set(spec.file, loader.loadAsync(spec.file).then(gltf => {
      const [idle] = gltf.animations;
      if (idle) {
        const mixer = new THREE.AnimationMixer(gltf.scene);
        mixer.clipAction(idle).play();
        mixer.update(0.3);
      }
      const laid = new THREE.Group();
      laid.rotation.x = spec.lay ? -Math.PI / 2 : 0;
      laid.add(gltf.scene);
      const root = new THREE.Group();
      root.rotation.y = THREE.MathUtils.degToRad(spec.turn ?? 0);
      root.add(laid);
      root.traverse(o => {
        if (!o.isMesh) return;
        // Several models are marked 40% metal. Metal shows its colour through reflections and
        // the scene has none, so it only made them darker; none of them are really metal.
        o.material.metalness = 0;
        const glow = spec.glow?.[o.material.name];
        if (glow) o.material.userData.glow = new THREE.Color(glow);
        if (o.isSkinnedMesh) o.frustumCulled = false; // its bounds are the unposed rest pose
      });
      root.updateMatrixWorld(true);
      return { root, box: new THREE.Box3().setFromObject(root, true) };
    }));
  }
  return templates.get(spec.file);
}

// A copy of a loaded model scaled evenly so its `fit` measurement matches the object (height
// `h` or length `w`), standing on y = 0 and centered. Parts listed as `glow` light up at night.
export function placeModel({ root, box }, spec, ref, night) {
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = spec.fit === 'h' ? ref.h / size.y : ref.w / size.x;
  const copy = cloneSkinned(root);
  copy.scale.multiplyScalar(s);
  copy.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  copy.traverse(o => {
    o.userData.shared = true; // geometry and materials belong to the loaded model
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    const glow = o.material.userData.glow;
    if (glow) o.material.emissive.copy(night ? glow : new THREE.Color(0));
  });
  return copy;
}
