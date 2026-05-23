/**
 * pixelToWorld — placeholder transform mapping camera pixels to PCB-mm world coords.
 *
 * TODO(backend): replace with the real 3x3 homography computed by the calibration wizard.
 * The frontend already collects 4 corner clicks in CalibrationModal and POSTs them; once
 * the Flask backend exposes /calibration/save + /calibration/apply, we fetch the matrix
 * and apply it here. Until then, we assume:
 *   - Camera looks straight down at the workstation
 *   - Camera frame width covers ~120mm of physical space
 *   - World origin (0,0) is the image center
 *
 * This is INACCURATE but lets the pipeline run end-to-end so the team can validate
 * the rest of the flow while the calibration backend is built.
 */
export interface PixelPoint { x: number; y: number; }
export interface WorldPoint { x_mm: number; y_mm: number; }

const ASSUMED_WORKSPACE_WIDTH_MM = 120;
const ASSUMED_WORKSPACE_HEIGHT_MM = 90;

export function pixelToWorld(
  pixel: PixelPoint,
  imageWidth: number,
  imageHeight: number,
): WorldPoint {
  // Center-origin, scale to mm
  const cx = imageWidth / 2;
  const cy = imageHeight / 2;
  const scaleX = ASSUMED_WORKSPACE_WIDTH_MM / imageWidth;
  const scaleY = ASSUMED_WORKSPACE_HEIGHT_MM / imageHeight;
  return {
    x_mm: (pixel.x - cx) * scaleX,
    // Flip Y because image Y grows downward, world Y grows up
    y_mm: -(pixel.y - cy) * scaleY,
  };
}

/** Convenience: bbox center to world coords. */
export function bboxCenterToWorld(
  bbox: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
): WorldPoint {
  const [x, y, w, h] = bbox;
  return pixelToWorld({ x: x + w / 2, y: y + h / 2 }, imageWidth, imageHeight);
}