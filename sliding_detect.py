"""
Multi-scale sliding-window detection.

The original ran at a single scale: resize to 384px, slide 64x64 window.
This works for components that happen to be ~64x64 in the resized image,
but misses anything much bigger or smaller.

This version runs at 3 zoom levels:
  - 256: catches components that fill ~25% of the image
  - 384: default behavior, catches mid-sized components
  - 576: catches small/dense components

All boxes are merged with non-max suppression. Total inference time
is roughly 3x single-scale (6-9 sec on CPU). This helps with
out-of-distribution images where the photographer framed differently
than the FPIC training data.
"""
from __future__ import annotations

import io

try:
    import torch
    import numpy as np
    from PIL import Image
    _DEPS_OK = True
except ImportError:
    _DEPS_OK = False


WORK_SIZES  = [256, 384, 576]
WIN_SIZE    = 64
STRIDE      = 32
SCORE_MIN   = 0.25
NMS_IOU     = 0.30
TOP_K_PER_WIN = 3
MAX_BOXES   = 40


def _iou(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1); iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2); iy2 = min(ay2, by2)
    iw = max(0.0, ix2 - ix1); ih = max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter == 0:
        return 0.0
    a_area = (ax2 - ax1) * (ay2 - ay1)
    b_area = (bx2 - bx1) * (by2 - by1)
    return inter / (a_area + b_area - inter)


def _nms(boxes, iou_thresh=NMS_IOU):
    by_class = {}
    for b in boxes:
        by_class.setdefault(b["class"], []).append(b)
    kept = []
    for cls, items in by_class.items():
        items.sort(key=lambda x: -x["score"])
        survivors = []
        for cand in items:
            ok = True
            for surv in survivors:
                if _iou(cand["box"], surv["box"]) > iou_thresh:
                    ok = False; break
            if ok:
                survivors.append(cand)
        kept.extend(survivors)
    kept.sort(key=lambda x: -x["score"])
    return kept


def _detect_at_scale(img_pil, work_size, adapter, orig_w, orig_h, class_names):
    scale = work_size / max(orig_w, orig_h)
    work_w = max(WIN_SIZE, int(round(orig_w * scale)))
    work_h = max(WIN_SIZE, int(round(orig_h * scale)))
    img_work = img_pil.resize((work_w, work_h), Image.BILINEAR)

    xs = list(range(0, max(1, work_w - WIN_SIZE + 1), STRIDE))
    if xs and xs[-1] != work_w - WIN_SIZE:
        xs.append(work_w - WIN_SIZE)
    if not xs:
        xs = [0]
    ys = list(range(0, max(1, work_h - WIN_SIZE + 1), STRIDE))
    if ys and ys[-1] != work_h - WIN_SIZE:
        ys.append(work_h - WIN_SIZE)
    if not ys:
        ys = [0]

    crops = []
    positions = []
    for y in ys:
        for x in xs:
            crop = img_work.crop((x, y, x + WIN_SIZE, y + WIN_SIZE))
            t = adapter.transform_pil(crop)
            crops.append(t)
            positions.append((x, y))
    if not crops:
        return [], 0

    batch = torch.stack(crops, dim=0).to(adapter.device)
    with torch.no_grad():
        logits = adapter.model(batch)
        probs = torch.sigmoid(logits).cpu().numpy()

    candidates = []
    inv = 1.0 / scale
    for i, (x, y) in enumerate(positions):
        scores = probs[i]
        top_idx = np.argsort(scores)[::-1][:TOP_K_PER_WIN]
        for ci in top_idx:
            s = float(scores[ci])
            if s < SCORE_MIN:
                continue
            ox1 = float(x * inv)
            oy1 = float(y * inv)
            ox2 = float((x + WIN_SIZE) * inv)
            oy2 = float((y + WIN_SIZE) * inv)
            cls = class_names[ci] if ci < len(class_names) else f"class_{ci}"
            candidates.append({
                "box": [ox1, oy1, ox2, oy2],
                "class": cls,
                "score": s,
                "scale": work_size,
            })
    return candidates, len(positions)


def detect_boxes(image_bytes, adapter):
    if not _DEPS_OK or adapter is None:
        return {"error": "deps unavailable", "boxes": []}

    import time
    t0 = time.perf_counter()

    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    orig_w, orig_h = img.size
    class_names = adapter.class_names

    all_candidates = []
    total_windows = 0
    per_scale = {}
    for work_size in WORK_SIZES:
        cands, nwin = _detect_at_scale(img, work_size, adapter, orig_w, orig_h, class_names)
        all_candidates.extend(cands)
        total_windows += nwin
        per_scale[str(work_size)] = {"windows": nwin, "candidates": len(cands)}

    boxes = _nms(all_candidates)
    boxes = boxes[:MAX_BOXES]

    FULL_NAMES = {
        "R": "Resistor", "RN": "Resistor Network", "RA": "Resistor Array",
        "C": "Capacitor", "L": "Inductor", "D": "Diode", "LED": "LED",
        "Q": "Transistor", "QA": "Transistor Array",
        "U": "Integrated Circuit", "IC": "Integrated Circuit",
        "T": "Transformer", "F": "Fuse", "FB": "Ferrite Bead",
        "SW": "Switch", "BTN": "Button",
        "CR": "Crystal", "CRA": "Crystal Array",
        "J": "Connector", "JP": "Jumper", "M": "Module", "P": "Plug",
        "S": "Sensor", "TP": "Test Point", "V": "Voltage Regulator",
    }
    for b in boxes:
        b["box_norm"] = [b["box"][0] / orig_w, b["box"][1] / orig_h,
                         b["box"][2] / orig_w, b["box"][3] / orig_h]
        b["class_full"] = FULL_NAMES.get(b["class"], b["class"])

    return {
        "boxes": boxes,
        "image_size": [orig_w, orig_h],
        "n_windows_evaluated": total_windows,
        "scales": per_scale,
        "model": "MobileNetV3-Small + multi-scale sliding window",
        "inference_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
