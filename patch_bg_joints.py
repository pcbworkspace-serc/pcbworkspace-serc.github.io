#!/usr/bin/env python3
"""Run from project root: python patch_bg_joints.py
- Baby blue background + brighter grid
- Smoother joint animation (smoothstep easing)
- Visible pivot cylinders at shoulder/elbow/wrist joints"""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WS   = os.path.join(ROOT, "src", "components", "PCBWorkspace.tsx")
content = open(WS, encoding="utf-8").read()

# ── 1. Baby blue background inside Canvas ─────────────────────────────────────
OLD_CAM = '<CameraGrabber targetRef={cameraRef} />'
NEW_CAM = '<color attach="background" args={["#b8dcf0"]} />\n\t<CameraGrabber targetRef={cameraRef} />'
if OLD_CAM not in content:
    print("WARNING: CameraGrabber anchor not found — skipping background")
else:
    content = content.replace(OLD_CAM, NEW_CAM, 1)
    print("  background colour set")

# ── 2. Brighter grid lines that show on baby blue ─────────────────────────────
content = (content
    .replace('cellColor="#005588"',    'cellColor="#6aaed4"')
    .replace('sectionColor="#0077aa"', 'sectionColor="#3080b8"'))
print("  grid updated")

# ── 3. Add smoothstep easing + visible joint pivots to the arm ────────────────
# Replace the plain lerp / pp helpers inside RobotArmVisualization
OLD_LERP = (
    '  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));\n'
    '  const pp   = (t: number, s: number, e: number) =>\n'
    '    Math.max(0, Math.min(1, (t - s) / (e - s)));'
)
NEW_LERP = (
    '  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));\n'
    '  // smoothstep gives ease-in/out so joints accelerate and decelerate naturally\n'
    '  const ss   = (t: number) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };\n'
    '  const pp   = (t: number, s: number, e: number) => ss((t - s) / Math.max(0.0001, e - s));'
)
if OLD_LERP in content:
    content = content.replace(OLD_LERP, NEW_LERP, 1)
    print("  smoothstep easing added")
else:
    print("  WARNING: lerp/pp anchor not found — easing skipped")

# ── 4. Add visible pivot rings at shoulder, elbow, wrist ─────────────────────
# Insert a pivot ring right after the J1 motor block (before the J1 group)
OLD_J1_GROUP = '      {/* J1 motor block at shoulder */}\n      <group position={SHOULDER}>\n        <MotorBlock w={0.22} />\n      </group>'
NEW_J1_GROUP = (
    '      {/* J1 motor block at shoulder */}\n'
    '      <group position={SHOULDER}>\n'
    '        <MotorBlock w={0.22} />\n'
    '        {/* Shoulder pivot ring — shows the rotation axis */}\n'
    '        <mesh rotation={[0, 0, Math.PI / 2]}>\n'
    '          <cylinderGeometry args={[0.09, 0.09, 0.32, 16]} />\n'
    '          <meshStandardMaterial color="#2c4a6e" metalness={0.94} roughness={0.1} />\n'
    '        </mesh>\n'
    '      </group>'
)
if OLD_J1_GROUP in content:
    content = content.replace(OLD_J1_GROUP, NEW_J1_GROUP, 1)
    print("  shoulder pivot ring added")
else:
    print("  WARNING: J1 motor block anchor not found")

# Elbow pivot ring — insert after the J2 motor block definition inside j1Ref
OLD_J2_BLOCK = '        {/* J2 motor block at elbow */}\n        <group position={[L1, 0, 0]}>\n          <MotorBlock w={0.19} />\n        </group>'
NEW_J2_BLOCK = (
    '        {/* J2 motor block at elbow */}\n'
    '        <group position={[L1, 0, 0]}>\n'
    '          <MotorBlock w={0.19} />\n'
    '          {/* Elbow pivot ring */}\n'
    '          <mesh rotation={[0, 0, Math.PI / 2]}>\n'
    '            <cylinderGeometry args={[0.08, 0.08, 0.28, 16]} />\n'
    '            <meshStandardMaterial color="#2c4a6e" metalness={0.94} roughness={0.1} />\n'
    '          </mesh>\n'
    '        </group>'
)
if OLD_J2_BLOCK in content:
    content = content.replace(OLD_J2_BLOCK, NEW_J2_BLOCK, 1)
    print("  elbow pivot ring added")
else:
    print("  WARNING: J2 motor block anchor not found")

# Wrist pivot ring — inside the wrist housing group
OLD_WRIST = '            {/* Wrist U-brackets */}'
NEW_WRIST = (
    '            {/* Wrist pivot ring */}\n'
    '            <mesh rotation={[0, 0, Math.PI / 2]}>\n'
    '              <cylinderGeometry args={[0.07, 0.07, 0.24, 14]} />\n'
    '              <meshStandardMaterial color="#2c4a6e" metalness={0.94} roughness={0.1} />\n'
    '            </mesh>\n'
    '            {/* Wrist U-brackets */}'
)
if OLD_WRIST in content:
    content = content.replace(OLD_WRIST, NEW_WRIST, 1)
    print("  wrist pivot ring added")
else:
    print("  WARNING: wrist U-bracket anchor not found")

open(WS, "w", encoding="utf-8").write(content)
print("\nDone! Vite will hot-reload.")
