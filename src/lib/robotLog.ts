/**
 * robotLog Ã¢â‚¬â€ tiny pub/sub bus so any part of the app can push activity into
 * the bottom-left Robot panel's chat log without prop-drilling.
 *
 * Usage:
 *   import { robotLog } from "@/lib/robotLog";
 *   robotLog.emit("info", "Placing Resistor at (30, 20)...");
 *
 *   // In the panel:
 *   useEffect(() => robotLog.subscribe(({ kind, text }) => append({ kind, text })), []);
 */
export type RobotLogKind = "info" | "error" | "user";
export interface RobotLogEvent { kind: RobotLogKind; text: string }

type Listener = (e: RobotLogEvent) => void;
const listeners = new Set<Listener>();

export const robotLog = {
  emit(kind: RobotLogKind, text: string) {
    const evt: RobotLogEvent = { kind, text };
    for (const fn of listeners) {
      try { fn(evt); } catch { /* ignore listener errors */ }
    }
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};