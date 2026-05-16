import { useMemo } from "react";
import { type Wire } from "@/lib/wires";

interface BoardItem {
  type: string;
  x: number;
  y: number;
}

interface Minimap2DProps {
  items: BoardItem[];
  wires: Wire[];
  pcbWidthMm: number;
  pcbHeightMm: number;
  onExport?: () => void;
}

// Component color palette (matches what's used elsewhere in the app)
const COMPONENT_COLORS: Record<string, string> = {
  Resistor: "#f59e0b",
  Capacitor: "#10b981",
  Diode: "#a78bfa",
  LED: "#fbbf24",
  Transistor: "#ef4444",
  IC: "#3b82f6",
  Connector: "#ec4899",
};

const WIDTH = 220;
const HEIGHT = 150;
const PAD = 12;

/**
 * Top-down minimap of the PCB workspace. Components are auto-fit to the
 * minimap rectangle; the live PCB area is shown faintly behind. Wires are
 * rendered as straight lines between component centers (Manhattan routing
 * is a future enhancement).
 */
export default function Minimap2D({ items, wires, pcbWidthMm, pcbHeightMm, onExport }: Minimap2DProps) {
  // Auto-fit bounds: use item extents if any, otherwise a default ±5 box.
  const { minX, maxX, minY, maxY } = useMemo(() => {
    if (items.length === 0) return { minX: -5, maxX: 5, minY: -5, maxY: 5 };
    const xs = items.map((i) => i.x);
    const ys = items.map((i) => i.y);
    const lo = (vals: number[]) => Math.min(...vals);
    const hi = (vals: number[]) => Math.max(...vals);
    // Pad a little so components aren't right on the edge
    const px = Math.max(0.5, (hi(xs) - lo(xs)) * 0.15);
    const py = Math.max(0.5, (hi(ys) - lo(ys)) * 0.15);
    return {
      minX: lo(xs) - px, maxX: hi(xs) + px,
      minY: lo(ys) - py, maxY: hi(ys) + py,
    };
  }, [items]);

  const rangeX = Math.max(0.0001, maxX - minX);
  const rangeY = Math.max(0.0001, maxY - minY);

  const xToPx = (x: number) => PAD + ((x - minX) / rangeX) * (WIDTH - 2 * PAD);
  // Flip Y so positive Y goes "up" in the visual (more natural for PCBs)
  const yToPx = (y: number) => HEIGHT - PAD - ((y - minY) / rangeY) * (HEIGHT - 2 * PAD);

  return (
    <div className="absolute bottom-3 right-3 z-30 bg-black/85 border border-primary/30 rounded-lg p-2 shadow-2xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[9px] font-bold uppercase tracking-widest text-primary">
          2D View · {pcbWidthMm}×{pcbHeightMm}mm
        </span>
        {onExport && (
          <button
            type="button"
            onClick={onExport}
            disabled={items.length === 0}
            title={items.length === 0 ? "Place components first" : "Export SCARA placement job"}
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary hover:bg-primary/30 border border-primary/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ⤴ Robot
          </button>
        )}
      </div>

      <svg width={WIDTH} height={HEIGHT} className="rounded" style={{ background: "#0d4f25" }}>
        {/* PCB area outline */}
        <rect
          x={PAD} y={PAD}
          width={WIDTH - 2 * PAD} height={HEIGHT - 2 * PAD}
          fill="none" stroke="#1a8a4a" strokeWidth="1" strokeDasharray="2,2"
        />

        {/* Faint grid */}
        {[0.25, 0.5, 0.75].map((t, i) => (
          <g key={i} opacity="0.25">
            <line
              x1={PAD + t * (WIDTH - 2 * PAD)} y1={PAD}
              x2={PAD + t * (WIDTH - 2 * PAD)} y2={HEIGHT - PAD}
              stroke="#1a8a4a" strokeWidth="0.5"
            />
            <line
              x1={PAD} y1={PAD + t * (HEIGHT - 2 * PAD)}
              x2={WIDTH - PAD} y2={PAD + t * (HEIGHT - 2 * PAD)}
              stroke="#1a8a4a" strokeWidth="0.5"
            />
          </g>
        ))}

        {/* Wires (drawn first so components sit on top) */}
        {wires.map((w) => {
          const from = items[w.fromComponent];
          const to = items[w.toComponent];
          if (!from || !to) return null;
          return (
            <line
              key={w.id}
              x1={xToPx(from.x)} y1={yToPx(from.y)}
              x2={xToPx(to.x)} y2={yToPx(to.y)}
              stroke="#fbbf24" strokeWidth="1.2" opacity="0.75"
            />
          );
        })}

        {/* Components */}
        {items.map((item, i) => {
          const color = COMPONENT_COLORS[item.type] ?? "#888";
          const cx = xToPx(item.x);
          const cy = yToPx(item.y);
          return (
            <g key={i}>
              <rect
                x={cx - 5} y={cy - 5}
                width="10" height="10" rx="1.5"
                fill={color} stroke="#000" strokeWidth="0.7"
              />
              <text
                x={cx} y={cy + 2.5}
                textAnchor="middle"
                fontSize="7" fontWeight="900" fill="#000"
              >
                {item.type[0]}
              </text>
            </g>
          );
        })}

        {/* Empty state */}
        {items.length === 0 && (
          <text
            x={WIDTH / 2} y={HEIGHT / 2}
            textAnchor="middle" fontSize="10" fill="#1a8a4a" opacity="0.7"
          >
            place components to see map
          </text>
        )}
      </svg>

      {/* Footer stats */}
      <div className="flex justify-between mt-1 text-[9px] font-mono text-white/40">
        <span>{items.length} parts</span>
        <span>{wires.length} nets</span>
      </div>
    </div>
  );
}
