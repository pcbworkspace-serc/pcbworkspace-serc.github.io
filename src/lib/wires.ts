// Shared types for the wire/net system

export interface Wire {
  id: string;                   // unique ID
  fromComponent: number;        // index into boardItems array
  fromPin: string;              // pin name
  toComponent: number;
  toPin: string;
}

export interface PinRef {
  componentIndex: number;
  pinName: string;
}

export interface NetAnalysis {
  numNets: number;              // distinct connected groups of pins
  totalPins: number;
  connectedPins: number;
  floatingPins: number;         // pins with no wires
  shorts: string[];             // human-readable warnings
}

/**
 * Compute connected components of the wire graph (each net is a connected group).
 */
export function analyzeNets(
  boardItems: { type: string }[],
  wires: Wire[],
  getPinNames: (type: string) => string[]
): NetAnalysis {
  // Build a unique key per pin: "componentIdx.pinName"
  const allPinKeys: string[] = [];
  for (let ci = 0; ci < boardItems.length; ci++) {
    const pinNames = getPinNames(boardItems[ci].type);
    for (const pn of pinNames) allPinKeys.push(`${ci}.${pn}`);
  }
  const totalPins = allPinKeys.length;

  // Union-Find for connected components
  const parent: Record<string, string> = {};
  const find = (x: string): string => {
    while (parent[x] && parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };

  for (const k of allPinKeys) parent[k] = k;

  // Connect via wires
  for (const w of wires) {
    const a = `${w.fromComponent}.${w.fromPin}`;
    const b = `${w.toComponent}.${w.toPin}`;
    if (parent[a] !== undefined && parent[b] !== undefined) {
      union(a, b);
    }
  }

  // Count distinct nets (only of pins that are actually connected to something)
  const connectedPinSet = new Set<string>();
  for (const w of wires) {
    connectedPinSet.add(`${w.fromComponent}.${w.fromPin}`);
    connectedPinSet.add(`${w.toComponent}.${w.toPin}`);
  }

  const nets = new Set<string>();
  for (const pin of connectedPinSet) nets.add(find(pin));

  const connectedPins = connectedPinSet.size;
  const floatingPins = totalPins - connectedPins;

  // Sanity warnings
  const shorts: string[] = [];
  // Check: a single pin connected to itself (self-wire) is a useless short
  for (const w of wires) {
    if (w.fromComponent === w.toComponent && w.fromPin === w.toPin) {
      const ct = boardItems[w.fromComponent]?.type ?? "?";
      shorts.push(`${ct} pin ${w.fromPin} wired to itself`);
    }
  }

  return {
    numNets: nets.size,
    totalPins,
    connectedPins,
    floatingPins,
    shorts,
  };
}

export function makeWireId(): string {
  return `wire_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}