"""Parametric 2R + Z + theta layout for MiniMEE (millimetres).

This is a kinematic envelope, not a printable or dimensionally approved joint.
The default link lengths mirror config.py so the proposed geometry can be
reviewed against the current software; neither length has been measured from
an assembled robot.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import cadquery as cq


def tool_xy(link1: float, link2: float, theta1: float, theta2: float):
    a = math.radians(theta1)
    b = math.radians(theta1 + theta2)
    elbow = (link1 * math.cos(a), link1 * math.sin(a))
    tool = (elbow[0] + link2 * math.cos(b), elbow[1] + link2 * math.sin(b))
    return elbow, tool


def link(length: float, width: float, z: float, x: float, y: float, angle: float):
    return (cq.Workplane("XY")
            .box(length, width, 8)
            .translate((length / 2, 0, z))
            .rotate((0, 0, 0), (0, 0, 1), angle)
            .translate((x, y, 0)))


def build(link1: float, link2: float, theta1: float, theta2: float):
    if min(link1, link2) <= 0:
        raise ValueError("link lengths must be positive")
    elbow, tool = tool_xy(link1, link2, theta1, theta2)
    assembly = cq.Assembly(name="minimee_scara_layout")
    assembly.add(cq.Workplane("XY").box(120, 120, 12).translate((0, 0, -6)),
                 name="base_envelope", color=cq.Color(0.3, 0.4, 0.5))
    assembly.add(cq.Workplane("XY").circle(20).extrude(55),
                 name="joint1_axis_envelope", color=cq.Color(0.3, 0.4, 0.5))
    assembly.add(link(link1, 35, 55, 0, 0, theta1),
                 name="link1_center_distance", color=cq.Color(0.2, 0.6, 0.8))
    assembly.add(cq.Workplane("XY").circle(20).extrude(20).translate((*elbow, 55)),
                 name="joint2_axis_envelope", color=cq.Color(0.3, 0.4, 0.5))
    assembly.add(link(link2, 30, 75, *elbow, theta1 + theta2),
                 name="link2_center_distance", color=cq.Color(0.2, 0.7, 0.5))
    assembly.add(cq.Workplane("XY").box(30, 30, 60).translate((*tool, 75)),
                 name="z_guide_envelope", color=cq.Color(0.8, 0.6, 0.2))
    assembly.add(cq.Workplane("XY").circle(6).extrude(55).translate((*tool, 10)),
                 name="rotating_nozzle_axis", color=cq.Color(0.8, 0.3, 0.2))
    return assembly, elbow, tool


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--link1", type=float, default=150)
    parser.add_argument("--link2", type=float, default=180)
    parser.add_argument("--theta1", type=float, default=0)
    parser.add_argument("--theta2", type=float, default=60)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("scara_layout.step"))
    args = parser.parse_args()
    assembly, elbow, tool = build(args.link1, args.link2, args.theta1, args.theta2)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    assembly.save(str(args.output))
    print(json.dumps({"step": str(args.output), "units": "mm", "link1": args.link1,
                      "link2": args.link2, "theta1_deg": args.theta1,
                      "theta2_deg": args.theta2, "elbow_xy": elbow, "tool_xy": tool}))


if __name__ == "__main__":
    main()
