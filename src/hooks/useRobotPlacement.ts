/**
 * useRobotPlacement — small hook that augments the existing PCBWorkspace
 * drop handler so it also commands the physical robot to place the part.
 *
 * INTEGRATION:
 *   In PCBWorkspace.tsx, change the top of the component to:
 *
 *     import { useRobotPlacement } from "@/hooks/useRobotPlacement";
 *
 *     export default function PCBWorkspace({ items, onItemsChange }: PCBWorkspaceProps) {
 *       const [droppedItems, setDroppedItems] = useState<DroppedItem[]>(items ?? []);
 *       const placeOnRobot = useRobotPlacement();
 *
 *   And in handleDrop, AFTER computing x and y but before/alongside
 *   setDroppedItems(...), add ONE line:
 *
 *     placeOnRobot(x, y, type);
 *
 *   That's the entire patch. The hook handles everything else: scene→PCB-mm
 *   conversion, the network call, toast notifications on success/failure,
 *   and graceful no-op if the workspace isn't calibrated yet.
 */
import { useCallback } from "react";
import { robotClient } from "@/lib/robotClient";
import { sceneToPcbMm, DEFAULT_PICK_FROM } from "@/lib/robotConfig";
import { useToast } from "@/hooks/use-toast";
import { useRobotStatus } from "@/hooks/useRobotStatus";

export function useRobotPlacement() {
  const { toast } = useToast();
  const { data: status } = useRobotStatus();

  return useCallback(
    async (sceneX: number, sceneZ: number, componentType: string) => {
      if (!status?.calibrated.workspace) {
        toast({
          title: "Workspace not calibrated",
          description: "Click Calibrate on the camera feed before placing parts.",
          variant: "destructive",
        });
        return;
      }
      if (status.estopped) {
        toast({
          title: "Robot is e-stopped",
          description: "Reset before placing parts.",
          variant: "destructive",
        });
        return;
      }

      const { x_pcb, y_pcb } = sceneToPcbMm(sceneX, sceneZ);

      try {
        const r = await robotClient.placeAt(x_pcb, y_pcb, {
          wrist: 0,
          pick_from: DEFAULT_PICK_FROM,
        });
        if (r.ok && r.robot_xyz) {
          toast({
            title: `Placed ${componentType}`,
            description: `PCB (${x_pcb.toFixed(1)}, ${y_pcb.toFixed(1)}) → ` +
              `Robot (${r.robot_xyz.map((n) => n.toFixed(1)).join(", ")})`,
          });
        } else {
          toast({
            title: `Place failed`,
            description: r.error ?? "unknown error",
            variant: "destructive",
          });
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast({
          title: "Place failed",
          description: msg,
          variant: "destructive",
        });
      }
    },
    [status, toast],
  );
}
