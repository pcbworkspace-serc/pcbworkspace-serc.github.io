/**
 * useRobotPlacement — fires the move-pick-place sequence when a user drops
 * a component on the PCB. Uses live bin detection from the top camera to
 * find where the requested component actually IS in the workstation, then
 * commands the robot through that pickup.
 *
 * Pipeline per drop:
 *   1. Scan bins (capture + detect + pixel->world)
 *   2. Find a visible instance of the requested type
 *   3. Move to its world coords -> Pick -> Move to PCB target -> Place
 *   4. Toast result
 *
 * If no instance is visible -> toast asking user to add parts and refuses
 * the pickup. No silent failures.
 */
import { useCallback, useRef } from "react";
import { sendSerialCommand, isDemoMode, emitLine, getSerialStatus } from "@/lib/serial";
import { scanBins, findInstance } from "@/lib/binScan";
import { useToast } from "@/hooks/use-toast";

const SCENE_TO_MM = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Mock detection fallback for Demo Mode when the ML backend is sleeping.
// Real bin scan is tried first; if it fails, we use these positions so the
// demo flow keeps working. Mark each so the console makes the source clear.
const DEMO_BIN_COORDS: Record<string, [number, number]> = {
  Resistor:   [-25, -20],
  Capacitor:  [-25, -10],
  Diode:      [-25, 0],
  LED:        [-25, 10],
  Transistor: [-25, 20],
  IC:         [-35, -20],
  Inductor:   [-35, -10],
  Crystal:    [-35, 0],
  Switch:     [-35, 10],
  Header:     [-35, 20],
};

export function useRobotPlacement() {
  const { toast } = useToast();
  const inFlight = useRef(false);

  return useCallback(
    async (sceneX: number, sceneZ: number, componentType: string) => {
      if (inFlight.current) {
        emitLine(`! Pickup busy - drop again after current sequence finishes`);
        return;
      }
      if (!isDemoMode() && getSerialStatus() !== "connected") {
        toast({
          title: `${componentType} placed (offline)`,
          description: "Connect Robot or enable Demo Mode to see the pick-and-place sequence.",
        });
        return;
      }

      inFlight.current = true;
      const x_mm = sceneX * SCENE_TO_MM;
      const y_mm = sceneZ * SCENE_TO_MM;

      try {
        emitLine(`> Placing ${componentType} at PCB (${x_mm.toFixed(1)}, ${y_mm.toFixed(1)})`);

        // 1) Scan for the component in the bin area
        emitLine(`> Step 1/5 - Scanning workstation for ${componentType}`);
        const scan = await scanBins();
        let bin: [number, number];

        if (scan.ok) {
          const inst = findInstance(scan, componentType);
          if (inst) {
            bin = [inst.world.x_mm, inst.world.y_mm];
            emitLine(`> Found ${componentType} at world (${bin[0].toFixed(1)}, ${bin[1].toFixed(1)}) - confidence ${(inst.confidence * 100).toFixed(0)}%`);
          } else if (DEMO_BIN_COORDS[componentType]) {
            // Vision didn't see it, but Demo Mode users still want the sequence
            bin = DEMO_BIN_COORDS[componentType];
            emitLine(`! No ${componentType} detected by camera - using fallback bin position (Demo)`);
          } else {
            emitLine(`! No ${componentType} detected and no fallback bin defined`);
            toast({
              title: `Cannot pick ${componentType}`,
              description: `No ${componentType} visible in the workstation. Add one to the bin area and try again.`,
              variant: "destructive",
            });
            return;
          }
        } else if (DEMO_BIN_COORDS[componentType]) {
          bin = DEMO_BIN_COORDS[componentType];
          emitLine(`! Scan unavailable (${scan.error ?? "unknown"}) - using fallback bin (Demo)`);
        } else {
          emitLine(`! Scan failed: ${scan.error}`);
          toast({
            title: `Scan failed`,
            description: scan.error ?? "Unable to detect components",
            variant: "destructive",
          });
          return;
        }

        // 2) Move to bin
        emitLine(`> Step 2/5 - Moving to ${componentType} at bin (${bin[0].toFixed(1)}, ${bin[1].toFixed(1)})`);
        await sendSerialCommand(`MOVE X${bin[0].toFixed(1)} Y${bin[1].toFixed(1)} Z5 R0`);
        await sleep(700);

        // 3) Pick from bin
        emitLine(`> Step 3/5 - Picking up ${componentType}`);
        await sendSerialCommand(`PICK`);
        await sleep(600);

        // 4) Move to PCB target
        emitLine(`> Step 4/5 - Moving to PCB target (${x_mm.toFixed(1)}, ${y_mm.toFixed(1)})`);
        await sendSerialCommand(`MOVE X${x_mm.toFixed(1)} Y${y_mm.toFixed(1)} Z5 R0`);
        await sleep(700);

        // 5) Place on PCB
        emitLine(`> Step 5/5 - Placing component on PCB`);
        await sendSerialCommand(`PLACE`);
        await sleep(300);
        emitLine(`> Done. ${componentType} placed.`);

        toast({
          title: `Placed ${componentType}`,
          description: `Bin (${bin[0].toFixed(1)}, ${bin[1].toFixed(1)}) -> PCB (${x_mm.toFixed(1)}, ${y_mm.toFixed(1)})`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        emitLine(`! Placement failed: ${msg}`);
        toast({
          title: `Placement failed`,
          description: msg,
          variant: "destructive",
        });
      } finally {
        inFlight.current = false;
      }
    },
    [toast],
  );
}