// Bill of Materials export.
// Generates a CSV grouped by component type with designator lists.

interface BomItem { type: string }

export interface BomRow {
  type: string;
  quantity: number;
  designators: string[];
}

export function buildBOM(items: BomItem[]): BomRow[] {
  const counters: Record<string, number> = {};
  const designators: Record<string, string[]> = {};

  for (const item of items) {
    counters[item.type] = (counters[item.type] ?? 0) + 1;
    const prefix = item.type[0] ?? "X";
    const designator = `${prefix}${counters[item.type]}`;
    (designators[item.type] ??= []).push(designator);
  }

  return Object.entries(designators).map(([type, ds]) => ({
    type, quantity: ds.length, designators: ds,
  }));
}

function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function bomToCSV(rows: BomRow[]): string {
  const header = "Type,Quantity,Designators";
  const body = rows.map(r =>
    [r.type, String(r.quantity), r.designators.join(", ")].map(csvEscape).join(",")
  );
  return [header, ...body].join("\n");
}

export function downloadBOM(items: BomItem[], filename = `pcb-bom-${Date.now()}.csv`): void {
  const csv = bomToCSV(buildBOM(items));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
