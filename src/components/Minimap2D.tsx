import { useState } from "react";
import { type Wire } from "@/lib/wires";

interface MapItem {
  type: string;
  x_mm: number;
  y_mm: number;
}

interface Minimap2DProps {
  items: MapItem[];
  wires: Wire[];
  pcbWidthMm: number;
  pcbHeightMm: number;
  onExport?: () => void;
}

const COMPONENT_COLORS: Record<string, string> = {
  Resistor: "#f59e0b",
  Capacitor: "#10b981",
  Diode: "#a78bfa",
  LED: "#fbbf24",
  Transistor: "#ef4444",
  IC: "#3b82f6",
  Connector: "#ec4899",
};

// Outer canvas dimensions
const W = 360;
const H = 260;

// Vertical regions
const TITLE_H = 28;
const TOP_RULER_H = 18;
const INFO_H = 24;
// Horizontal regions
const LEFT_RULER_W = 28;
const RIGHT_PAD = 8;
const BOTTOM_PAD = 4;

const CANVAS_X = LEFT_RULER_W;
const CANVAS_Y = TITLE_H + TOP_RULER_H;
const CANVAS_W = W - LEFT_RULER_W - RIGHT_PAD;
const CANVAS_H = H - TITLE_H - TOP_RULER_H - INFO_H - BOTTOM_PAD;

// Generate component IDs (R1, R2, C1, ...) the same way the export does
function makeComponentIds(items: MapItem[]): string[] {
  const counters: Record<string, number> = {};
  return items.map((item) => {
    counters[item.type] = (counters[item.type] || 0) + 1;
    return `${item.type[0] ?? "X"}${counters[item.type]}`;
  });
}

export default function Minimap2D({
  items, wires, pcbWidthMm, pcbHeightMm, onExport,
}: Minimap2DProps) {
  const [selected, setSelected] = useState<number | null>(null);

  // Fit the PCB rectangle inside the canvas area while preserving aspect ratio
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

  // Coordinate conversions (mm → pixel)
  const xToPx = (mm: number) => pcbX + (mm / pcbWidthMm) * pcbPxW;
  // Flip Y so 0 is at the bottom of the PCB rectangle (matches engineering convention)
  const yToPx = (mm: number) => pcbY + pcbPxH - (mm / pcbHeightMm) * pcbPxH;

  // Ruler ticks every 10mm
  const xTicks: number[] = [];
  for (let mm = 0; mm <= pcbWidthMm; mm += 10) xTicks.push(mm);
  const yTicks: number[] = [];
  for (let mm = 0; mm <= pcbHeightMm; mm += 10) yTicks.push(mm);

  const ids = makeComponentIds(items);
  const sel = selected != null ? items[selected] : null;
  const selId = selected != null ? ids[selected] : null;

  return (
    <div
      className="absolute bottom-3 right-3 z-30 bg-black/90 border border-primary/30 rounded-lg shadow-2xl backdrop-blur-sm overflow-hidden"
      style={{ width: W, height: H }}
    >
      <svg
        width={W} height={H}
        onClick={() => setSelected(null)}
        style={{ display: "block" }}
      >
        {/* Title bar */}
        <rect x={0} y={0} width={W} height={TITLE_H} fill="rgba(0,212,255,0.08)" />
        <text x={8} y={18} fontSize="10" fontWeight="900" fill="#00d4ff" letterSpacing="0.5">
          2D BOARD · {pcbWidthMm}×{pcbHeightMm}MM
        </text>
        {/* Robot export button */}
        <g
          onClick={(e) => { e.stopPropagation(); if (onExport && items.length > 0) onExport(); }}
          style={{ cursor: items.length > 0 ? "pointer" : "not-allowed", opacity: items.length > 0 ? 1 : 0.35 }}
        >
          <rect x={W - 102} y={6} width={94} height={16} rx={3}
                fill="rgba(0,212,255,0.2)" stroke="#00d4ff" strokeWidth="1" />
          <text x={W - 55} y={18} fontSize="9" fontWeight="900" fill="#00d4ff" textAnchor="middle">
            ⤴ ROBOT JOB
          </text>
        </g>

        {/* Ruler backgrounds */}
        <rect x={0} y={TITLE_H} width={W} height={TOP_RULER_H} fill="rgba(0,0,0,0.6)" />
        <rect x={0} y={TITLE_H + TOP_RULER_H} width={LEFT_RULER_W} height={CANVAS_H} fill="rgba(0,0,0,0.6)" />

        {/* Top ruler ticks + labels */}
        {xTicks.map((mm) => (
          <g key={`xt-${mm}`}>
            <line
              x1={xToPx(mm)} y1={TITLE_H + TOP_RULER_H - 5}
              x2={xToPx(mm)} y2={TITLE_H + TOP_RULER_H}
              stroke="#00d4ff" strokeWidth="0.7" opacity="0.7"
            />
            <text
              x={xToPx(mm)} y={TITLE_H + TOP_RULER_H - 7}
              fontSize="7" fill="#00d4ff" textAnchor="middle" opacity="0.85"
            >
              {mm}
            </text>
          </g>
        ))}

        {/* Left ruler ticks + labels */}
        {yTicks.map((mm) => (
          <g key={`yt-${mm}`}>
            <line
              x1={LEFT_RULER_W - 5} y1={yToPx(mm)}
              x2={LEFT_RULER_W} y2={yToPx(mm)}
              stroke="#00d4ff" strokeWidth="0.7" opacity="0.7"
            />
            <text
              x={LEFT_RULER_W - 7} y={yToPx(mm) + 3}
              fontSize="7" fill="#00d4ff" textAnchor="end" opacity="0.85"
            >
              {mm}
            </text>
          </g>
        ))}

        {/* PCB area */}
        <rect x={pcbX} y={pcbY} width={pcbPxW} height={pcbPxH} fill="#0d4f25" />

        {/* Grid lines every 10mm */}
        {xTicks.map((mm) => (
          <line key={`xg-${mm}`}
                x1={xToPx(mm)} y1={pcbY}
                x2={xToPx(mm)} y2={pcbY + pcbPxH}
                stroke="#1a8a4a" strokeWidth="0.5" opacity="0.45" />
        ))}
        {yTicks.map((mm) => (
          <line key={`yg-${mm}`}
                x1={pcbX} y1={yToPx(mm)}
                x2={pcbX + pcbPxW} y2={yToPx(mm)}
                stroke="#1a8a4a" strokeWidth="0.5" opacity="0.45" />
        ))}

        {/* PCB outline */}
        <rect x={pcbX} y={pcbY} width={pcbPxW} height={pcbPxH}
              fill="none" stroke="#1a8a4a" strokeWidth="1" strokeDasharray="3,2" />

        {/* Wires (drawn before components so they sit underneath) */}
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

        {/* Components */}
        {items.map((item, i) => {
          const color = COMPONENT_COLORS[item.type] ?? "#888";
          const cx = xToPx(item.x_mm);
          const cy = yToPx(item.y_mm);
          const isSelected = selected === i;
          const size = isSelected ? 13 : 10;
          return (
            <g key={i}
               onClick={(e) => { e.stopPropagation(); setSelected(i); }}
               style={{ cursor: "pointer" }}>
              <rect
                x={cx - size / 2} y={cy - size / 2}
                width={size} height={size} rx={1.5}
                fill={color}
                stroke={isSelected ? "#fff" : "#000"}
                strokeWidth={isSelected ? 1.5 : 0.7}
              />
              <text
                x={cx} y={cy + 2.5}
                textAnchor="middle"
                fontSize="7" fontWeight="900" fill="#000"
                style={{ pointerEvents: "none" }}
              >
                {item.type[0]}
              </text>
            </g>
          );
        })}

        {/* Empty state inside the PCB rect */}
        {items.length === 0 && (
          <text
            x={pcbX + pcbPxW / 2} y={pcbY + pcbPxH / 2}
            textAnchor="middle" fontSize="10" fill="#1a8a4a" opacity="0.65"
          >
            place components to see map
          </text>
        )}

        {/* Bottom info bar */}
        <rect x={0} y={H - INFO_H} width={W} height={INFO_H} fill="rgba(0,0,0,0.7)" />
        <text x={8} y={H - 8} fontSize="9.5" fontWeight="600" fill="#00d4ff">
          {sel && selId
            ? `${selId} · ${sel.type} · ${sel.x_mm.toFixed(2)}, ${sel.y_mm.toFixed(2)} mm`
            : `${items.length} parts · ${wires.length} nets · click a part to inspect`}
        </text>
      </svg>
    </div>
  );
}
