/**
 * useRobotPlacement â€” fires the move-pick-place sequence when a user drops
 * a component on the PCB. Sends commands through the shared serial layer,
 * which routes to either:
 *   - Demo Mode (simulated firmware echoing READY/POS_OK/PICK_OK/PLACE_OK)
 *   - Real Robot (WebSerial-connected ESP32)
 * Both render in the Demo Console with -> outgoing and <- incoming lines.
 */
import { useCallback } from "react";
import { sendSerialCommand, isDemoMode } from "@/lib/serial";
import { getSerialStatus } from "@/lib/serial";
import { useToast } from "@/hooks/use-toast";

// Pickup bin coordinates for each component type â€” these would come from
// the camera + vision detection in production. For now, fixed positions.
const BIN_COORDS: Record<string, [number, number]> = {
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

// Scale factor: scene coords are unitless [-3,3] x [-2,2]; PCB is in mm
// Multiply scene by ~10 to get reasonable mm values
const SCENE_TO_MM = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useRobotPlacement() {
  const { toast } = useToast();
  return useCallback(
    async (sceneX: number, sceneZ: number, componentType: string) => {
      // Only fire if Demo Mode is active or a real robot is connected
      if (!isDemoMode() && !getSerialStatus() === "connected") {
        toast({
          title: `${componentType} placed (offline)`,
          description: "Connect Robot or enable Demo Mode to see the pick-and-place sequence.",
        });
        return;
      }
      const x_mm = sceneX * SCENE_TO_MM;
      const y_mm = sceneZ * SCENE_TO_MM;
      const bin = BIN_COORDS[componentType] ?? [0, 0];
      try {
        // 1) Move to bin
        await sendSerialCommand(`MOVE X${bin[0]} Y${bin[1]} Z5 R0`);
        await sleep(700);
        // 2) Pick from bin
        await sendSerialCommand(`PICK`);
        await sleep(600);
        // 3) Move to PCB target
        await sendSerialCommand(`MOVE X${x_mm.toFixed(1)} Y${y_mm.toFixed(1)} Z5 R0`);
        await sleep(700);
        // 4) Place on PCB
        await sendSerialCommand(`PLACE`);
        toast({
          title: `Placed ${componentType}`,
          description: `Bin (${bin[0]}, ${bin[1]}) -> PCB (${x_mm.toFixed(1)}, ${y_mm.toFixed(1)})`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: `Place failed`,
          description: msg,
          variant: "destructive",
        });
      }
    },
    [toast],
  );
}