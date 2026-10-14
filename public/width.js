// Shelf width: the default, and the clamp a drag or a stored value goes through.
export const DEFAULT_WIDTH = 420;
export const MIN_WIDTH = 240;
// The shelf never takes more than this share of the space it docks over, so the preview keeps room.
export const MAX_SHARE = 0.6;

export function clampWidth(value, space) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_WIDTH;
  const max = space > 0 ? Math.max(MIN_WIDTH, Math.floor(space * MAX_SHARE)) : Infinity;
  return Math.round(Math.min(Math.max(n, MIN_WIDTH), max));
}

// The width a drag gives: each handle sits on its panel's inner edge, so dragging away from the docked side widens it.
export function dragWidth(startWidth, startX, x, side) {
  return startWidth + (side === 'right' ? startX - x : x - startX);
}

// Preview width: the floor a drag or a stored value keeps it above.
export const MIN_PREVIEW_WIDTH = 280;

// A stored preview width, clamped so the shelf and preview together fit the space. Null keeps the CSS default.
export function clampPreviewWidth(value, space, shelfWidth) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n <= 0) return null;
  const max = space > 0 ? Math.max(MIN_PREVIEW_WIDTH, space - shelfWidth) : Infinity;
  return Math.round(Math.min(Math.max(n, MIN_PREVIEW_WIDTH), max));
}
