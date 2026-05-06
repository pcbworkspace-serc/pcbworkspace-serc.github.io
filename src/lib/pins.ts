// Pin positions in LOCAL component coordinates.
// Each component has named pins. The values are [x, y, z] offsets from the
// component's group origin (where it's positioned on the board).
//
// Coordinate conventions (matches PCBWorkspace.tsx geometry):
// - X: along the board horizontally
// - Y: up (height above board)
// - Z: along the board depthwise

export interface PinDef {
  name: string;     // "anode", "cathode", "base", etc.
  position: [number, number, number]; // local offset from component origin
}

export const PIN_DEFINITIONS: Record<string, PinDef[]> = {
  Resistor: [
    { name: "1", position: [-0.34, 0.12, 0] },
    { name: "2", position: [ 0.34, 0.12, 0] },
  ],
  Capacitor: [
    { name: "+", position: [-0.04, -0.03, 0] },
    { name: "-", position: [ 0.04, -0.03, 0] },
  ],
  Diode: [
    { name: "A", position: [-0.29, 0.10, 0] },  // anode
    { name: "K", position: [ 0.29, 0.10, 0] },  // cathode
  ],
  LED: [
    { name: "+", position: [-0.03, -0.03, 0] }, // anode (longer leg)
    { name: "-", position: [ 0.03, -0.03, 0] }, // cathode
  ],
  Transistor: [
    { name: "B", position: [-0.05, -0.02, 0] }, // base
    { name: "C", position: [ 0.00, -0.02, 0] }, // collector
    { name: "E", position: [ 0.05, -0.02, 0] }, // emitter
  ],
};

export function getPins(componentType: string): PinDef[] {
  return PIN_DEFINITIONS[componentType] ?? [];
}