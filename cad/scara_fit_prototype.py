"""Print a hand-operated SCARA reach mockup and configurable motor-face coupons.

Units: millimetres. No bearings, motor coupling, Z actuator, or load capacity.
The linkage is for checking board/feeder reach and collisions by hand only.
Do not attach motors or issue firmware commands to these printed parts.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cadquery as cq


def link(center_distance: float, width: float = 30, thickness: float = 8,
         pivot_diameter: float = 5.4) -> cq.Workplane:
    """Capsule with pivots exactly center_distance apart."""
    if center_distance <= width or pivot_diameter >= width:
        raise ValueError("link must be longer than its width and contain the pivot holes")
    return (cq.Workplane("XY").center(center_distance / 2, 0)
            .slot2D(center_distance + width, width).extrude(thickness)
            .faces(">Z").workplane().pushPoints([(-center_distance / 2, 0),
                                                   (center_distance / 2, 0)])
            .hole(pivot_diameter))


def base(pivot_diameter: float = 5.4) -> cq.Workplane:
    # No mounting holes: bench/fixture attachment depends on the actual table.
    return (cq.Workplane("XY").box(90, 90, 8, centered=(True, True, False))
            .faces(">Z").workplane().hole(pivot_diameter))


def spacer(pivot_diameter: float = 5.4) -> cq.Workplane:
    return cq.Workplane("XY").circle(10).circle(pivot_diameter / 2).extrude(8)


def motor_coupon(face: float, pattern: float, pilot: float, hole: float = 3.4,
                 thickness: float = 5) -> cq.Workplane:
    """Four-hole square motor-face gauge; measure the actual motor first."""
    if min(face, pattern, pilot, hole, thickness) <= 0 or pattern >= face:
        raise ValueError("invalid motor interface dimensions")
    if pattern * math.sqrt(2) - hole <= pilot:
        raise ValueError("bolt holes overlap pilot opening")
    points = [(x * pattern / 2, y * pattern / 2)
              for x in (-1, 1) for y in (-1, 1)]
    return (cq.Workplane("XY").rect(face + 12, face + 12).extrude(thickness)
            .faces(">Z").workplane().hole(pilot)
            .faces(">Z").workplane().pushPoints(points).hole(hole))


def build(args: argparse.Namespace):
    parts = {
        "base_reach_mockup": base(args.pivot_diameter),
        "link1_reach_mockup": link(args.link1, pivot_diameter=args.pivot_diameter),
        "link2_reach_mockup": link(args.link2, pivot_diameter=args.pivot_diameter),
        "elbow_spacer_reach_mockup": spacer(args.pivot_diameter),
        "nema17_face_gauge": motor_coupon(args.nema17_face, args.nema17_pattern,
                                          args.nema17_pilot, args.nema17_hole),
        "nema14_face_gauge": motor_coupon(args.nema14_face, args.nema14_pattern,
                                          args.nema14_pilot, args.nema14_hole),
    }
    return parts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--link1", type=float, default=150)
    parser.add_argument("--link2", type=float, default=180)
    parser.add_argument("--pivot-diameter", type=float, default=5.4)
    # Illustrative face-gauge defaults only; use the exact motor drawing before printing.
    parser.add_argument("--nema17-face", type=float, default=42)
    parser.add_argument("--nema17-pattern", type=float, default=31)
    parser.add_argument("--nema17-pilot", type=float, default=22)
    parser.add_argument("--nema17-hole", type=float, default=3.4)
    parser.add_argument("--nema14-face", type=float, default=35)
    parser.add_argument("--nema14-pattern", type=float, default=26)
    parser.add_argument("--nema14-pilot", type=float, default=22)
    parser.add_argument("--nema14-hole", type=float, default=3.4)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("fit_prototype"))
    args = parser.parse_args()
    parts = build(args)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, shape in parts.items():
        cq.exporters.export(shape, str(args.output / f"{name}.step"))
        cq.exporters.export(shape, str(args.output / f"{name}.stl"), tolerance=0.08,
                            angularTolerance=0.12)
    (args.output / "parameters.json").write_text(json.dumps({
        k: v for k, v in vars(args).items() if k != "output"}, indent=2) + "\n")
    print(f"Exported {len(parts)} parts to {args.output}")


if __name__ == "__main__":
    main()
