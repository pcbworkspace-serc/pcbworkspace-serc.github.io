#!/usr/bin/env python3
"""Run from project root: python patch_3d_path.py
Adds animated 3D arm-path visualization to PCBWorkspace."""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
WS   = os.path.join(ROOT, "src", "components", "PCBWorkspace.tsx")

content = open(WS, encoding="utf-8").read()

# ── 1. Add useFrame to the @react-three/fiber import ─────────────────────────
OLD_IMPORT = 'import { Canvas, useThree } from "@react-three/fiber";'
NEW_IMPORT = 'import { Canvas, useThree, useFrame } from "@react-three/fiber";'
if OLD_IMPORT not in content:
    print("ERROR: cannot find fiber import"); sys.exit(1)
content = content.replace(OLD_IMPORT, NEW_IMPORT)

# ── 2. Insert ArmPathVisualization before pinWorldPosition ────────────────────
ARM_VIZ = r"""
// ── Animated arm-path shown while a plan is staged ───────────────────────────
function ArmPathVisualization({
  previewItems,
}: {
  previewItems: { x: number; y: number; rotation_deg: number }[] | undefined;
}) {
  const sphereRef  = useRef<THREE.Mesh>(null);
  const progressRef = useRef(0);

  // HOME is off-board to the lower-left in scene units
  const HOME: [number, number, number] = [-4.0, 0.12, -3.0];

  const waypoints = useMemo<[number, number, number][]>(() => {
    if (!previewItems || previewItems.length === 0) return [];
    return [
      HOME,
      ...previewItems.map((item, i) => {
        const isLast = i === previewItems.length - 1;
        // Raise transit moves above board; lower final position to board level
        return [item.x, isLast ? 0.06 : 0.35, item.y] as [number, number, number];
      }),
    ];
  }, [previewItems]);

  const segments = useMemo(() => {
    if (waypoints.length < 2) return [];
    return waypoints.slice(1).map((to, i) => {
      const from = waypoints[i];
      const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
      const len = dir.length();
      const mid = new THREE.Vector3(
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2
      );
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir.clone().normalize()
      );
      const isLast = i === waypoints.length - 2;
      return { mid: mid.toArray() as [number, number, number], len, quat, isLast };
    }).filter(s => s.len > 0.02);
  }, [waypoints]);

  // Animate sphere along path
  useFrame((_, delta) => {
    if (!sphereRef.current || waypoints.length < 2) return;
    progressRef.current = (progressRef.current + delta * 0.4) % 1;
    const t   = progressRef.current;
    const n   = waypoints.length - 1;
    const raw = t * n;
    const seg = Math.min(Math.floor(raw), n - 1);
    const lt  = raw - seg;
    const fr  = waypoints[seg];
    const to  = waypoints[seg + 1];
    sphereRef.current.position.set(
      fr[0] + (to[0] - fr[0]) * lt,
      fr[1] + (to[1] - fr[1]) * lt,
      fr[2] + (to[2] - fr[2]) * lt
    );
  });

  if (!previewItems || previewItems.length === 0) return null;

  return (
    <>
      {/* Glowing path tubes */}
      {segments.map((s, i) => (
        <mesh key={i} position={s.mid} quaternion={s.quat}>
          <cylinderGeometry args={[0.016, 0.016, s.len, 6]} />
          <meshStandardMaterial
            color={s.isLast ? "#10b981" : "#00d4ff"}
            emissive={s.isLast ? "#10b981" : "#00d4ff"}
            emissiveIntensity={2.5}
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}

      {/* HOME marker — orange glowing orb */}
      <mesh position={HOME}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshStandardMaterial
          color="#f59e0b" emissive="#f59e0b" emissiveIntensity={3}
        />
      </mesh>
      <pointLight position={HOME} color="#f59e0b" intensity={0.6} distance={1.2} />

      {/* Animated arm-tip sphere */}
      <mesh ref={sphereRef} position={HOME}>
        <sphereGeometry args={[0.11, 12, 12]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#00d4ff"
          emissiveIntensity={5}
          transparent
          opacity={0.95}
        />
      </mesh>
    </>
  );
}

"""

ANCHOR = "function pinWorldPosition"
if ANCHOR not in content:
    print("ERROR: cannot find anchor pinWorldPosition"); sys.exit(1)
content = content.replace(ANCHOR, ARM_VIZ + ANCHOR, 1)

# ── 3. Render ArmPathVisualization inside Canvas ──────────────────────────────
# Insert it right before the SelectionRing block
OLD_SEL = "        {typeof selectedIndex === \"number\" && droppedItems[selectedIndex] && ("
NEW_SEL = "        <ArmPathVisualization previewItems={previewItems} />\n\n" + OLD_SEL
if OLD_SEL not in content:
    print("ERROR: cannot find SelectionRing anchor"); sys.exit(1)
content = content.replace(OLD_SEL, NEW_SEL, 1)

open(WS, "w", encoding="utf-8").write(content)
print("  patched  src/components/PCBWorkspace.tsx")
print("\nDone! Vite will hot-reload — type a VLA instruction to see the 3D arm path.")
