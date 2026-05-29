/**
 * useRobotPlacement — fires the move-pick-place sequence via Flask
 */
import { useCallback, useRef } from "react";
import { commandPlace } from "@/lib/robot_client_flask";
import { scanBins, findInstance } from "@/lib/binScan";
import { useToast } from "@/hooks/use-toast";
import { emitLine } from "@/lib/serial";

const SCENE_TO_MM = 10;

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

      inFlight.current = true;
      const x_mm = sceneX * SCENE_TO_MM;
      const y_mm = sceneZ * SCENE_TO_MM;

      try {
        emitLine(`> Placing ${componentType} at PCB (${x_mm.toFixed(1)}, ${y_mm.toFixed(1)})`);

        // Scan for the component in the bin area
        emitLine(`> Step 1/2 - Scanning workstation for ${componentType}`);
        const scan = await scanBins();
        let bin: [number, number];

        if (scan.ok) {
          const inst = findInstance(scan, componentType);
          if (inst) {
            bin = [inst.world.x_mm, inst.world.y_mm];
            emitLine(`> Found ${componentType} at (${bin[0].toFixed(1)}, ${bin[1].toFixed(1)}) - confidence ${(inst.confidence * 100).toFixed(0)}%`);
          } else if (DEMO_BIN_COORDS[componentType]) {
            bin = DEMO_BIN_COORDS[componentType];
            emitLine(`! No ${componentType} detected - using fallback (Demo)`);
          } else {
            emitLine(`! No ${componentType} detected`);
            toast({
              title: `Cannot pick ${componentType}`,
              description: `No ${componentType} visible. Add one to the bin and try again.`,
              variant: "destructive",
            });
            return;
          }
        } else if (DEMO_BIN_COORDS[componentType]) {
          bin = DEMO_BIN_COORDS[componentType];
          emitLine(`! Scan unavailable - using fallback (Demo)`);
        } else {
          throw new Error(scan.error ?? "Scan failed");
        }

        // Send placement request to Flask
        emitLine(`> Step 2/2 - Sending to robot`);
        const result = await commandPlace({
          type: componentType,
          x: bin[0],
          y: bin[1],
        });

        emitLine(`> ${result.message}`);
        toast({
          title: `Placed ${componentType}`,
          description: result.message,
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