#!/usr/bin/env python3
"""Run from project root: python patch_robot_arm.py
Replaces the sphere animation with a full 3D SCARA robot arm using inverse kinematics."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WS   = os.path.join(ROOT, "src", "components", "PCBWorkspace.tsx")

content = open(WS, encoding="utf-8").read()

# ── Find and replace the entire ArmPathVisualization function ─────────────────
START_MARKER = "// ── Animated arm-path shown while a plan is staged"
END_MARKER   = "function pinWorldPosition"

si = content.find(START_MARKER)
ei = content.find(END_MARKER, si)

if si == -1 or ei == -1:
    print("ERROR: cannot find ArmPathVisualization boundaries"); sys.exit(1)

NEW_ARM = r"""
// ── 3D SCARA Robot Arm with IK — animates along planned path ─────────────────
function RobotArmVisualization({
  previewItems,
}: {
  previewItems: { x: number; y: number; rotation_deg: number }[] | undefined;
}) {
  const j1Ref       = useRef<THREE.Group>(null);   // shoulder
  const j2Ref       = useRef<THREE.Group>(null);   // elbow
  const progressRef = useRef(0);

  const L1 = 2.4;   // upper arm length (scene units)
  const L2 = 2.0;   // lower arm length
  const BASE:     [number, number, number] = [-3.8,  0,   -2.8];
  const SHOULDER: [number, number, number] = [-3.8,  0.6, -2.8];

  // Ordered 3-D waypoints for the arm tip to follow
  const waypoints = useMemo<[number, number, number][]>(() => {
    if (!previewItems || previewItems.length === 0) return [];
    return [
      [...SHOULDER] as [number, number, number],
      ...previewItems.map((item, i) => {
        const isLast = i === previewItems.length - 1;
        return [item.x, isLast ? 0.06 : 0.35, item.y] as [number, number, number];
      }),
    ];
  }, [previewItems]);

  // Pre-compute path tube geometry
  const segments = useMemo(() => {
    if (waypoints.length < 2) return [];
    return waypoints.slice(1).map((to, i) => {
      const from = waypoints[i];
      const dir  = new THREE.Vector3(to[0]-from[0], to[1]-from[1], to[2]-from[2]);
      const len  = dir.length();
      if (len < 0.02) return null;
      const mid  = new THREE.Vector3((from[0]+to[0])/2,(from[1]+to[1])/2,(from[2]+to[2])/2);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0,1,0), dir.clone().normalize()
      );
      return { mid: mid.toArray() as [number,number,number], len, quat,
               isLast: i === waypoints.length - 2 };
    }).filter(Boolean) as { mid:[number,number,number]; len:number; quat:THREE.Quaternion; isLast:boolean }[];
  }, [waypoints]);

  // Animate the arm using 2-joint planar IK in the XZ plane
  useFrame((_, delta) => {
    if (!j1Ref.current || !j2Ref.current || waypoints.length < 2) return;

    progressRef.current = (progressRef.current + delta * 0.4) % 1;
    const t   = progressRef.current;
    const n   = waypoints.length - 1;
    const raw = t * n;
    const seg = Math.min(Math.floor(raw), n - 1);
    const lt  = raw - seg;
    const fr  = waypoints[seg];
    const to  = waypoints[seg + 1];

    // Current arm-tip target
    const cx = fr[0] + (to[0] - fr[0]) * lt;
    const cz = fr[2] + (to[2] - fr[2]) * lt;

    // Offset from shoulder joint in XZ plane
    const dx  = cx - SHOULDER[0];
    const ndz = -(cz - SHOULDER[2]);          // flip Z for right-hand IK math
    const d   = Math.sqrt(dx*dx + ndz*ndz);
    const cd  = Math.min(d, L1 + L2 - 0.01); // clamp to reachable radius
    const sc  = d > 0.001 ? cd / d : 1;

    // Law of cosines → elbow angle, then shoulder angle
    const cos2   = (cd*cd - L1*L1 - L2*L2) / (2*L1*L2);
    const theta2 = -Math.acos(Math.max(-1, Math.min(1, cos2))); // elbow-down config
    const theta1 = Math.atan2(ndz*sc, dx*sc)
                 - Math.atan2(L2*Math.sin(theta2), L1 + L2*Math.cos(theta2));

    j1Ref.current.rotation.y = theta1;
    j2Ref.current.rotation.y = theta2;
  });

  if (!previewItems || previewItems.length === 0) return null;

  return (
    <>
      {/* ── Glowing planned-path tubes ──────────────────────────────────── */}
      {segments.map((s, i) => (
        <mesh key={"seg"+i} position={s.mid} quaternion={s.quat}>
          <cylinderGeometry args={[0.013, 0.013, s.len, 6]} />
          <meshStandardMaterial
            color={s.isLast ? "#10b981" : "#00d4ff"}
            emissive={s.isLast ? "#10b981" : "#00d4ff"}
            emissiveIntensity={1.8} transparent opacity={0.6}
          />
        </mesh>
      ))}

      {/* ── SCARA robot arm ─────────────────────────────────────────────── */}

      {/* Base plate */}
      <mesh position={[BASE[0], 0.05, BASE[2]]}>
        <cylinderGeometry args={[0.38, 0.46, 0.1, 16]} />
        <meshStandardMaterial color="#111827" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Column */}
      <mesh position={[BASE[0], 0.38, BASE[2]]}>
        <cylinderGeometry args={[0.075, 0.095, 0.56, 12]} />
        <meshStandardMaterial color="#1f2937" metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Shoulder joint sphere */}
      <mesh position={SHOULDER}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* ── Joint 1 group (shoulder — rotates in XZ) ── */}
      <group ref={j1Ref} position={SHOULDER}>

        {/* Upper arm */}
        <mesh position={[L1/2, 0, 0]}>
          <boxGeometry args={[L1, 0.1, 0.075]} />
          <meshStandardMaterial color="#dc2626" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Elbow joint */}
        <mesh position={[L1, 0, 0]}>
          <sphereGeometry args={[0.11, 12, 12]} />
          <meshStandardMaterial color="#374151" metalness={0.8} roughness={0.3} />
        </mesh>

        {/* ── Joint 2 group (elbow — rotates in XZ) ── */}
        <group ref={j2Ref} position={[L1, 0, 0]}>

          {/* Lower arm */}
          <mesh position={[L2/2, 0, 0]}>
            <boxGeometry args={[L2, 0.082, 0.065]} />
            <meshStandardMaterial color="#b91c1c" metalness={0.7} roughness={0.35} />
          </mesh>
          {/* Wrist joint */}
          <mesh position={[L2, 0, 0]}>
            <sphereGeometry args={[0.09, 10, 10]} />
            <meshStandardMaterial color="#4c1d95" metalness={0.75} roughness={0.3} />
          </mesh>

          {/* Z-axis spindle (moves up/down in real life) */}
          <mesh position={[L2, -0.22, 0]}>
            <cylinderGeometry args={[0.042, 0.042, 0.44, 8]} />
            <meshStandardMaterial color="#6d28d9" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Nozzle housing */}
          <mesh position={[L2, -0.46, 0]}>
            <cylinderGeometry args={[0.028, 0.038, 0.08, 8]} />
            <meshStandardMaterial color="#7c3aed" metalness={0.85} roughness={0.2} />
          </mesh>
          {/* Vacuum tip glow */}
          <mesh position={[L2, -0.53, 0]}>
            <sphereGeometry args={[0.046, 8, 8]} />
            <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={6} />
          </mesh>
          <pointLight position={[L2, -0.53, 0]} color="#00d4ff" intensity={0.8} distance={1.0} />

        </group>
      </group>
    </>
  );
}

"""

content = content[:si] + NEW_ARM + content[ei:]

# Update the render call inside Canvas
content = content.replace(
    "<ArmPathVisualization previewItems={previewItems} />",
    "<RobotArmVisualization previewItems={previewItems} />"
)

open(WS, "w", encoding="utf-8").write(content)
print("  patched  src/components/PCBWorkspace.tsx")
print("\nDone! Vite will hot-reload.")
