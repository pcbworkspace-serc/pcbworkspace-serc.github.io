"""
Adapter that makes the trained MobileNetV3 from the multi-label
classification project (pcb_classifier/) usable inside the Flask app.

The live app expects PCBVisionSystem with infer_detect / infer_align /
infer_validate methods, but those were a different (untrained) experimental
model. This adapter wraps your real trained MobileNetV3 from
pcb_classifier/runs/mobilenet_v3/best.pt and exposes the same surface,
so flask_server.py can call it without other changes.

What the adapter exposes:
  - load_classifier(checkpoint_path, classes_path) -> ClassifierAdapter
  - ClassifierAdapter.infer_detect(tensor) -> dict with 25 sigmoid scores
  - ClassifierAdapter.infer_align(tensor)  -> dict (placeholder; align is
    a separate task the paper deliberately scoped out)
  - ClassifierAdapter.infer_validate(tensor) -> dict (placeholder)

Where to put the checkpoint:
  Option A — copy best.pt into the Flask folder:
    Copy-Item "C:\\Users\\ramallis\\Pictures\\MY-CAM\\SERC\\pcb_classifier\\runs\\mobilenet_v3\\best.pt" \\
              "C:\\Users\\ramallis\\Pictures\\MY-CAM\\SERC\\pcb-extracted\\pcbworkspace-serc.github.io-main_old\\classifier_best.pt"
  Option B — set CLASSIFIER_CHECKPOINT env var to the full path.

Class-name file (classes.json from the run dir) is found the same way.
"""
from __future__ import annotations

import io
import json
import os
import time
from pathlib import Path
from typing import Optional

try:
    import torch
    import torch.nn as nn
    from torchvision import models, transforms as T
    from PIL import Image
    _DEPS_OK = True
except ImportError:
    _DEPS_OK = False


# ImageNet normalization — matches what train.py used
_NORMALIZE_MEAN = (0.485, 0.456, 0.406)
_NORMALIZE_STD  = (0.229, 0.224, 0.225)
_IMAGE_SIZE = 64  # matches configs/cpu.yaml


def _build_mobilenet(num_classes: int, dropout: float = 0.3) -> "nn.Module":
    """Identical architecture to pcb_classifier/src/models.py build_mobilenet_v3."""
    model = models.mobilenet_v3_small(weights=None)  # weights loaded from checkpoint
    in_features = model.classifier[-1].in_features
    model.classifier[-1] = nn.Linear(in_features, num_classes)
    if isinstance(model.classifier[2], nn.Dropout):
        model.classifier[2].p = dropout
    return model


def _default_class_names() -> list[str]:
    """Fallback class names if classes.json isn't found.

    The paper documents these as class_0..class_24 in colour-palette order.
    Best-guess display labels are added where defensible.
    """
    return [f"class_{i}" for i in range(25)]


class ClassifierAdapter:
    """Wraps the trained MobileNetV3 with a JEPA-compatible API."""

    def __init__(
        self,
        model: "nn.Module",
        class_names: list[str],
        device: "torch.device",
        image_size: int = _IMAGE_SIZE,
    ):
        self.model = model.to(device).eval()
        self.class_names = class_names
        self.device = device
        self.image_size = image_size
        self._transform = T.Compose([
            T.Resize((image_size, image_size)),
            T.ToTensor(),
            T.Normalize(mean=_NORMALIZE_MEAN, std=_NORMALIZE_STD),
        ])

    def parameters(self):
        """For sum(p.numel()) compatibility with /nn/status."""
        return self.model.parameters()

    @torch.no_grad()
    def infer_detect(self, x: "torch.Tensor", top_k: int = 10) -> dict:
        """Multi-label detection on a single image tensor.

        Returns:
            {
              "predictions": [
                {"class": "class_21", "score": 0.92, "above_threshold": True},
                ...
              ],
              "num_classes": 25,
              "model": "MobileNetV3-Small",
              "trained": True,
            }
        """
        if x.ndim == 3:
            x = x.unsqueeze(0)
        x = x.to(self.device)
        logits = self.model(x)
        probs = torch.sigmoid(logits)[0].cpu().numpy()  # shape (num_classes,)

        # Sort by score, return top-K
        idx_sorted = probs.argsort()[::-1][:top_k]
        predictions = [
            {
                "class": self.class_names[i] if i < len(self.class_names) else f"class_{i}",
                "score": float(probs[i]),
                "above_threshold": bool(probs[i] >= 0.5),
            }
            for i in idx_sorted
        ]

        return {
            "predictions": predictions,
            "num_classes": len(self.class_names),
            "model": "MobileNetV3-Small (trained, multi-label)",
            "trained": True,
        }

    @torch.no_grad()
    def infer_align(self, x: "torch.Tensor") -> dict:
        """Placeholder. Alignment was scoped out of the paper experiment.

        Returns a "not available" indicator instead of random output, so the
        UI can render an honest "alignment not implemented" message rather
        than fake numbers.
        """
        return {
            "available": False,
            "reason": "Alignment head is not part of the trained classifier. The paper "
                      "narrows scope to multi-label classification only.",
            "rotation_deg": None,
            "offset_xy_mm": None,
        }

    @torch.no_grad()
    def infer_validate(self, x: "torch.Tensor") -> dict:
        """Placeholder. Validation (post-placement check) is also out of scope."""
        return {
            "available": False,
            "reason": "Validation head is not part of the trained classifier.",
            "ok": None,
            "confidence": None,
        }

    def transform_pil(self, img: "Image.Image") -> "torch.Tensor":
        return self._transform(img.convert("RGB"))


def load_classifier(
    checkpoint_path: Optional[str] = None,
    classes_path: Optional[str] = None,
    device: Optional["torch.device"] = None,
) -> Optional[ClassifierAdapter]:
    """Try to load the trained classifier. Return None if not available.

    Falls back gracefully if torch isn't installed, the checkpoint file isn't
    found, or the classes.json isn't found. flask_server.py can use the
    return value's truthiness to decide whether to use the trained model
    or its previous JEPA stub.
    """
    if not _DEPS_OK:
        return None

    here = Path(__file__).parent

    # Resolve checkpoint path: env var > arg > default location
    ckpt = (
        os.environ.get("CLASSIFIER_CHECKPOINT")
        or checkpoint_path
        or str(here / "classifier_best.pt")
    )
    if not Path(ckpt).exists():
        # Also try the original location in pcb_classifier/runs/...
        orig = here.parent.parent.parent / "pcb_classifier" / "runs" / "mobilenet_v3" / "best.pt"
        if orig.exists():
            ckpt = str(orig)
        else:
            print(f"  [classifier] checkpoint not found at {ckpt}; classifier disabled")
            return None

    # Resolve classes.json
    classes_file = (
        os.environ.get("CLASSIFIER_CLASSES")
        or classes_path
        or str(Path(ckpt).parent / "classes.json")
    )
    class_names = _default_class_names()
    if Path(classes_file).exists():
        try:
            data = json.loads(Path(classes_file).read_text())
            if isinstance(data, dict) and "classes" in data:
                class_names = data["classes"]
            elif isinstance(data, list):
                class_names = data
        except Exception as e:
            print(f"  [classifier] couldn't parse {classes_file}: {e}; using default names")

    device = device or torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = _build_mobilenet(num_classes=len(class_names))

    # The training code saved a plain state_dict via torch.save(state, "best.pt")
    state = torch.load(ckpt, map_location=device, weights_only=True)
    if isinstance(state, dict) and "model_state" in state:
        # In case it was saved with a wrapper dict
        state = state["model_state"]
    model.load_state_dict(state)

    print(f"  [classifier] loaded MobileNetV3 from {ckpt} ({len(class_names)} classes)")
    return ClassifierAdapter(model, class_names, device)


__all__ = ["ClassifierAdapter", "load_classifier"]
