#!/usr/bin/env python3
"""Run from project root: python patch_real_arm.py
Full SCARA arm with IK, Z-axis up/down, Juki nozzle, and component pick-and-place animation."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WS   = os.path.join(ROOT, "src", "components", "PCBWorkspace.tsx")

content = open(WS, encoding="utf-8").read()

START = "// ── 3D Robot Arm with IK"
END   = "function pinWorldPosition"

si = content.find(START)
ei = content.find(END, si if si != -1 else 0)

# Also try the earlier label from patch_robot_arm
if si == -1:
    START = "// ── 3D SCARA Robot Arm with IK"
    si = content.find(START)

if si == -1 or ei == -1:
    print("ERROR: cannot find arm component boundaries"); sys.exit(1)

NEW_ARM = r"""
// ── Full SCARA arm: IK + Z-axis pick/place + Juki nozzle + held component ────
function RobotArmVisualization({
  previewItems,
}: {
  previewItems: { x: number; y: number; rotation_deg: number; type?: string }[] | undefined;
}) {
  // Animated joint refs
  const j1Ref      = useRef<THREE.Group>(null);   // shoulder rotates in XZ
  const j2Ref      = useRef<THREE.Group>(null);   // elbow rotates in XZ
  const zRodRef    = useRef<THREE.Group>(null);   // Z-axis slides up/down
  const compRef    = useRef<THREE.Group>(null);   // held component (shown/hidden)
  const glowRef    = useRef<THREE.Mesh>(null);    // vacuum-tip glow
  const progressRef = useRef(0);

  // Arm dimensions (scene units — 1 unit ≈ 10 mm)
  const L1        = 3.2;   // shoulder → elbow
  const L2        = 2.8;   // elbow → wrist
  const Z_STROKE  = 0.35;  // Z-axis travel (retracted → extended)

  // Fixed positions
  const BASE:     [number, number, number] = [ 0,   0,   -5.0];
  const SHOULDER: [number, number, number] = [ 0,   1.2, -5.0];
  const SUPPLY:   [number, number, number] = [-2.5, 1.2, -4.0]; // component feeder

  // Place target from last preview waypoint
  const placeWP = useMemo<[number, number, number]>(() => {
    if (!previewItems || previewItems.length === 0) return [...SHOULDER];
    const last = previewItems[previewItems.length - 1];
    return [last.x, SHOULDER[1], last.y];
  }, [previewItems]);

  const componentType = previewItems?.[0]?.type ?? "Resistor";

  // 2-joint planar IK (returns [theta1, theta2] for j1 and j2 rotation.y)
  const solveIK = (tx: number, tz: number): [number, number] => {
    const dx  = tx - SHOULDER[0];
    const ndz = -(tz - SHOULDER[2]);
    const d   = Math.sqrt(dx * dx + ndz * ndz);
    const cd  = Math.min(d, L1 + L2 - 0.01);
    const sc  = d > 0.001 ? cd / d : 1;
    const c2  = (cd * cd - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const t2  = -Math.acos(Math.max(-1, Math.min(1, c2)));
    const t1  = Math.atan2(ndz * sc, dx * sc)
              - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
    return [t1, t2];
  };

  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  const pp   = (t: number, s: number, e: number) => Math.max(0, Math.min(1, (t - s) / (e - s)));

  useFrame((_, delta) => {
    if (!j1Ref.current || !j2Ref.current || !zRodRef.current) return;

    progressRef.current = (progressRef.current + delta * 0.22) % 1;
    const T = progressRef.current;

    // ── Phase boundaries ──────────────────────────────────────────────────────
    // [0.00-0.14] transit home  → supply (XY only, Z retracted)
    // [0.14-0.24] Z extends down at supply (PICK)
    // [0.24-0.31] hold + vacuum ON  (component attaches)
    // [0.31-0.41] Z retracts at supply
    // [0.41-0.68] transit supply → place  (XY, Z retracted, component held)
    // [0.68-0.78] Z extends down at place (PLACE)
    // [0.78-0.85] hold + vacuum OFF (component releases to board)
    // [0.85-0.94] Z retracts at place
    // [0.94-1.00] return to home

    let tx = SHOULDER[0], tz = SHOULDER[2], zExt = 0, holding = false;

    if (T < 0.14) {
      const p = pp(T, 0, 0.14);
      tx = lerp(SHOULDER[0], SUPPLY[0], p);
      tz = lerp(SHOULDER[2], SUPPLY[2], p);
    } else if (T < 0.24) {
      tx = SUPPLY[0]; tz = SUPPLY[2]; zExt = pp(T, 0.14, 0.24);
    } else if (T < 0.31) {
      tx = SUPPLY[0]; tz = SUPPLY[2]; zExt = 1; holding = true;
    } else if (T < 0.41) {
      tx = SUPPLY[0]; tz = SUPPLY[2]; zExt = lerp(1, 0, pp(T, 0.31, 0.41)); holding = true;
    } else if (T < 0.68) {
      const p = pp(T, 0.41, 0.68);
      tx = lerp(SUPPLY[0], placeWP[0], p);
      tz = lerp(SUPPLY[2], placeWP[2], p);
      holding = true;
    } else if (T < 0.78) {
      tx = placeWP[0]; tz = placeWP[2]; zExt = pp(T, 0.68, 0.78); holding = true;
    } else if (T < 0.85) {
      tx = placeWP[0]; tz = placeWP[2]; zExt = 1; holding = false;
    } else if (T < 0.94) {
      tx = placeWP[0]; tz = placeWP[2]; zExt = lerp(1, 0, pp(T, 0.85, 0.94));
    } else {
      const p = pp(T, 0.94, 1.0);
      tx = lerp(placeWP[0], SHOULDER[0], p);
      tz = lerp(placeWP[2], SHOULDER[2], p);
    }

    // Apply IK to shoulder + elbow
    const [t1, t2] = solveIK(tx, tz);
    j1Ref.current.rotation.y = t1;
    j2Ref.current.rotation.y = t2;

    // Z-axis slide
    zRodRef.current.position.y = -zExt * Z_STROKE;

    // Component visibility
    if (compRef.current)  compRef.current.visible  = holding;

    // Nozzle glow  
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = zExt > 0.5 ? 9 : (holding ? 6 : 3.5);
    }
  });

  if (!previewItems || previewItems.length === 0) return null;

  // Z-housing bottom offset from shoulder plane  
  const HB = -0.35;  // housing bottom y-offset from wrist
  // Nozzle tip, relative to zRodRef origin = 0
  const NT = -0.82;

  return (
    <>
      {/* ── Feeder tray at supply position ─────────────────────────────────── */}
      <mesh position={[SUPPLY[0], 0.04, SUPPLY[2]]}>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <meshStandardMaterial color="#1e3a5f" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[SUPPLY[0], 0.09, SUPPLY[2]]}>
        <boxGeometry args={[0.38, 0.04, 0.38]} />
        <meshStandardMaterial color="#f59e0b" metalness={0.5} roughness={0.6} />
      </mesh>

      {/* ── Robot base plate ───────────────────────────────────────────────── */}
      <mesh position={[BASE[0], 0.04, BASE[2]]}>
        <cylinderGeometry args={[0.44, 0.52, 0.08, 18]} />
        <meshStandardMaterial color="#0f172a" metalness={0.95} roughness={0.12} />
      </mesh>

      {/* Column */}
      <mesh position={[BASE[0], 0.66, BASE[2]]}>
        <cylinderGeometry args={[0.09, 0.11, 1.2, 12]} />
        <meshStandardMaterial color="#1e293b" metalness={0.9} roughness={0.2} />
      </mesh>

      {/* J1 motor housing (shoulder) */}
      <mesh position={[BASE[0], 1.2, BASE[2]]}>
        <boxGeometry args={[0.28, 0.26, 0.28]} />
        <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.18} />
      </mesh>
      <mesh position={[BASE[0], 1.2, BASE[2]]} rotation={[0, 0, Math.PI/2]}>
        <cylinderGeometry args={[0.14, 0.14, 0.29, 14]} />
        <meshStandardMaterial color="#1e293b" metalness={0.88} roughness={0.22} />
      </mesh>

      {/* ── J1: shoulder rotation group ──────────────────────────────────── */}
      <group ref={j1Ref} position={SHOULDER}>

        {/* Link 1 body */}
        <mesh position={[L1/2, 0, 0]}>
          <boxGeometry args={[L1 - 0.16, 0.115, 0.095]} />
          <meshStandardMaterial color="#dc2626" metalness={0.78} roughness={0.28} />
        </mesh>
        {/* Link 1 end caps (rounded look) */}
        <mesh position={[0.08, 0, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.095, 12]} />
          <meshStandardMaterial color="#991b1b" metalness={0.82} roughness={0.22} />
        </mesh>
        <mesh position={[L1 - 0.08, 0, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.07, 0.07, 0.095, 12]} />
          <meshStandardMaterial color="#991b1b" metalness={0.82} roughness={0.22} />
        </mesh>

        {/* J2 motor housing (elbow) */}
        <mesh position={[L1, 0, 0]}>
          <boxGeometry args={[0.26, 0.24, 0.26]} />
          <meshStandardMaterial color="#0f172a" metalness={0.9} roughness={0.18} />
        </mesh>
        <mesh position={[L1, 0, 0]} rotation={[0, 0, Math.PI/2]}>
          <cylinderGeometry args={[0.13, 0.13, 0.27, 14]} />
          <meshStandardMaterial color="#1e293b" metalness={0.88} roughness={0.22} />
        </mesh>

        {/* ── J2: elbow rotation group ───────────────────────────────────── */}
        <group ref={j2Ref} position={[L1, 0, 0]}>

          {/* Link 2 body */}
          <mesh position={[L2/2, 0, 0]}>
            <boxGeometry args={[L2 - 0.14, 0.095, 0.08]} />
            <meshStandardMaterial color="#b91c1c" metalness={0.78} roughness={0.28} />
          </mesh>
          {/* Link 2 end caps */}
          <mesh position={[0.07, 0, 0]} rotation={[0, 0, Math.PI/2]}>
            <cylinderGeometry args={[0.058, 0.058, 0.08, 12]} />
            <meshStandardMaterial color="#7f1d1d" metalness={0.82} roughness={0.22} />
          </mesh>
          <mesh position={[L2 - 0.07, 0, 0]} rotation={[0, 0, Math.PI/2]}>
            <cylinderGeometry args={[0.058, 0.058, 0.08, 12]} />
            <meshStandardMaterial color="#7f1d1d" metalness={0.82} roughness={0.22} />
          </mesh>

          {/* ── Wrist + Z-axis assembly ──────────────────────────────────── */}
          <group position={[L2, 0, 0]}>

            {/* Z-axis housing box */}
            <mesh position={[0, -0.15, 0]}>
              <boxGeometry args={[0.18, 0.3, 0.18]} />
              <meshStandardMaterial color="#1e293b" metalness={0.88} roughness={0.2} />
            </mesh>
            {/* Housing detail ring */}
            <mesh position={[0, -0.04, 0]}>
              <cylinderGeometry args={[0.1, 0.1, 0.04, 12]} />
              <meshStandardMaterial color="#374151" metalness={0.85} roughness={0.25} />
            </mesh>

            {/* ── Z-axis sliding group (ref: zRodRef) ───────────────────── */}
            <group ref={zRodRef}>

              {/* Linear guide rod (silver) */}
              <mesh position={[0, HB - 0.1, 0]}>
                <cylinderGeometry args={[0.038, 0.038, 0.55, 10]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.94} roughness={0.1} />
              </mesh>

              {/* Pneumatic tube connector */}
              <mesh position={[0.06, HB - 0.06, 0]}>
                <cylinderGeometry args={[0.018, 0.018, 0.1, 8]} />
                <meshStandardMaterial color="#4b5563" metalness={0.8} roughness={0.3} />
              </mesh>

              {/* Nozzle coupler block */}
              <mesh position={[0, HB - 0.38, 0]}>
                <cylinderGeometry args={[0.052, 0.044, 0.12, 10]} />
                <meshStandardMaterial color="#64748b" metalness={0.88} roughness={0.14} />
              </mesh>

              {/* Juki nozzle shaft */}
              <mesh position={[0, HB - 0.52, 0]}>
                <cylinderGeometry args={[0.024, 0.032, 0.14, 10]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.92} roughness={0.08} />
              </mesh>

              {/* Nozzle cup (the actual vacuum contact point) */}
              <mesh position={[0, NT + 0.025, 0]}>
                <cylinderGeometry args={[0.016, 0.022, 0.05, 8]} />
                <meshStandardMaterial color="#f1f5f9" metalness={0.9} roughness={0.06} />
              </mesh>

              {/* Vacuum indicator glow */}
              <mesh ref={glowRef} position={[0, NT, 0]}>
                <sphereGeometry args={[0.022, 8, 8]} />
                <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={3.5} transparent opacity={0.9}/>
              </mesh>
              <pointLight position={[0, NT, 0]} color="#00d4ff" intensity={0.55} distance={0.5} />

              {/* ── Component held on nozzle ─────────────────────────────── */}
              <group ref={compRef} position={[0, NT - 0.08, 0]} visible={false}>
                <group scale={[0.5, 0.5, 0.5]} rotation={[0, 0, 0]}>
                  <PCBComponent label={componentType} />
                </group>
              </group>

            </group>{/* end zRodRef */}
          </group>{/* end wrist */}
        </group>{/* end j2Ref */}
      </group>{/* end j1Ref */}
    </>
  );
}

"""

content = content[:si] + NEW_ARM + content[ei:]

# Update Canvas render call
content = content.replace(
    "<RobotArmVisualization previewItems={previewItems} />",
    "<RobotArmVisualization previewItems={previewItems} />"
)
# In case it's still the old name from patch_3d_path
content = content.replace(
    "<ArmPathVisualization previewItems={previewItems} />",
    "<RobotArmVisualization previewItems={previewItems} />"
)

open(WS, "w", encoding="utf-8").write(content)
print("  patched  src/components/PCBWorkspace.tsx")
print("\nDone! Vite will hot-reload.")
