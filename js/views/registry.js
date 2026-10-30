// Every view module exports `createView()` → { mount(el), update(scene, opts), unmount() }.
// Views load lazily, so heavy dependencies (three.js) are only fetched when chosen.
// `layout` tells buildScene where to stand the reference objects for this view.
// `isSupported` (optional) hides a view on devices that can't run it.
export const VIEWS = [
  { id: '2d', label: '2D', layout: 'front', load: () => import('./view2d.js') },
  {
    id: '3d', label: '3D', layout: 'side', load: () => import('./view3d.js'),
    isSupported: () => 'WebGLRenderingContext' in globalThis,
  },
  // { id: 'map', label: 'Map', layout: 'front', load: () => import('./viewMap.js') },
  // { id: 'ar',  label: 'AR',  layout: 'side', load: () => import('./viewAR.js'), isSupported: () => 'xr' in navigator },
];

export const availableViews = () => VIEWS.filter(v => !v.isSupported || v.isSupported());

export const getView = id => VIEWS.find(v => v.id === id) ?? VIEWS[0];
