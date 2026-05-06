// Functional circuit block detection
// Given a list of component types on the board, return recognized circuit blocks.

export interface CircuitBlock {
  name: string;
  description: string;
  components: string[]; // which component types make up this block
}

const CIRCUIT_DEFINITIONS: { match: Record<string, number>; block: CircuitBlock }[] = [
  {
    match: { Resistor: 1, Capacitor: 1 },
    block: {
      name: "RC Filter",
      description: "Resistor + capacitor: low/high-pass filter or timing circuit.",
      components: ["Resistor", "Capacitor"],
    },
  },
  {
    match: { Resistor: 1, LED: 1 },
    block: {
      name: "LED Circuit",
      description: "Resistor in series with an LED limits current to protect it.",
      components: ["Resistor", "LED"],
    },
  },
  {
    match: { Resistor: 2 },
    block: {
      name: "Voltage Divider",
      description: "Two resistors in series divide voltage by their ratio.",
      components: ["Resistor", "Resistor"],
    },
  },
  {
    match: { Resistor: 1, Diode: 1 },
    block: {
      name: "RL Circuit",
      description: "Resistor + diode (or inductor): rectifier or current-limit.",
      components: ["Resistor", "Diode"],
    },
  },
  {
    match: { Capacitor: 1, Diode: 1 },
    block: {
      name: "Half-wave Rectifier",
      description: "Diode + capacitor: converts AC to smoothed DC.",
      components: ["Capacitor", "Diode"],
    },
  },
  {
    match: { Resistor: 1, Transistor: 1 },
    block: {
      name: "Transistor Switch / Amp",
      description: "Resistor biases a transistor used as a switch or amplifier.",
      components: ["Resistor", "Transistor"],
    },
  },
];

/**
 * Detect circuit blocks from a list of components.
 * Greedy matching: consumes components for each detected block.
 */
export function detectCircuitBlocks(items: { type: string }[]): CircuitBlock[] {
  // Count components
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.type] = (counts[item.type] || 0) + 1;

  const detected: CircuitBlock[] = [];

  // Greedy: try to match definitions, consuming components as we go
  let changed = true;
  while (changed) {
    changed = false;
    for (const def of CIRCUIT_DEFINITIONS) {
      const canMatch = Object.entries(def.match).every(
        ([type, needed]) => (counts[type] || 0) >= needed
      );
      if (canMatch) {
        detected.push(def.block);
        for (const [type, needed] of Object.entries(def.match)) {
          counts[type] -= needed;
        }
        changed = true;
        break;
      }
    }
  }

  return detected;
}