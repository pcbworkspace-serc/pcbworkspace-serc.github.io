"""
Inverse kinematics for the SERC 4-DOF pick-and-place arm.

Geometry (matches REVISED_HARDWARE_SERC_UPDATED.docx):

    Base joint (theta_b):     rotates the whole arm around vertical axis Z.
    Shoulder joint (theta_s): rotates the inner arm in the vertical plane.
    Elbow joint (theta_e):    rotates the outer arm relative to the inner arm.
    Wrist joint (theta_w):    rotates the nozzle/part around the tool axis.
                              (Does NOT affect XYZ position; used for part
                              rotation alignment by the bottom camera.)

    Lengths: L1 = shoulder->elbow, L2 = elbow->wrist.
    Heights: SHOULDER_HEIGHT = baseplate -> shoulder axis,
             NOZZLE_OFFSET   = wrist -> nozzle tip.

We assume the wrist axis is held vertical (the nozzle points straight down) for
all pick-and-place moves. That makes the Z component of the target equal to
the vertical position of the wrist joint, and reduces the IK to a planar
2-link problem in the rotated XY plane.

Returns (theta_b, theta_s, theta_e, theta_w) in degrees.
"""
import math
from typing import Tuple, Optional
import config


class IKError(ValueError):
    """Raised when a target is unreachable or violates joint limits."""


def _within(angle_deg: float, limits: Tuple[float, float]) -> bool:
    lo, hi = limits
    return lo - 0.1 <= angle_deg <= hi + 0.1


def ik_xyz(
    x: float,
    y: float,
    z: float,
    wrist_deg: float = 0.0,
    elbow_up: bool = True,
) -> Tuple[float, float, float, float]:
    """
    Compute joint angles for a desired nozzle-tip position (x, y, z) in mm,
    expressed in the robot base frame (Z up, X forward, Y left).

    elbow_up=True picks the elbow-above-the-arm solution (typical for
    overhead pick-and-place), elbow_up=False picks elbow-down.

    Raises IKError if the target is outside the workspace or any joint angle
    exceeds its mechanical limits.
    """
    L1, L2 = config.L1_MM, config.L2_MM

    # Workspace bounds check (cheap reject).
    bx, by, bz = config.WORKSPACE_BOUNDS["x"], config.WORKSPACE_BOUNDS["y"], config.WORKSPACE_BOUNDS["z"]
    if not (bx[0] <= x <= bx[1] and by[0] <= y <= by[1] and bz[0] <= z <= bz[1]):
        raise IKError(
            f"target ({x:.1f}, {y:.1f}, {z:.1f}) outside workspace "
            f"x={bx} y={by} z={bz}"
        )

    # 1. Base rotation: aim the arm at the target in the XY plane.
    theta_b = math.degrees(math.atan2(y, x))

    # Distance from base axis to target in the XY plane.
    r = math.hypot(x, y)

    # Vertical distance from the shoulder axis to the wrist (the wrist is
    # NOZZLE_OFFSET above the target tip because we want the nozzle pointing down).
    z_wrist = z + config.NOZZLE_OFFSET_MM
    h = z_wrist - config.SHOULDER_HEIGHT_MM   # signed; can be negative if target below shoulder

    # 2. 2-link planar IK in the (r, h) plane.
    d2 = r * r + h * h
    d = math.sqrt(d2)
    if d > L1 + L2 - 1e-3:
        raise IKError(f"target too far: distance {d:.1f}mm > reach {L1+L2:.1f}mm")
    if d < abs(L1 - L2) + 1e-3:
        raise IKError(f"target too close: distance {d:.1f}mm < {abs(L1-L2):.1f}mm")

    # 2-link planar IK. Convention:
    #   theta_s = angle of inner arm above horizontal (positive = up)
    #   theta_e = elbow flexion angle. 0 = arm fully extended (outer collinear
    #             with inner). Positive = outer arm folds DOWNWARD relative to
    #             the extended-line. This matches "elbow-up" overhead-pick pose
    #             and keeps theta_e within the printed bracket's 0-150° range.
    #
    # Law of cosines: angle between inner and outer arm at the elbow joint.
    cos_inner = (L1 * L1 + L2 * L2 - d2) / (2.0 * L1 * L2)
    cos_inner = max(-1.0, min(1.0, cos_inner))
    elbow_interior = math.acos(cos_inner)               # 0 = folded, pi = straight
    theta_e = math.degrees(math.pi - elbow_interior)    # 0 = straight, 180 = folded

    # Shoulder: alpha (angle of (r,h) from horizontal) plus or minus beta
    # (angle between inner arm and (r,h) line).
    alpha = math.atan2(h, r)
    cos_beta = (L1 * L1 + d2 - L2 * L2) / (2.0 * L1 * d)
    cos_beta = max(-1.0, min(1.0, cos_beta))
    beta = math.acos(cos_beta)
    theta_s = math.degrees(alpha + (beta if elbow_up else -beta))

    # 3. Wrist: just pass through the requested rotation.
    theta_w = wrist_deg

    # 4. Joint-limit validation.
    angles = (theta_b, theta_s, theta_e, theta_w)
    names  = ("base", "shoulder", "elbow", "wrist")
    for ang, name, lim in zip(angles, names, config.JOINT_LIMITS_DEG):
        if not _within(ang, lim):
            raise IKError(f"{name} angle {ang:.1f}° outside limit {lim}")

    return angles


def fk(theta_b: float, theta_s: float, theta_e: float, theta_w: float = 0.0) -> Tuple[float, float, float]:
    """Forward kinematics. Useful for sanity-checking IK and for status displays."""
    L1, L2 = config.L1_MM, config.L2_MM
    tb, ts, te = map(math.radians, (theta_b, theta_s, theta_e))

    # Inner arm tip (elbow position) in (r, h)
    r1 = L1 * math.cos(ts)
    h1 = L1 * math.sin(ts)

    # Outer arm angle in the (r, h) plane. With theta_e as positive flexion
    # (elbow bending downward from the extended line), the outer arm points
    # at angle (shoulder - elbow) from horizontal.
    outer_angle = ts - te
    r2 = r1 + L2 * math.cos(outer_angle)
    h2 = h1 + L2 * math.sin(outer_angle)

    # Wrist position in 3D
    x = r2 * math.cos(tb)
    y = r2 * math.sin(tb)
    z = h2 + config.SHOULDER_HEIGHT_MM - config.NOZZLE_OFFSET_MM
    return (x, y, z)
