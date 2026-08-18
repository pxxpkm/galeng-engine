export function mediaUrl(logical: string): string {
  const parts = logical.split("/").filter(Boolean).map(encodeURIComponent);
  return `/api/media/${parts.join("/")}`;
}

export function charLogical(id: string, face: string): string {
  return `char/${id}/${face}`;
}

export function fitBottomCenter(
  srcW: number,
  srcH: number,
  slotX: number,
  slotY: number,
  slotW: number,
  slotH: number,
): { x: number; y: number; w: number; h: number } {
  if (srcW <= 0 || srcH <= 0 || slotW <= 0 || slotH <= 0) {
    return { x: slotX, y: slotY, w: 0, h: 0 };
  }
  const scale = Math.min(slotW / srcW, slotH / srcH);
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));
  return {
    x: slotX + (slotW - w) / 2,
    y: slotY + slotH - h,
    w,
    h,
  };
}
