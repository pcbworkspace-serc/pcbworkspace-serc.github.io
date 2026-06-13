#!/usr/bin/env python3
"""Run from project root: python patch_miniMEE_arm.py
Rebuilds the arm to match the actual MiniMEE CAD: cylindrical CF tubes,
U-bracket joints, box end-effector housing, two guide pins, Juki nozzle."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WS   = os.path.join(ROOT, "src", "components", "PCBWorkspace.tsx")

content = open(WS, encoding="utf-8").read()

# Find the arm component boundary
for START in [
    "// ── Full SCARA arm",
    "// ── 3D SCARA Robot Arm",
    "// ── 3D Robot Arm with IK",
    "// ── Animated arm-path",
]:
    si = content.find(START)
    if si != -1:
        break

END = "function pinWorldPosition"
ei  = content.find(END, si if si != -1 else 0)

if si == -1 or ei == -1:
    print("ERROR: cannot find arm component"); sys.exit(1)

NEW_ARM = r"""
// ── MiniMEE SCARA arm — matches actual CAD geometry ──────────────────────────
// CF tubes, NEMA motor housings, U-bracket joints, guide-pin end effector

/** Hollow cylindrical arm link (carbon-fiber tube look) */
function CFTube({ length, r = 0.052 }: { length: number; r?: number }) {
  return (
    <group rotation={[0, 0, Math.PI / 2]}>
      {/* Outer tube */}
      <mesh>
        <cylinderGeometry args={[r, r, length, 14]} />
        <meshStandardMaterial color="#1c2433" metalness={0.82} roughness={0.22} />
      </mesh>
      {/* Inner hollow highlight */}
      <mesh>
        <cylinderGeometry args={[r * 0.72, r * 0.72, length - 0.01, 14]} />
        <meshStandardMaterial color="#0d1520" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Motor housing block with mounting flanges — matches NEMA 17 profile */
function MotorBlock({ w = 0.22 }: { w?: number }) {
  return (
    <group>
      {/* Main cube body */}
      <mesh>
        <boxGeometry args={[w, w, w]} />
        <meshStandardMaterial color="#0f1a27" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Front/back mounting flanges */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[0, 0, s * (w / 2 + 0.018)]}>
          <boxGeometry args={[w + 0.04, w + 0.04, 0.036]} />
          <meshStandardMaterial color="#162030" metalness={0.88} roughness={0.18} />
        </mesh>
      ))}
      {/* Shaft circle on top face */}
      <mesh position={[0, w / 2 + 0.002, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.004, 12]} />
        <meshStandardMaterial color="#0a1018" metalness={0.95} roughness={0.1} />
      </mesh>
    </group>
  );
}

/** U-bracket clamp that holds a CF tube — seen at every joint in the CAD */
function UBracket({ width = 0.13 }: { width?: number }) {
  const t = 0.025; // wall thickness
  return (
    <group>
      {/* Back plate */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[width, 0.11, t]} />
        <meshStandardMaterial color="#1e2d40" metalness={0.88} roughness={0.2} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-(width / 2 - t / 2), -0.02, 0.045]}>
        <boxGeometry args={[t, 0.065, 0.09]} />
        <meshStandardMaterial color="#1e2d40" metalness={0.88} roughness={0.2} />
      </mesh>
      {/* Right arm */}
      <mesh position={[(width / 2 - t / 2), -0.02, 0.045]}>
        <boxGeometry args={[t, 0.065, 0.09]} />
        <meshStandardMaterial color="#1e2d40" metalness={0.88} roughness={0.2} />
      </mesh>
      {/* Bolt heads */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * (width / 2 - t / 2), -0.02, 0.045]}>
          <cylinderGeometry args={[0.014, 0.014, 0.012, 6]} rotation={[0, 0, Math.PI/2]} />
          <meshStandardMaterial color="#475569" metalness={0.95} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

/** End-effector: box housing + two guide pins + Juki vacuum nozzle (matches image 3) */
function EndEffector({
  glowRef, compRef, label,
}: {
  glowRef: React.RefObject<THREE.Mesh>;
  compRef: React.RefObject<THREE.Group>;
  label: string;
}) {
  return (
    <group>
      {/* Main housing box */}
      <mesh position={[0, -0.09, 0]}>
        <boxGeometry args={[0.17, 0.18, 0.17]} />
        <meshStandardMaterial color="#0f1a27" metalness={0.9} roughness={0.15} />
      </mesh>
      {/* Side mounting flanges (as seen in the CAD) */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * 0.115, -0.07, 0]}>
          <boxGeometry args={[0.04, 0.12, 0.15]} />
          <meshStandardMaterial color="#1e2d40" metalness={0.88} roughness={0.2} />
        </mesh>
      ))}
      {/* Pneumatic connector on top */}
      <mesh position={[0.04, -0.005, 0.04]}>
        <cylinderGeometry args={[0.018, 0.018, 0.06, 8]} />
        <meshStandardMaterial color="#334155" metalness={0.85} roughness={0.25} />
      </mesh>

      {/* ── Guide pins (the two silver rods from image 3) ─────────────── */}
      {[-0.04, 0.04].map(x => (
        <mesh key={x} position={[x, -0.32, 0]}>
          <cylinderGeometry args={[0.0095, 0.0095, 0.34, 8]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.96} roughness={0.07} />
        </mesh>
      ))}
      {/* Pin retention clips at bottom */}
      {[-0.04, 0.04].map(x => (
        <mesh key={x + "c"} position={[x, -0.5, 0]}>
          <cylinderGeometry args={[0.016, 0.016, 0.018, 8]} />
          <meshStandardMaterial color="#475569" metalness={0.9} roughness={0.12} />
        </mesh>
      ))}

      {/* ── Juki vacuum nozzle (center, between pins) ─────────────────── */}
      {/* Nozzle body */}
      <mesh position={[0, -0.30, 0]}>
        <cylinderGeometry args={[0.02, 0.026, 0.18, 10]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.93} roughness={0.07} />
      </mesh>
      {/* Nozzle tip cup */}
      <mesh position={[0, -0.40, 0]}>
        <cylinderGeometry args={[0.013, 0.02, 0.04, 8]} />
        <meshStandardMaterial color="#f8fafc" metalness={0.94} roughness={0.05} />
      </mesh>
      {/* Vacuum glow */}
      <mesh ref={glowRef} position={[0, -0.43, 0]}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={4} transparent opacity={0.9} />
      </mesh>
      <pointLight position={[0, -0.43, 0]} color="#00d4ff" intensity={0.5} distance={0.45} />

      {/* ── Component held by vacuum ───────────────────────────────────── */}
      <group ref={compRef} position={[0, -0.5, 0]} visible={false}>
        <group scale={[0.5, 0.5, 0.5]}>
          <PCBComponent label={label} />
        </group>
      </group>
    </group>
  );
}

// ── Main arm component ────────────────────────────────────────────────────────
function RobotArmVisualization({
  previewItems,
}: {
  previewItems: { x: number; y: number; rotation_deg: number; type?: string }[] | undefined;
}) {
  const j1Ref   = useRef<THREE.Group>(null);
  const j2Ref   = useRef<THREE.Group>(null);
  const zRodRef = useRef<THREE.Group>(null);
  const compRef = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  const L1 = 3.0;
  const L2 = 2.6;
  const Z_STROKE = 0.32;

  const BASE:     [number, number, number] = [0,   0,   -5.2];
  const SHOULDER: [number, number, number] = [0,   1.1, -5.2];
  const SUPPLY:   [number, number, number] = [-2.4, 1.1, -4.5];

  const placeWP = useMemo<[number, number, number]>(() => {
    if (!previewItems || previewItems.length === 0) return [...SHOULDER];
    const last = previewItems[previewItems.length - 1];
    return [last.x, SHOULDER[1], last.y];
  }, [previewItems]);

  const label = previewItems?.[0]?.type ?? "Resistor";

  const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
  const pp   = (t: number, s: number, e: number) =>
    Math.max(0, Math.min(1, (t - s) / (e - s)));

  const solveIK = (tx: number, tz: number): [number, number] => {
    const dx = tx - SHOULDER[0], ndz = -(tz - SHOULDER[2]);
    const d  = Math.sqrt(dx * dx + ndz * ndz);
    const cd = Math.min(d, L1 + L2 - 0.01);
    const sc = d > 0.001 ? cd / d : 1;
    const c2 = (cd * cd - L1 * L1 - L2 * L2) / (2 * L1 * L2);
    const t2 = -Math.acos(Math.max(-1, Math.min(1, c2)));
    const t1 = Math.atan2(ndz * sc, dx * sc)
             - Math.atan2(L2 * Math.sin(t2), L1 + L2 * Math.cos(t2));
    return [t1, t2];
  };

  useFrame((_, delta) => {
    if (!j1Ref.current || !j2Ref.current || !zRodRef.current) return;
    progressRef.current = (progressRef.current + delta * 0.20) % 1;
    const T = progressRef.current;

    let tx = SHOULDER[0], tz = SHOULDER[2], zExt = 0, holding = false;

    if      (T < 0.14) { const p=pp(T,0,0.14);    tx=lerp(SHOULDER[0],SUPPLY[0],p); tz=lerp(SHOULDER[2],SUPPLY[2],p); }
    else if (T < 0.24) { tx=SUPPLY[0]; tz=SUPPLY[2]; zExt=pp(T,0.14,0.24); }
    else if (T < 0.31) { tx=SUPPLY[0]; tz=SUPPLY[2]; zExt=1; holding=true; }
    else if (T < 0.41) { tx=SUPPLY[0]; tz=SUPPLY[2]; zExt=lerp(1,0,pp(T,0.31,0.41)); holding=true; }
    else if (T < 0.68) { const p=pp(T,0.41,0.68); tx=lerp(SUPPLY[0],placeWP[0],p); tz=lerp(SUPPLY[2],placeWP[2],p); holding=true; }
    else if (T < 0.78) { tx=placeWP[0]; tz=placeWP[2]; zExt=pp(T,0.68,0.78); holding=true; }
    else if (T < 0.85) { tx=placeWP[0]; tz=placeWP[2]; zExt=1; }
    else if (T < 0.94) { tx=placeWP[0]; tz=placeWP[2]; zExt=lerp(1,0,pp(T,0.85,0.94)); }
    else               { const p=pp(T,0.94,1); tx=lerp(placeWP[0],SHOULDER[0],p); tz=lerp(placeWP[2],SHOULDER[2],p); }

    const [t1, t2] = solveIK(tx, tz);
    j1Ref.current.rotation.y = t1;
    j2Ref.current.rotation.y = t2;
    zRodRef.current.position.y = -zExt * Z_STROKE;
    if (compRef.current) compRef.current.visible = holding;
    if (glowRef.current) {
      const m = glowRef.current.material as THREE.MeshStandardMaterial;
      m.emissiveIntensity = zExt > 0.4 ? 9 : (holding ? 5 : 3);
    }
  });

  if (!previewItems || previewItems.length === 0) return null;

  return (
    <>
      {/* Component supply feeder tray */}
      <mesh position={[SUPPLY[0], 0.03, SUPPLY[2]]}>
        <boxGeometry args={[0.46, 0.06, 0.46]} />
        <meshStandardMaterial color="#1a3050" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh position={[SUPPLY[0], 0.07, SUPPLY[2]]}>
        <boxGeometry args={[0.34, 0.03, 0.34]} />
        <meshStandardMaterial color="#ca8a04" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* ── Base: NEMA motor cylinder ──────────────────────────────────── */}
      <mesh position={[BASE[0], 0.25, BASE[2]]}>
        <cylinderGeometry args={[0.24, 0.26, 0.5, 18]} />
        <meshStandardMaterial color="#0a1018" metalness={0.92} roughness={0.14} />
      </mesh>
      {/* Base flange */}
      <mesh position={[BASE[0], 0.03, BASE[2]]}>
        <cylinderGeometry args={[0.32, 0.32, 0.06, 18]} />
        <meshStandardMaterial color="#162030" metalness={0.88} roughness={0.18} />
      </mesh>
      {/* Column tube (from base motor to shoulder) */}
      <mesh position={[BASE[0], 0.78, BASE[2]]}>
        <cylinderGeometry args={[0.055, 0.055, 0.52, 12]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.94} roughness={0.1} />
      </mesh>

      {/* J1 motor block at shoulder */}
      <group position={SHOULDER}>
        <MotorBlock w={0.22} />
      </group>

      {/* ── J1 rotation group (shoulder) ──────────────────────────────── */}
      <group ref={j1Ref} position={SHOULDER}>

        {/* U-bracket connecting motor to Link1 */}
        <group position={[0.14, 0, 0]}>
          <UBracket width={0.12} />
        </group>

        {/* Link 1 — CF tube */}
        <group position={[L1 / 2, 0, 0]}>
          <CFTube length={L1 - 0.28} r={0.052} />
        </group>

        {/* J2 motor block at elbow */}
        <group position={[L1, 0, 0]}>
          <MotorBlock w={0.19} />
        </group>

        {/* U-bracket on far side of J2 connecting to Link2 */}
        <group position={[L1 + 0.12, 0, 0]}>
          <UBracket width={0.10} />
        </group>

        {/* ── J2 rotation group (elbow) ─────────────────────────────── */}
        <group ref={j2Ref} position={[L1, 0, 0]}>

          {/* Link 2 — CF tube (shorter, slightly narrower) */}
          <group position={[L2 / 2, 0, 0]}>
            <CFTube length={L2 - 0.24} r={0.044} />
          </group>

          {/* Wrist housing (box, connects Link2 to Z-axis) */}
          <group position={[L2, 0, 0]}>
            <mesh position={[0, -0.12, 0]}>
              <boxGeometry args={[0.20, 0.26, 0.20]} />
              <meshStandardMaterial color="#0f1a27" metalness={0.9} roughness={0.15} />
            </mesh>
            {/* Wrist U-brackets */}
            {[-0.12, 0.12].map(z => (
              <mesh key={z} position={[0, -0.03, z]}>
                <boxGeometry args={[0.22, 0.04, 0.035]} />
                <meshStandardMaterial color="#1e2d40" metalness={0.88} roughness={0.2} />
              </mesh>
            ))}

            {/* ── Z-axis sliding group ─────────────────────────────── */}
            <group ref={zRodRef}>
              {/* Z linear rail (silver rod) */}
              <mesh position={[0, -0.52, 0]}>
                <cylinderGeometry args={[0.034, 0.034, 0.62, 10]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.95} roughness={0.08} />
              </mesh>

              {/* End-effector housing + guide pins + nozzle */}
              <group position={[0, -0.28, 0]}>
                <EndEffector glowRef={glowRef} compRef={compRef} label={label} />
              </group>
            </group>
          </group>
        </group>{/* end j2Ref */}
      </group>{/* end j1Ref */}
    </>
  );
}

"""

content = content[:si] + NEW_ARM + content[ei:]

# Make sure the render call exists
if "<RobotArmVisualization previewItems={previewItems} />" not in content:
    content = content.replace(
        "<ArmPathVisualization previewItems={previewItems} />",
        "<RobotArmVisualization previewItems={previewItems} />"
    )

open(WS, "w", encoding="utf-8").write(content)
print("  patched  src/components/PCBWorkspace.tsx")
print("\nDone! Vite will hot-reload.")
