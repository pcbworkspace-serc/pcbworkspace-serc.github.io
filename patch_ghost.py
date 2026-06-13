#!/usr/bin/env python3
"""Run from project root: python patch_ghost.py"""
import os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(ROOT, "src")

# ── 1. PCBWorkspace.tsx — add GhostPCBComponent + update ghost rendering ──────

ws_path = os.path.join(SRC, "components", "PCBWorkspace.tsx")
ws = open(ws_path, encoding="utf-8").read()

# Insert GhostPCBComponent right before pinWorldPosition
GHOST_COMP = '''
function GhostPCBComponent({ label }: { label: string }) {
  const groupRef = useRef<THREE.Group>(null);
  useEffect(() => {
    if (!groupRef.current) return;
    groupRef.current.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        const mat  = (orig as THREE.MeshStandardMaterial).clone();
        mat.transparent      = true;
        mat.opacity          = 0.5;
        mat.emissive         = new THREE.Color(0x003344);
        mat.emissiveIntensity = 0.5;
        mat.depthWrite       = false;
        mesh.material = mat;
      }
    });
  }, [label]);
  return <group ref={groupRef}><PCBComponent label={label} /></group>;
}

'''

ANCHOR = "function pinWorldPosition"
if ANCHOR not in ws:
    print("ERROR: could not find anchor 'pinWorldPosition' in PCBWorkspace.tsx"); sys.exit(1)

ws = ws.replace(ANCHOR, GHOST_COMP + ANCHOR)

# Replace the ghost rendering block — match on the unique meshBasicMaterial line
OLD_GHOST_SNIPPET = '<meshBasicMaterial color="#001824" transparent opacity={0.75} />'
if OLD_GHOST_SNIPPET not in ws:
    print("ERROR: could not find old ghost block in PCBWorkspace.tsx"); sys.exit(1)

# Find the opening of that whole block and replace to the closing })}
# We'll replace from the comment line to the closing })}
OLD_BLOCK_START = "        {/* Ghost preview items"
OLD_BLOCK_END   = "        })}\n"

start_idx = ws.find(OLD_BLOCK_START)
end_idx   = ws.find(OLD_BLOCK_END, start_idx) + len(OLD_BLOCK_END)

NEW_GHOST = """        {/* Ghost preview — real component shape with cyan tint */}
        {(previewItems ?? []).map((item, i) => {
          const rotRad = ((item.rotation_deg ?? 0) * Math.PI) / 180;
          return (
            <group key={`preview-${i}`} position={[item.x, 0.05, item.y]} rotation={[0, rotRad, 0]}>
              <GhostPCBComponent label={item.type} />
              <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
                <torusGeometry args={[0.3, 0.016, 8, 32]} />
                <meshStandardMaterial color="#00d4ff" emissive="#00d4ff" emissiveIntensity={2.5} />
              </mesh>
            </group>
          );
        })}
"""

ws = ws[:start_idx] + NEW_GHOST + ws[end_idx:]
open(ws_path, "w", encoding="utf-8").write(ws)
print("  patched  src/components/PCBWorkspace.tsx")

# ── 2. PCBRobot.tsx — add extractComponentType + use it in previewItems ───────

rb_path = os.path.join(SRC, "components", "PCBRobot.tsx")
rb = open(rb_path, encoding="utf-8").read()

# Add helper before the export default function PCBRobot line
HELPER = '''
function extractComponentType(instruction: string): string {
  const l = instruction.toLowerCase();
  if (l.includes("resistor"))   return "Resistor";
  if (l.includes("capacitor"))  return "Capacitor";
  if (l.includes("led"))        return "LED";
  if (l.includes("diode"))      return "Diode";
  if (l.includes("transistor")) return "Transistor";
  if (l.includes(" ic ") || l.includes("chip")) return "IC";
  if (l.includes("inductor"))   return "Inductor";
  if (l.includes("crystal"))    return "Crystal";
  if (l.includes("switch"))     return "Switch";
  if (l.includes("header"))     return "Header";
  return "Resistor";
}

'''

ROBOT_ANCHOR = "export default function PCBRobot"
if ROBOT_ANCHOR not in rb:
    print("ERROR: could not find PCBRobot export"); sys.exit(1)

rb = rb.replace(ROBOT_ANCHOR, HELPER + ROBOT_ANCHOR)

# Replace the hardcoded "Preview" type with extractComponentType
OLD_TYPE = 'return { type: "Preview", x: (m.x_mm - 31) / 10, y: (m.y_mm - 21) / 10, rotation_deg: 0 };'
NEW_TYPE = 'return { type: extractComponentType(pendingPlan.instruction), x: (m.x_mm - 31) / 10, y: (m.y_mm - 21) / 10, rotation_deg: 0 };'

if OLD_TYPE not in rb:
    print("ERROR: could not find preview type line in PCBRobot.tsx"); sys.exit(1)

rb = rb.replace(OLD_TYPE, NEW_TYPE)
open(rb_path, "w", encoding="utf-8").write(rb)
print("  patched  src/components/PCBRobot.tsx")

print("\nDone! Vite will hot-reload automatically.")
