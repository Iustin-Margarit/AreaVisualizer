// Main colour per reference kind, shared by the 2D silhouettes and the 3D models.
export const KIND_COLORS = {
  box: '#f59e0b',
  phone: '#3b4250',
  chair: '#9a6a3f',
  person: '#e8833a',
  dog: '#b07a45',
  car: '#d94848',
  tree: '#3f9b4f',
  bus: '#e3b505',
  house: '#b5523b',
  building: '#8a94a6',
  plane: '#a7b0bf',
  stadium: '#8a94a6',
  tower: '#8b6f4e',
  coin: '#c9a227',
  ship: '#2f5d8a',
  spire: '#9fb3c8',
  bridge: '#c0362c',
  mountain: '#6b7f99',
  moon: '#a9a9a3',
};

export const kindColor = kind => KIND_COLORS[kind] ?? KIND_COLORS.box;
