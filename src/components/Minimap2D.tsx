import { useState, useRef } from "react";
import { type Wire } from "@/lib/wires";

interface MapItem {
  type: string;
  x_mm: number;
  y_mm: number;
  rotation_deg: number;
}

interface Minimap2DProps {
  items: MapItem[];
  wires: Wire[];
  pcbWidthMm: number;
  pcbHeightMm: number;
  onExport?: () => void;
  onRotate?: (index: number) => void;
  onDelete?: (index: number) => void;
}

type Unit = "mm" | "in" | "mil";

const COMPONENT_COLORS: Record<string, string> = {
  Resistor: "#f59e0b",
  Capacitor: "#10b981",
  Diode: "#a78bfa",
  LED: "#fbbf24",
  Transistor: "#ef4444",
  IC: "#3b82f6",
  Connector: "#ec4899",
};

const W = 360;
const H = 280;
const TITLE_H = 28;
const TOP_RULER_H = 18;
const INFO_H = 28;
const LEFT_RULER_W = 28;
const RIGHT_PAD = 8;
const BOTTOM_PAD = 4;
const CANVAS_X = LEFT_RULER_W;
const CANVAS_Y = TITLE_H + TOP_RULER_H;
const CANVAS_W = W - LEFT_RULER_W - RIGHT_PAD;
const CANVAS_H = H - TITLE_H - TOP_RULER_H - INFO_H - BOTTOM_PAD;

const MM_PER_IN = 25.4;
const MM_PER_MIL = 0.0254;

function makeComponentIds(items: MapItem[]): string[] {
  const counters: Record<string, number> = {};
  return items.map((item) => {
    counters[item.type] = (counters[item.type] || 0) + 1;
    return `${item.type[0] ?? "X"}${counters[item.type]}`;
  });
}

function formatCoord(mm: number, unit: Unit): string {
  if (unit === "in") return (mm / MM_PER_IN).toFixed(3);
  if (unit === "mil") return (mm / MM_PER_MIL).toFixed(0);
  return mm.toFixed(2);
}

export default function Minimap2D({
  items, wires, pcbWidthMm, pcbHeightMm, onExport, onRotate, onDelete,
}: Minimap2DProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [unit, setUnit] = useState<Unit>("mm");
  const [cursor, setCursor] = useState<{ x_mm: number; y_mm: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const cycleUnit = () => setUnit((u) => (u === "mm" ? "in" : u === "in" ? "mil" : "mm"));

  // Collapsed state
  if (collapsed) {
    return (
      <div
        className="absolute bottom-3 right-3 z-30 bg-black/85 border border-primary/30 rounded-lg shadow-2xl backdrop-blur-sm flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-black/95 transition-colors"
        onClick={() => setCollapsed(false)}
        title="Expand 2D Board view"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="3" y1="9" x2="21" y2="9" />
        </svg>
        <span className="text-[10px] font-black uppercase tracking-widest text-primary">2D Board</span>
        <span className="text-[9px] text-primary/60">▲</span>
      </div>
    );
  }

  // PCB aspect-fit inside the canvas area
  const pcbAspect = pcbWidthMm / pcbHeightMm;
  const canvasAspect = CANVAS_W / CANVAS_H;
  let pcbPxW: number, pcbPxH: number;
  if (pcbAspect > canvasAspect) {
    pcbPxW = CANVAS_W;
    pcbPxH = CANVAS_W / pcbAspect;
  } else {
    pcbPxH = CANVAS_H;
    pcbPxW = CANVAS_H * pcbAspect;
  }
  const pcbX = CANVAS_X + (CANVAS_W - pcbPxW) / 2;
  const pcbY = CANVAS_Y + (CANVAS_H - pcbPxH) / 2;

  const xToPx = (mm: number) => pcbX + (mm / pcbWidthMm) * pcbPxW;
  const yToPx = (mm: number) => pcbY + pcbPxH - (mm / pcbHeightMm) * pcbPxH;

  const pxToMm = (px: number, py: number) => {
    const xMm = ((px - pcbX) / pcbPxW) * pcbWidthMm;
    const yMm = ((pcbY + pcbPxH - py) / pcbPxH) * pcbHeightMm;
    if (xMm < 0 || xMm > pcbWidthMm || yMm < 0 || yMm > pcbHeightMm) return null;
    return { x_mm: xMm, y_mm: yMm };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    setCursor(pxToMm(e.clientX - rect.left, e.clientY - rect.top));
  };

  // Tick lists
  const xMajor: number[] = [];
  for (let mm = 0; mm <= pcbWidthMm; mm += 10) xMajor.push(mm);
  const xMinor: number[] = [];
  for (let mm = 0; mm <= pcbWidthMm; mm += 5) if (mm % 10 !== 0) xMinor.push(mm);
  const yMajor: number[] = [];
  for (let mm = 0; mm <= pcbHeightMm; mm += 10) yMajor.push(mm);
  const yMinor: number[] = [];
  for (let mm = 0; mm <= pcbHeightMm; mm += 5) if (mm % 10 !== 0) yMinor.push(mm);

  const ids = makeComponentIds(items);
  const sel = selected != null ? items[selected] : null;
  const selId = selected != null ? ids[selected] : null;
  const snapped = cursor ? { x_mm: Math.round(cursor.x_mm), y_mm: Math.round(cursor.y_mm) } : null;

  return (
    <div
      className="absolute bottom-3 right-3 z-30 bg-black/90 border border-primary/30 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden"
      style={{ width: W, height: H }}
    >
      <svg
        ref={svgRef}
        width={W} height={H}
        onClick={() => setSelected(null)}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setCursor(null)}
        style={{ display: "block" }}
      >
        {/* Title bar */}
        <rect x={0} y={0} width={W} height={TITLE_H} fill="rgba(0,212,255,0.08)" />
        <text x={8} y={18} fontSize="10" fontWeight="900" fill="#00d4ff" letterSpacing="0.5">
          2D BOARD · {pcbWidthMm}×{pcbHeightMm}MM
        </text>

        {/* Unit toggle */}
        <g onClick={(e) => { e.stopPropagation(); cycleUnit(); }} style={{ cursor: "pointer" }}>
          <rect x={W - 168} y={6} width={32} height={16} rx={3}
                fill="rgba(255,255,255,0.08)" stroke="#00d4ff" strokeWidth="0.7" />
          <text x={W - 152} y={18} fontSize="9" fontWeight="900" fill="#00d4ff" textAnchor="middle">
            {unit.toUpperCase()}
          </text>
        </g>

        {/* Robot export */}
        {onExport && (
          <g
            onClick={(e) => { e.stopPropagation(); if (items.length > 0) onExport(); }}
            style={{ cursor: items.length > 0 ? "pointer" : "not-allowed", opacity: items.length > 0 ? 1 : 0.35 }}
          >
            <rect x={W - 130} y={6} width={94} height={16} rx={3}
                  fill="rgba(0,212,255,0.2)" stroke="#00d4ff" strokeWidth="1" />
            <text x={W - 83} y={18} fontSize="9" fontWeight="900" fill="#00d4ff" textAnchor="middle">
              ⤴ ROBOT JOB
            </text>
          </g>
        )}

        {/* Collapse */}
        <g onClick={(e) => { e.stopPropagation(); setCollapsed(true); }} style={{ cursor: "pointer" }}>
          <rect x={W - 28} y={6} width={20} height={16} rx={3}
                fill="rgba(255,255,255,0.05)" stroke="#00d4ff" strokeWidth="0.7" />
          <text x={W - 18} y={18} fontSize="11" fontWeight="900" fill="#00d4ff" textAnchor="middle">−</text>
        </g>

        {/* Ruler backgrounds */}
        <rect x={0} y={TITLE_H} width={W} height={TOP_RULER_H} fill="rgba(0,0,0,0.6)" />
        <rect x={0} y={TITLE_H + TOP_RULER_H} width={LEFT_RULER_W} height={CANVAS_H} fill="rgba(0,0,0,0.6)" />

        {/* Rulers */}
        {xMinor.map((mm) => (
          <line key={`xmt-${mm}`} x1={xToPx(mm)} y1={TITLE_H + TOP_RULER_H - 2}
                x2={xToPx(mm)} y2={TITLE_H + TOP_RULER_H}
                stroke="#00d4ff" strokeWidth="0.4" opacity="0.4" />
        ))}
        {xMajor.map((mm) => (
          <g key={`xt-${mm}`}>
            <line x1={xToPx(mm)} y1={TITLE_H + TOP_RULER_H - 5} x2={xToPx(mm)} y2={TITLE_H + TOP_RULER_H}
                  stroke="#00d4ff" strokeWidth="0.7" opacity="0.8" />
            <text x={xToPx(mm)} y={TITLE_H + TOP_RULER_H - 7}
                  fontSize="7" fill="#00d4ff" textAnchor="middle" opacity="0.85">{formatCoord(mm, unit)}</text>
          </g>
        ))}
        {yMinor.map((mm) => (
          <line key={`ymt-${mm}`} x1={LEFT_RULER_W - 2} y1={yToPx(mm)}
                x2={LEFT_RULER_W} y2={yToPx(mm)}
                stroke="#00d4ff" strokeWidth="0.4" opacity="0.4" />
        ))}
        {yMajor.map((mm) => (
          <g key={`yt-${mm}`}>
            <line x1={LEFT_RULER_W - 5} y1={yToPx(mm)} x2={LEFT_RULER_W} y2={yToPx(mm)}
                  stroke="#00d4ff" strokeWidth="0.7" opacity="0.8" />
            <text x={LEFT_RULER_W - 7} y={yToPx(mm) + 3}
                  fontSize="7" fill="#00d4ff" textAnchor="end" opacity="0.85">{formatCoord(mm, unit)}</text>
          </g>
        ))}

        {/* PCB area + grid */}
        <rect x={pcbX} y={pcbY} width={pcbPxW} height={pcbPxH} fill="#0d4f25" />
        {xMinor.map((mm) => (
          <line key={`xgm-${mm}`} x1={xToPx(mm)} y1={pcbY} x2={xToPx(mm)} y2={pcbY + pcbPxH}
                stroke="#1a8a4a" strokeWidth="0.3" opacity="0.25" />
        ))}
        {yMinor.map((mm) => (
          <line key={`ygm-${mm}`} x1={pcbX} y1={yToPx(mm)} x2={pcbX + pcbPxW} y2={yToPx(mm)}
                stroke="#1a8a4a" strokeWidth="0.3" opacity="0.25" />
        ))}
        {xMajor.map((mm) => (
          <line key={`xg-${mm}`} x1={xToPx(mm)} y1={pcbY} x2={xToPx(mm)} y2={pcbY + pcbPxH}
                stroke="#1a8a4a" strokeWidth="0.5" opacity="0.5" />
        ))}
        {yMajor.map((mm) => (
          <line key={`yg-${mm}`} x1={pcbX} y1={yToPx(mm)} x2={pcbX + pcbPxW} y2={yToPx(mm)}
                stroke="#1a8a4a" strokeWidth="0.5" opacity="0.5" />
        ))}
        <rect x={pcbX} y={pcbY} width={pcbPxW} height={pcbPxH}
              fill="none" stroke="#1a8a4a" strokeWidth="1" strokeDasharray="3,2" />

        {/* Wires */}
        {wires.map((w) => {
          const from = items[w.fromComponent];
          const to = items[w.toComponent];
          if (!from || !to) return null;
          return (
            <line key={w.id}
                  x1={xToPx(from.x_mm)} y1={yToPx(from.y_mm)}
                  x2={xToPx(to.x_mm)} y2={yToPx(to.y_mm)}
                  stroke="#fbbf24" strokeWidth="1.3" opacity="0.78" />
          );
        })}

        {/* Components — apply rotation via SVG transform, show pin-1 dot indicator */}
        {items.map((item, i) => {
          const color = COMPONENT_COLORS[item.type] ?? "#888";
          const cx = xToPx(item.x_mm);
          const cy = yToPx(item.y_mm);
          const isSelected = selected === i;
          const size = isSelected ? 13 : 10;
          const rot = item.rotation_deg || 0;
          return (
            <g key={i}
               transform={`rotate(${rot} ${cx} ${cy})`}
               onClick={(e) => { e.stopPropagation(); setSelected(i); }}
               style={{ cursor: "pointer" }}>
              <rect
                x={cx - size / 2} y={cy - size / 2}
                width={size} height={size} rx={1.5}
                fill={color}
                stroke={isSelected ? "#fff" : "#000"}
                strokeWidth={isSelected ? 1.5 : 0.7}
              />
              <text x={cx} y={cy + 2.5} textAnchor="middle"
                    fontSize="7" fontWeight="900" fill="#000"
                    style={{ pointerEvents: "none" }}>
                {item.type[0]}
              </text>
              {/* Pin 1 indicator — small black dot at top-left corner; rotates with the part */}
              <circle cx={cx - size / 2 + 2} cy={cy - size / 2 + 2} r="1.2"
                      fill="#000" pointerEvents="none" />
            </g>
          );
        })}

        {/* Snap crosshair */}
        {snapped && (
          <g pointerEvents="none">
            <line x1={xToPx(snapped.x_mm) - 5} y1={yToPx(snapped.y_mm)}
                  x2={xToPx(snapped.x_mm) + 5} y2={yToPx(snapped.y_mm)}
                  stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
            <line x1={xToPx(snapped.x_mm)} y1={yToPx(snapped.y_mm) - 5}
                  x2={xToPx(snapped.x_mm)} y2={yToPx(snapped.y_mm) + 5}
                  stroke="#fbbf24" strokeWidth="1" opacity="0.8" />
            <circle cx={xToPx(snapped.x_mm)} cy={yToPx(snapped.y_mm)} r="2.5"
                    fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.8" />
          </g>
        )}

        {items.length === 0 && (
          <text x={pcbX + pcbPxW / 2} y={pcbY + pcbPxH / 2}
                textAnchor="middle" fontSize="10" fill="#1a8a4a" opacity="0.65"
                pointerEvents="none">
            place components to see map
          </text>
        )}

        {/* Bottom info bar */}
        <rect x={0} y={H - INFO_H} width={W} height={INFO_H} fill="rgba(0,0,0,0.75)" />

        {sel && selId != null && selected != null ? (
          <>
            {/* Selected component info */}
            <text x={8} y={H - 10} fontSize="9" fontWeight="600" fill="#00d4ff">
              {selId} · {sel.type} · {formatCoord(sel.x_mm, unit)}, {formatCoord(sel.y_mm, unit)} {unit} · θ{sel.rotation_deg}°
            </text>
            {/* Rotate button */}
            <g
              onClick={(e) => { e.stopPropagation(); onRotate?.(selected); }}
              style={{ cursor: "pointer" }}
            >
              <rect x={W - 92} y={H - INFO_H + 5} width={40} height={18} rx={3}
                    fill="rgba(0,212,255,0.18)" stroke="#00d4ff" strokeWidth="0.7" />
              <text x={W - 72} y={H - INFO_H + 17}
                    fontSize="9" fontWeight="900" fill="#00d4ff" textAnchor="middle">
                ↻ ROT
              </text>
            </g>
            {/* Delete button */}
            <g
              onClick={(e) => {
                e.stopPropagation();
                if (selected != null) {
                  onDelete?.(selected);
                  setSelected(null);
                }
              }}
              style={{ cursor: "pointer" }}
            >
              <rect x={W - 48} y={H - INFO_H + 5} width={40} height={18} rx={3}
                    fill="rgba(239,68,68,0.18)" stroke="#ef4444" strokeWidth="0.7" />
              <text x={W - 28} y={H - INFO_H + 17}
                    fontSize="9" fontWeight="900" fill="#ef4444" textAnchor="middle">
                ✕ DEL
              </text>
            </g>
          </>
        ) : cursor ? (
          <text x={8} y={H - 10} fontSize="9.5" fontWeight="600" fill="#00d4ff">
            Cursor: X: {formatCoord(cursor.x_mm, unit)}{unit}  Y: {formatCoord(cursor.y_mm, unit)}{unit}
          </text>
        ) : (
          <text x={8} y={H - 10} fontSize="9.5" fontWeight="600" fill="#00d4ff">
            {items.length} parts · {wires.length} nets · click a part to inspect
          </text>
        )}
      </svg>
    </div>
  );
}
