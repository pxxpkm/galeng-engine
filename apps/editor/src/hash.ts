export function hashRgb(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const r = 40 + (h & 255) % 180;
  const g = 40 + ((h >>> 8) & 255) % 180;
  const b = 40 + ((h >>> 16) & 255) % 180;
  return `rgb(${r}, ${g}, ${b})`;
}
