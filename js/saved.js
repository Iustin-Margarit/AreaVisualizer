// The areas a visitor has saved ("My areas"), kept in this browser only. An area is its link's
// query string, so it comes back exactly as it was. Storage can be unavailable, so every access is guarded.
const KEY = 'areavisualizer:areas';
export const MAX_SAVED = 50;

const isArea = a => !!a && typeof a.id === 'string' && typeof a.name === 'string' && typeof a.size === 'string' &&
  typeof a.query === 'string' && a.query.startsWith('?') && Number.isFinite(a.at) &&
  typeof a.thumb === 'string' && /^[MLAZ0-9 .-]*$/.test(a.thumb);

export function loadSaved(storage) {
  try {
    const list = JSON.parse((storage ?? localStorage).getItem(KEY));
    return Array.isArray(list) ? list.filter(isArea).slice(0, MAX_SAVED) : [];
  } catch {
    return [];
  }
}

export function storeSaved(list, storage) {
  try {
    (storage ?? localStorage).setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// Looking at the same area from 2D or 3D doesn't make it a different area.
const withoutView = query => {
  const params = new URLSearchParams(query);
  params.delete('v');
  return params.toString();
};
export const sameArea = (a, b) => withoutView(a) === withoutView(b);
