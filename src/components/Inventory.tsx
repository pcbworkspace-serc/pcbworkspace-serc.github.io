import type { ReactNode } from "react";

function ResistorIcon() {
  return (
    <svg viewBox="0 0 32 12" className="w-8 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" strokeLinecap="round">
      <line x1="0" y1="6" x2="6" y2="6" />
      <polyline points="6,6 8,2 12,10 16,2 20,10 24,2 26,6" />
      <line x1="26" y1="6" x2="32" y2="6" />
    </svg>
  );
}

function CapacitorIcon() {
  return (
    <svg viewBox="0 0 24 14" className="w-6 h-4 text-cyan-100" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round">
      <line x1="0" y1="7" x2="10" y2="7" />
      <line x1="10" y1="2" x2="10" y2="12" />
      <line x1="14" y1="2" x2="14" y2="12" />
      <line x1="14" y1="7" x2="24" y2="7" />
    </svg>
  );
}

function DiodeIcon() {
  return (
    <svg viewBox="0 0 26 12" className="w-7 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="0" y1="6" x2="9" y2="6" />
      <polygon points="9,1 9,11 17,6" fill="currentColor" />
      <line x1="17" y1="1" x2="17" y2="11" />
      <line x1="17" y1="6" x2="26" y2="6" />
    </svg>
  );
}

function LEDIcon() {
  return (
    <svg viewBox="0 0 28 16" className="w-7 h-4 text-cyan-100" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="0" y1="10" x2="8" y2="10" />
      <polygon points="8,5 8,15 16,10" fill="currentColor" />
      <line x1="16" y1="5" x2="16" y2="15" />
      <line x1="16" y1="10" x2="28" y2="10" />
      <line x1="10" y1="4" x2="13" y2="1" />
      <polyline points="11,1 13,1 13,3" />
      <line x1="14" y1="4" x2="17" y2="1" />
      <polyline points="15,1 17,1 17,3" />
    </svg>
  );
}

function TransistorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="12" x2="7" y2="12" />
      <line x1="7" y1="6" x2="7" y2="18" />
      <line x1="7" y1="10" x2="16" y2="3" />
      <line x1="16" y1="3" x2="22" y2="3" />
      <line x1="7" y1="14" x2="16" y2="21" />
      <line x1="16" y1="21" x2="22" y2="21" />
      <polygon points="13,17 16,21 12,20" fill="currentColor" />
    </svg>
  );
}

function ICIcon() {
  return (
    <svg viewBox="0 0 24 20" className="w-6 h-5 text-cyan-100" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="3" width="12" height="14" rx="1" />
      <circle cx="9" cy="6" r="0.8" fill="currentColor" />
      <line x1="2" y1="6" x2="6" y2="6" />
      <line x1="2" y1="10" x2="6" y2="10" />
      <line x1="2" y1="14" x2="6" y2="14" />
      <line x1="18" y1="6" x2="22" y2="6" />
      <line x1="18" y1="10" x2="22" y2="10" />
      <line x1="18" y1="14" x2="22" y2="14" />
    </svg>
  );
}

function InductorIcon() {
  return (
    <svg viewBox="0 0 36 12" className="w-9 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <line x1="0" y1="8" x2="4" y2="8" />
      <path d="M 4 8 Q 7 0 10 8 Q 13 0 16 8 Q 19 0 22 8 Q 25 0 28 8 Q 31 0 34 8" />
      <line x1="34" y1="8" x2="36" y2="8" />
    </svg>
  );
}

function CrystalIcon() {
  return (
    <svg viewBox="0 0 28 14" className="w-7 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <line x1="0" y1="7" x2="8" y2="7" />
      <line x1="8" y1="2" x2="8" y2="12" />
      <rect x="10" y="3" width="8" height="8" />
      <line x1="20" y1="2" x2="20" y2="12" />
      <line x1="20" y1="7" x2="28" y2="7" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg viewBox="0 0 28 14" className="w-7 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round">
      <line x1="0" y1="10" x2="8" y2="10" />
      <line x1="8" y1="10" x2="18" y2="2" />
      <circle cx="8" cy="10" r="1.5" fill="currentColor" />
      <circle cx="20" cy="10" r="1.5" fill="currentColor" />
      <line x1="20" y1="10" x2="28" y2="10" />
    </svg>
  );
}

function HeaderIcon() {
  return (
    <svg viewBox="0 0 28 12" className="w-7 h-3 text-cyan-100" stroke="currentColor" strokeWidth="1.2" fill="none">
      <rect x="2" y="2" width="24" height="8" />
      <circle cx="6" cy="6" r="1" fill="currentColor" />
      <circle cx="11" cy="6" r="1" fill="currentColor" />
      <circle cx="16" cy="6" r="1" fill="currentColor" />
      <circle cx="21" cy="6" r="1" fill="currentColor" />
    </svg>
  );
}

interface ItemDef { type: string; icon: ReactNode }
const items: ItemDef[] = [
  { type: "Resistor",   icon: <ResistorIcon /> },
  { type: "Capacitor",  icon: <CapacitorIcon /> },
  { type: "Diode",      icon: <DiodeIcon /> },
  { type: "LED",        icon: <LEDIcon /> },
  { type: "Transistor", icon: <TransistorIcon /> },
  { type: "IC",         icon: <ICIcon /> },
  { type: "Inductor",   icon: <InductorIcon /> },
  { type: "Crystal",    icon: <CrystalIcon /> },
  { type: "Switch",     icon: <SwitchIcon /> },
  { type: "Header",     icon: <HeaderIcon /> },
];

export default function Inventory() {
  return (
    <div className="panel-border panel-bg rounded-lg p-3 w-[220px]">
      <h3 className="text-center text-primary font-bold text-lg mb-1">Inventory</h3>
      <p className="text-xs text-muted-foreground text-center mb-3">
        Drag items onto the PCB Board!
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {items.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/plain", item.type)}
            className="w-[60px] h-[60px] bg-secondary rounded cursor-grab active:cursor-grabbing
                       flex flex-col items-center justify-center gap-1 text-[10px] font-semibold
                       text-secondary-foreground hover:bg-accent transition-colors select-none"
          >
            {item.icon}
            <span>{item.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}