import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import * as THREE from "three";
import { useState, useCallback, useEffect } from "react";

interface DroppedItem {
  type: string;
  x: number;
  y: number;
  rotation_deg?: number;
}

// PinRef + Wire match @/lib/wires shapes used by Index.tsx
interface PinRef { componentIndex: number; pinName: string }
interface Wire {
  id: string;
  fromComponent: number; fromPin: string;
  toComponent: number;   toPin: string;
}

type PCBWorkspaceProps = {
  items?: DroppedItem[];
  onItemsChange?: (items: DroppedItem[]) => void;
  // Sprint 2 will use these — Index.tsx passes them already.
  wires?: Wire[];
  wireMode?: boolean;
  pendingPin?: PinRef | null;
  onPinClick?: (ref: PinRef) => void;
};

// ── captureScene support ──────────────────────────────────────────────────────
// The Detect button in Index.tsx calls captureScene() to grab a JPEG of the 3D
// canvas when no webcam frame is available. We stash a module-level reference to
// the underlying canvas element on mount so external callers can read it.
let _activeCanvas: HTMLCanvasElement | null = null;

export async function captureScene(): Promise<Blob | null> {
  const canvas = _activeCanvas;
  if (!canvas) return null;
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
  });
}

/* ── Realistic Components ───────────────────────────────────────────────────── */

function Resistor() {
  return (
    <group>
      <mesh position={[0, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.35, 16]} />
        <meshStandardMaterial color="#d2b48c" roughness={0.6} />
      </mesh>
      {[
        { offset: -0.12, color: "#8B4513" },
        { offset: -0.05, color: "#000000" },
        { offset: 0.02, color: "#ff0000" },
        { offset: 0.09, color: "#FFD700" },
      ].map((band, i) => (
        <mesh key={`band-${i}`} position={[band.offset, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.085, 0.085, 0.02, 16]} />
          <meshStandardMaterial color={band.color} />
        </mesh>
      ))}
      <mesh position={[-0.25, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.25, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Capacitor() {
  return (
    <group>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.3, 20]} />
        <meshStandardMaterial color="#1a1a6e" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.12, 0.11, 0.02, 20]} />
        <meshStandardMaterial color="#888888" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.08, 0.18, 0.08]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.01, 0.28, 0.1]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
      <mesh position={[-0.04, 0.01, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.04, 0.01, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.08, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Diode() {
  return (
    <group>
      <mesh position={[0, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 0.25, 12]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.3} />
      </mesh>
      <mesh position={[0.08, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.055, 0.055, 0.03, 12]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[-0.2, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.2, 0.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
    </group>
  );
}

function LED() {
  return (
    <group>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.1, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ff2200" transparent opacity={0.7} emissive="#ff2200" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.13, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.18, 16]} />
        <meshStandardMaterial color="#ff3300" transparent opacity={0.6} emissive="#ff2200" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 0.04, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.02, 16]} />
        <meshStandardMaterial color="#cccccc" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[-0.03, 0.01, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.08, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0.03, 0.01, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.06, 8]} />
        <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
      </mesh>
      <pointLight position={[0, 0.3, 0]} color="#ff2200" intensity={0.3} distance={1} />
    </group>
  );
}

function Transistor() {
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 0.18, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[0.2, 0.18, 0.02]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.18, 0.06]}>
        <sphereGeometry args={[0.015, 8, 8]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      {[-0.05, 0, 0.05].map((xOff, i) => (
        <mesh key={i} position={[xOff, 0.01, 0]}>
          <cylinderGeometry args={[0.01, 0.01, 0.06, 8]} />
          <meshStandardMaterial color="#C0C0C0" metalness={0.9} roughness={0.2} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Detailed PCB Board ─────────────────────────────────────────────────────── */

function PCBBoard() {
  const traces: { x: number; z: number; w: number; h: number }[] = [];
  for (let i = 0; i < 7; i++) traces.push({ x: 0, z: -1.4 + i * 0.48, w: 5.6, h: 0.04 });
  for (let i = 0; i < 11; i++) traces.push({ x: -2.5 + i * 0.5, z: 0, w: 0.04, h: 3.6 });
  const branchTraces = [
    { x: -1.8, z: -0.6, w: 0.8, h: 0.03 },
    { x: 1.2, z: 0.8, w: 1.2, h: 0.03 },
    { x: -0.5, z: 1.2, w: 0.6, h: 0.03 },
    { x: 2.0, z: -1.0, w: 0.5, h: 0.03 },
    { x: -2.0, z: 0.5, w: 0.03, h: 0.7 },
    { x: 1.5, z: -0.3, w: 0.03, h: 0.9 },
    { x: 0.3, z: 0.6, w: 0.03, h: 0.5 },
    { x: -1.0, z: -1.0, w: 0.03, h: 0.6 },
  ];
  const vias: [number, number][] = [];
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 11; col++) vias.push([-2.5 + col * 0.5, -1.4 + row * 0.48]);
  }
  const extraVias: [number, number][] = [
    [-1.8, -0.6], [1.2, 0.8], [-0.5, 1.2], [2.0, -1.0],
    [-2.0, 0.5], [1.5, -0.3], [0.3, 0.6], [-1.0, -1.0],
    [0.8, -0.5], [-0.8, 0.3], [1.8, 0.2], [-1.5, -0.2],
  ];

  return (
    <group>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[6.2, 0.06, 4.2]} />
        <meshStandardMaterial color="#0d4f25" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[6.2, 0.02, 4.2]} />
        <meshStandardMaterial color="#1a8a4a" roughness={0.5} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <boxGeometry args={[6.0, 0.005, 4.0]} />
        <meshStandardMaterial color="#b87333" metalness={0.8} roughness={0.3} />
      </mesh>
      {traces.map((t, i) => (
        <mesh key={`trace-${i}`} position={[t.x, -0.028, t.z]}>
          <boxGeometry args={[t.w, 0.005, t.h]} />
          <meshStandardMaterial color="#c87533" metalness={0.85} roughness={0.2} />
        </mesh>
      ))}
      {branchTraces.map((t, i) => (
        <mesh key={`branch-${i}`} position={[t.x, -0.028, t.z]}>
          <boxGeometry args={[t.w, 0.005, t.h]} />
          <meshStandardMaterial color="#d4944a" metalness={0.8} roughness={0.25} />
        </mesh>
      ))}
      {vias.map(([vx, vz], i) => (
        <group key={`via-${i}`}>
          <mesh position={[vx, -0.025, vz]}>
            <cylinderGeometry args={[0.06, 0.06, 0.008, 12]} />
            <meshStandardMaterial color="#d4a84b" metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[vx, -0.02, vz]}>
            <cylinderGeometry args={[0.025, 0.025, 0.01, 8]} />
            <meshStandardMaterial color="#0a3318" />
          </mesh>
        </group>
      ))}
      {extraVias.map(([vx, vz], i) => (
        <group key={`evia-${i}`}>
          <mesh position={[vx, -0.025, vz]}>
            <cylinderGeometry args={[0.045, 0.045, 0.008, 10]} />
            <meshStandardMaterial color="#d4a84b" metalness={0.9} roughness={0.15} />
          </mesh>
          <mesh position={[vx, -0.02, vz]}>
            <cylinderGeometry args={[0.02, 0.02, 0.01, 8]} />
            <meshStandardMaterial color="#0a3318" />
          </mesh>
        </group>
      ))}
      <lineSegments position={[0, -0.018, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(6.2, 0.001, 4.2)]} />
        <lineBasicMaterial color="#ffffff" />
      </lineSegments>
      {[
        [-1.5, 0.5, 0.5, 0.3],
        [1.0, -0.5, 0.4, 0.6],
        [-0.5, -1.0, 0.7, 0.3],
        [2.0, 0.5, 0.3, 0.3],
        [-2.0, -0.5, 0.4, 0.4],
      ].map(([sx, sz, sw, sh], i) => (
        <lineSegments key={`silk-${i}`} position={[sx, -0.018, sz]}>
          <edgesGeometry args={[new THREE.BoxGeometry(sw, 0.001, sh)]} />
          <lineBasicMaterial color="rgba(255,255,255,0.5)" />
        </lineSegments>
      ))}
      {[[-2.8, -1.8], [-2.8, 1.8], [2.8, -1.8], [2.8, 1.8]].map(([mx, mz], i) => (
        <group key={`mount-${i}`}>
          <mesh position={[mx, -0.025, mz]}>
            <cylinderGeometry args={[0.12, 0.12, 0.01, 16]} />
            <meshStandardMaterial color="#c0c0c0" metalness={0.9} roughness={0.1} />
          </mesh>
          <mesh position={[mx, -0.02, mz]}>
            <cylinderGeometry args={[0.06, 0.06, 0.015, 12]} />
            <meshStandardMaterial color="#0a3318" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* ── Component selector ─────────────────────────────────────────────────────── */

function PCBComponent({ label }: { label: string }) {
  switch (label) {
    case "Resistor":   return <Resistor />;
    case "Capacitor":  return <Capacitor />;
    case "Diode":      return <Diode />;
    case "LED":        return <LED />;
    case "Transistor": return <Transistor />;
    default:           return null;
  }
}

/* ── Main Workspace ─────────────────────────────────────────────────────────── */

export default function PCBWorkspace({ items, onItemsChange }: PCBWorkspaceProps) {
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>(items ?? []);

  // Sync from controlled prop. The parent (Index.tsx) is the source of truth —
  // when it rotates / deletes an item, that flows back here via this effect.
  useEffect(() => { if (items) setDroppedItems(items); }, [items]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 6 - 3;
    const y = ((e.clientY - rect.top) / rect.height) * -4 + 2;
    setDroppedItems((prev) => {
      const updated = [...prev, { type, x, y, rotation_deg: 0 }];
      onItemsChange?.(updated);
      return updated;
    });
  }, [onItemsChange]);

  return (
    <div
      className="w-full h-full relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [4, 5, 4], fov: 50 }}
        shadows
        // preserveDrawingBuffer keeps the rendered frame so captureScene() can read it
        gl={{ preserveDrawingBuffer: true }}
        onCreated={({ gl }) => { _activeCanvas = gl.domElement; }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
        <PCBBoard />
        <Grid
          infiniteGrid
          cellSize={0.5}
          cellThickness={0.3}
          cellColor="#005588"
          sectionSize={2.5}
          sectionThickness={0.6}
          sectionColor="#0077aa"
          fadeDistance={25}
          fadeStrength={1.5}
          followCamera={false}
          position={[0, -0.12, 0]}
        />
        {/* Each component lives in a rotation group so the rotate button in the
            minimap rotates the actual 3D model around its own Y axis. */}
        {droppedItems.map((item, i) => {
          const rotRad = ((item.rotation_deg ?? 0) * Math.PI) / 180;
          return (
            <group
              key={i}
              position={[item.x, -0.03, item.y]}
              rotation={[0, rotRad, 0]}
            >
              <PCBComponent label={item.type} />
            </group>
          );
        })}
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.1}
          minDistance={2}
          maxDistance={15}
        />
      </Canvas>
    </div>
  );
}
