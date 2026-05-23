/**
 * useBinScan — React hook exposing the latest bin scan result.
 *
 * Usage:
 *   const { result, scanning, scan } = useBinScan();
 *   await scan();                            // manual rescan
 *   const r = findInstance(result, "Resistor");  // null if none visible
 *
 * Not continuous (Render free-tier would die). Scans on demand instead:
 *   - Manual "Scan Bins" button
 *   - Right before each pickup (in useRobotPlacement)
 */
import { useCallback, useState } from "react";
import { scanBins, type BinScanResult } from "@/lib/binScan";
import { emitLine } from "@/lib/serial";

export function useBinScan() {
  const [result, setResult] = useState<BinScanResult | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async (): Promise<BinScanResult> => {
    setScanning(true);
    emitLine(`> Scanning workstation for components...`);
    const r = await scanBins();
    setResult(r);
    setScanning(false);
    if (r.ok) {
      const counts: Record<string, number> = {};
      for (const inst of r.instances) counts[inst.type] = (counts[inst.type] ?? 0) + 1;
      const summary = Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ") || "nothing";
      emitLine(`> Scan complete: ${summary}`);
    } else {
      emitLine(`! Scan failed: ${r.error}`);
    }
    return r;
  }, []);

  return { result, scanning, scan };
}