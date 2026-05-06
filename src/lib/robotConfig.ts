/**
 * Robot configuration constants.
 *
 * The 3D PCB scene in PCBWorkspace.tsx uses Three.js scene units, not mm.
 * The board geometry is currently a 6.2 × 4.2 unit rectangle. To map drag-drop
 * positions to physical PCB millimetres we need a conversion factor.
 *
 * The user-confirmed PCB size is 50 × 30 mm. Note that the scene aspect
 * (6:4 = 1.5) does NOT match the PCB aspect (50:30 = 1.667), so the scene
 * is currently slightly distorted. Fix that later by changing the FR-4
 * substrate boxGeometry to [5.0, 0.06, 3.0] in PCBWorkspace.tsx — for now
 * we just use independent X/Z scale factors.
 */
export const ROBOT_BASE_URL =
  (import.meta.env.VITE_ROBOT_URL as string | undefined) ??
  "http://localhost:5000";

// Physical PCB dimensions
export const PCB_WIDTH_MM = 50;   // X axis
export const PCB_HEIGHT_MM = 30;  // Y axis (PCB-local frame; +Y away from operator)

// Three.js scene extents for the board (matches PCBWorkspace.tsx geometry).
// The scene has X in [-3, +3] (6 units total) and Z in [-2, +2] (4 units total).
export const SCENE_X_MIN = -3;
export const SCENE_X_MAX = +3;
export const SCENE_Z_MIN = -2;
export const SCENE_Z_MAX = +2;

/**
 * Convert a drag-drop position in scene coordinates to PCB-local mm.
 *
 * Scene origin is the board centre. PCB-local origin (what the backend
 * expects) is the bottom-left corner: (0,0) at lower-left, (50, 30) at
 * upper-right.
 */
export function sceneToPcbMm(sceneX: number, sceneZ: number): { x_pcb: number; y_pcb: number } {
  // Normalize to 0..1 across the board.
  const u = (sceneX - SCENE_X_MIN) / (SCENE_X_MAX - SCENE_X_MIN);
  // Three.js Z axis points TOWARD the camera by default; the existing
  // handleDrop in PCBWorkspace flips Y from screen-down to scene-Z, so
  // larger sceneZ corresponds to smaller PCB Y (closer to operator).
  // Match that convention: scene Z_min -> PCB y_max.
  const v = (SCENE_Z_MAX - sceneZ) / (SCENE_Z_MAX - SCENE_Z_MIN);

  return {
    x_pcb: u * PCB_WIDTH_MM,
    y_pcb: v * PCB_HEIGHT_MM,
  };
}

/**
 * Inverse: PCB-mm to scene units. Useful when the backend reports a
 * placement and we want to draw it on the 3D view.
 */
export function pcbMmToScene(x_pcb: number, y_pcb: number): { x: number; z: number } {
  const u = x_pcb / PCB_WIDTH_MM;
  const v = y_pcb / PCB_HEIGHT_MM;
  return {
    x: SCENE_X_MIN + u * (SCENE_X_MAX - SCENE_X_MIN),
    z: SCENE_Z_MAX - v * (SCENE_Z_MAX - SCENE_Z_MIN),
  };
}

/** Default feeder pickup location in robot base-frame mm. Edit per your setup. */
export const DEFAULT_PICK_FROM = {
  x: parseFloat(import.meta.env.VITE_FEEDER_X ?? "50"),
  y: parseFloat(import.meta.env.VITE_FEEDER_Y ?? "-120"),
  z: parseFloat(import.meta.env.VITE_FEEDER_Z ?? "12.5"),
};
