import { Canvas, useThree } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
import JSZip from "jszip";

function Resistor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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
        <mesh key={i} position={[band.offset, 0.12, 0]} rotation={[0, 0, Math.PI / 2]}>
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

function Capacitor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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

function Diode({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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

function LED({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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
    </group>
  );
}

function Transistor({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
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

function MiniPCBBoard() {
  const traces: { x: number; z: number; w: number; h: number }[] = [];
  for (let i = 0; i < 5; i++) traces.push({ x: 0, z: -0.8 + i * 0.4, w: 3.2, h: 0.04 });
  for (let i = 0; i < 7; i++) traces.push({ x: -1.5 + i * 0.5, z: 0, w: 0.04, h: 2.0 });

  const vias: [number, number][] = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 7; col++)
      vias.push([-1.5 + col * 0.5, -0.8 + row * 0.4]);

  return (
    <group>
      <mesh position={[0, -0.08, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.06, 2.4]} />
        <meshStandardMaterial color="#0d4f25" roughness={0.7} />
      </mesh>
      <mesh position={[0, -0.04, 0]} receiveShadow>
        <boxGeometry args={[3.6, 0.02, 2.4]} />
        <meshStandardMaterial color="#1a8a4a" roughness={0.5} />
      </mesh>
      {traces.map((t, i) => (
        <mesh key={`trace-${i}`} position={[t.x, -0.028, t.z]}>
          <boxGeometry args={[t.w, 0.005, t.h]} />
          <meshStandardMaterial color="#c87533" metalness={0.85} roughness={0.2} />
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
    </group>
  );
}

const COMPONENT_TYPES = ["Resistor", "Capacitor", "Diode", "LED", "Transistor"] as const;
type ComponentType = typeof COMPONENT_TYPES[number];

function ComponentByName({ name, position }: { name: ComponentType; position: [number, number, number] }) {
  switch (name) {
    case "Resistor": return <Resistor position={position} />;
    case "Capacitor": return <Capacitor position={position} />;
    case "Diode": return <Diode position={position} />;
    case "LED": return <LED position={position} />;
    case "Transistor": return <Transistor position={position} />;
  }
}

function CaptureScene({
  componentName, componentX, componentZ,
  cameraPos, cameraTarget,
  ambientIntensity, keyIntensity,
  onReady,
}: {
  componentName: ComponentType;
  componentX: number; componentZ: number;
  cameraPos: [number, number, number]; cameraTarget: [number, number, number];
  ambientIntensity: number; keyIntensity: number;
  onReady: (gl: THREE.WebGLRenderer) => void;
}) {
  const { gl, camera } = useThree();
  useEffect(() => {
    camera.position.set(...cameraPos);
    camera.lookAt(...cameraTarget);
    onReady(gl);
  }, [gl, camera, cameraPos, cameraTarget, onReady]);

  return (
    <>
      <ambientLight intensity={ambientIntensity} />
      <directionalLight position={[5, 8, 5]} intensity={keyIntensity} />
      <directionalLight position={[-3, 4, -2]} intensity={keyIntensity * 0.25} />
      <MiniPCBBoard />
      <Grid
        cellSize={0.5} cellThickness={0.3} cellColor="#005588"
        sectionSize={2.5} sectionThickness={0.6} sectionColor="#0077aa"
        fadeDistance={15} fadeStrength={1.5}
        position={[0, -0.12, 0]}
        args={[10, 10]}
      />
      <ComponentByName name={componentName} position={[componentX, -0.03, componentZ]} />
    </>
  );
}

interface GenParams {
  componentName: ComponentType;
  componentX: number; componentZ: number;
  cameraPos: [number, number, number]; cameraTarget: [number, number, number];
  ambientIntensity: number; keyIntensity: number;
}

const IMAGES_PER_CLASS = 500;
const IMAGE_SIZE = 224;

function makeRandomParams(name: ComponentType): GenParams {
  const azimuth = Math.random() * Math.PI * 2;
  const elevation = (Math.PI * 0.15) + Math.random() * (Math.PI * 0.35);
  const distance = 1.2 + Math.random() * 1.0;
  const cx = (Math.random() - 0.5) * 0.6;
  const cz = (Math.random() - 0.5) * 0.6;
  const camX = cx + distance * Math.cos(elevation) * Math.cos(azimuth);
  const camY = distance * Math.sin(elevation) + 0.3;
  const camZ = cz + distance * Math.cos(elevation) * Math.sin(azimuth);
  return {
    componentName: name,
    componentX: cx, componentZ: cz,
    cameraPos: [camX, camY, camZ],
    cameraTarget: [cx, 0.05, cz],
    ambientIntensity: 0.4 + Math.random() * 0.3,
    keyIntensity: 0.9 + Math.random() * 0.6,
  };
}

export default function GenerateData() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ class: "", classIdx: 0, frame: 0, total: COMPONENT_TYPES.length * IMAGES_PER_CLASS });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const zipRef = useRef<JSZip | null>(null);
  const paramsRef = useRef<GenParams>({
    componentName: "Resistor",
    componentX: 0, componentZ: 0,
    cameraPos: [1.5, 1.0, 1.5], cameraTarget: [0, 0.05, 0],
    ambientIntensity: 0.5, keyIntensity: 1.2,
  });
  const [, force] = useState(0);

  const handleStart = async () => {
    setRunning(true); setDone(false); setError(null);
    zipRef.current = new JSZip();
    try {
      let totalDone = 0;
      for (let cIdx = 0; cIdx < COMPONENT_TYPES.length; cIdx++) {
        const cname = COMPONENT_TYPES[cIdx];
        const folder = zipRef.current.folder(cname);
        if (!folder) throw new Error("Could not create folder " + cname);
        for (let i = 0; i < IMAGES_PER_CLASS; i++) {
          paramsRef.current = makeRandomParams(cname);
          force((n) => n + 1);
          await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
          const gl = glRef.current;
          if (!gl) throw new Error("WebGL renderer not ready");
          const canvas = gl.domElement;
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
          );
          if (!blob) throw new Error("Canvas toBlob returned null");
          const arrBuf = await blob.arrayBuffer();
          folder.file(`${cname}_${i.toString().padStart(4, "0")}.jpg`, arrBuf);
          totalDone++;
          if (i % 10 === 0 || i === IMAGES_PER_CLASS - 1) {
            setProgress({ class: cname, classIdx: cIdx + 1, frame: totalDone, total: COMPONENT_TYPES.length * IMAGES_PER_CLASS });
          }
        }
      }
      setProgress((p) => ({ ...p, class: "Building ZIP..." }));
      const zipBlob = await zipRef.current.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pcb_training_data.zip";
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setRunning(false);
    }
  };

  const p = paramsRef.current;
  const pct = progress.total > 0 ? Math.round((progress.frame / progress.total) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "#0d2d6e", color: "white", padding: "32px", fontFamily: "system-ui" }}>
      <div style={{ maxWidth: "900px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "28px", fontWeight: 800, marginBottom: "8px" }}>PCB Training Data Generator (Scene-Matched)</h1>
        <p style={{ color: "#b8d0f0", marginBottom: "24px" }}>
          Renders each component on a real PCB board with varied camera angles matching the live workspace.
        </p>
        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "12px", padding: "16px", marginBottom: "16px" }}>
          <div style={{ width: `${IMAGE_SIZE}px`, height: `${IMAGE_SIZE}px`, background: "black", margin: "0 auto", borderRadius: "8px", overflow: "hidden" }}>
            <Canvas
              gl={{ preserveDrawingBuffer: true, antialias: true }}
              camera={{ fov: 50, position: p.cameraPos }}
              style={{ width: IMAGE_SIZE, height: IMAGE_SIZE }}
              shadows
            >
              <CaptureScene
                componentName={p.componentName}
                componentX={p.componentX} componentZ={p.componentZ}
                cameraPos={p.cameraPos} cameraTarget={p.cameraTarget}
                ambientIntensity={p.ambientIntensity} keyIntensity={p.keyIntensity}
                onReady={(gl) => { glRef.current = gl; }}
              />
            </Canvas>
          </div>
          <div style={{ textAlign: "center", marginTop: "12px", fontFamily: "monospace", fontSize: "13px" }}>
            Currently rendering: <b>{p.componentName}</b>
          </div>
        </div>
        {!running && !done && (
          <button onClick={handleStart}
            style={{ background: "#1a4dbf", color: "white", border: "none", padding: "16px 32px", borderRadius: "8px", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}>
            Start generating ({COMPONENT_TYPES.length * IMAGES_PER_CLASS} images)
          </button>
        )}
        {running && (
          <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "16px" }}>
            <div style={{ marginBottom: "8px", fontFamily: "monospace" }}>
              Class {progress.classIdx}/{COMPONENT_TYPES.length} — {progress.class} — frame {progress.frame}/{progress.total} ({pct}%)
            </div>
            <div style={{ background: "#0a1f3d", borderRadius: "4px", overflow: "hidden", height: "12px" }}>
              <div style={{ background: "#3aa8ff", height: "100%", width: `${pct}%`, transition: "width 0.2s" }} />
            </div>
          </div>
        )}
        {done && (
          <div style={{ background: "#10b981", color: "white", padding: "16px", borderRadius: "8px", fontWeight: 700 }}>
            ✓ Done! pcb_training_data.zip downloaded.
          </div>
        )}
        {error && (
          <div style={{ background: "#ef4444", color: "white", padding: "16px", borderRadius: "8px" }}>Error: {error}</div>
        )}
      </div>
    </div>
  );
}
