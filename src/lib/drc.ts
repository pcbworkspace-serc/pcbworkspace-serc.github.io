// Design Rule Check engine.
// Catches:
//   1. Two components physically overlapping
//   2. A component extending past the PCB edges

export type DRCViolation =
  | { type: "overlap"; a: number; b: number; message: string }
  | { type: "out_of_bounds"; index: number; message: string };

// Rough footprint in mm (width × height) at rotation = 0
const FOOTPRINTS: Record<string, [number, number]> = {
  Resistor:   [8, 4],
  Capacitor:  [4, 4],
  Diode:      [6, 3],
  LED:        [4, 4],
  Transistor: [4, 3],
};
const DEFAULT_FOOTPRINT: [number, number] = [5, 5];

export interface DRCMmItem {
  type: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
}

interface AABB { left: number; right: number; bottom: number; top: number }

export function getFootprint(item: DRCMmItem): { w: number; h: number } {
  const [bw, bh] = FOOTPRINTS[item.type] ?? DEFAULT_FOOTPRINT;
  const rotated = Math.abs(item.rotation_deg % 180) === 90;
  return rotated ? { w: bh, h: bw } : { w: bw, h: bh };
}

function getAABB(item: DRCMmItem): AABB {
  const { w, h } = getFootprint(item);
  return {
    left:   item.x_mm - w / 2,
    right:  item.x_mm + w / 2,
    bottom: item.y_mm - h / 2,
    top:    item.y_mm + h / 2,
  };
}

function aabbOverlap(a: AABB, b: AABB): boolean {
  return !(a.right < b.left || b.right < a.left || a.top < b.bottom || b.top < a.bottom);
}

export function runDRC(
  items: DRCMmItem[],
  pcbWidthMm: number,
  pcbHeightMm: number,
): DRCViolation[] {
  const violations: DRCViolation[] = [];
  const boxes = items.map(getAABB);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (aabbOverlap(boxes[i], boxes[j])) {
        violations.push({
          type: "overlap",
          a: i, b: j,
          message: `${items[i].type} and ${items[j].type} overlap`,
        });
      }
    }
  }

  items.forEach((item, idx) => {
    const aabb = boxes[idx];
    if (aabb.left < 0 || aabb.right > pcbWidthMm || aabb.bottom < 0 || aabb.top > pcbHeightMm) {
      violations.push({
        type: "out_of_bounds",
        index: idx,
        message: `${item.type} extends past the PCB edge`,
      });
    }
  });

  return violations;
}

export function getViolatingIndices(violations: DRCViolation[]): Set<number> {
  const indices = new Set<number>();
  for (const v of violations) {
    if (v.type === "overlap") { indices.add(v.a); indices.add(v.b); }
    else                      { indices.add(v.index); }
  }
  return indices;
}
