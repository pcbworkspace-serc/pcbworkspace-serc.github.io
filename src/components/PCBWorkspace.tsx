import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text } from "@react-three/drei";
import * as THREE from "three";
import { handleChatInput } from "@/lib/robot";
import { useState, useCallback, useEffect, useMemo, useRef } from "react";

interface DroppedItem {
  type: string;
  x: number;
  y: number;
}

type PCBWorkspaceProps = {
  items?: DroppedItem[];
  onItemsChange?: (items: DroppedItem[]) => void;
};

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

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

// ... keep the rest of your component definitions as-is ...

export default function PCBWorkspace({ items, onItemsChange }: PCBWorkspaceProps) {
  const [droppedItems, setDroppedItems] = useState<DroppedItem[]>(items ?? []);
  const channelCountRef = useRef(0);

  // --- Robot/Chat UI state ---
  const [chatOpen, setChatOpen] = useState(true);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "system", content: "Robot ready. Try: Place R1, Place C1, or Add ChannelPort." },
  ]);

  useEffect(() => {
    if (items) {
      setDroppedItems(items);
    }
  }, [items]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 6 - 3;
    const y = ((e.clientY - rect.top) / rect.height) * -4 + 2;

    // Snap to 0.1 unit grid for high precision
    const gridSize = 0.1;
    const snappedX = Math.round(x / gridSize) * gridSize;
    const snappedY = Math.round(y / gridSize) * gridSize;

    setDroppedItems((prev) => {
      const updated = [...prev, { type, x: snappedX, y: snappedY }];
      onItemsChange?.(updated);
      return updated;
    });
  }, [onItemsChange]);

  const submitChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text || chatBusy) return;

    setChatBusy(true);
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      // handleChatInput is expected to mutate items via the setter
      await handleChatInput(text, droppedItems, (nextItems: DroppedItem[]) => {
        setDroppedItems(nextItems);
        onItemsChange?.(nextItems);
      });

      setChatMessages((prev) => [...prev, { role: "assistant", content: "Done." }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setChatBusy(false);
    }
  }, [chatInput, chatBusy, droppedItems, onItemsChange]);

  return (
    <div
      className="w-full h-full relative"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <Canvas camera={{ position: [4, 5, 4], fov: 50 }} shadows>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />
        <PCBBoard />
        <Grid
          infiniteGrid
          cellSize={0.1}
          cellThickness={0.3}
          cellColor="#004466"
          sectionSize={0.5}
          sectionThickness={0.8}
          sectionColor="#0077aa"
          fadeDistance={25}
          fadeStrength={1.5}
          followCamera={false}
          position={[0, -0.12, 0]}
        />
        {(() => {
          channelCountRef.current = 0;
          return droppedItems.map((item, i) => {
            const isChannel = item.type === "Channel Port" || item.type === "ChannelPort";
            if (isChannel) channelCountRef.current++;
            return (
              <PCBComponent
                key={i}
                position={[item.x, -0.03, item.y]}
                label={item.type}
                channelNumber={isChannel ? channelCountRef.current : undefined}
              />
            );
          });
        })()}
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          maxPolarAngle={Math.PI / 2.1}
          minDistance={2}
          maxDistance={15}
        />
      </Canvas>

      {/* Chat toggle button */}
      <button
        type="button"
        onClick={() => setChatOpen((v) => !v)}
        className="absolute top-3 right-3 z-50 bg-black/70 text-white px-3 py-2 rounded"
      >
        {chatOpen ? "Hide Robot" : "Show Robot"}
      </button>

      {/* Chat panel */}
      {chatOpen && (
        <div className="absolute top-14 right-3 z-50 w-[360px] max-w-[90vw] h-[520px] max-h-[75vh] bg-black/70 text-white rounded border border-white/10 backdrop-blur flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 font-semibold">PCB Robot</div>

          <div className="flex-1 overflow-auto p-3 space-y-2 text-sm">
            {chatMessages.map((m, idx) => (
              <div key={idx} className={m.role === "user" ? "text-right" : "text-left"}>
                <div className="inline-block px-2 py-1 rounded bg-white/10">
                  <span className="opacity-70 mr-2">{m.role}:</span>
                  <span>{m.content}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-white/10 flex gap-2">
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitChat();
              }}
              className="flex-1 rounded px-2 py-2 text-black"
              placeholder='Try: "Place Resistor at x=1 y=0"'
              disabled={chatBusy}
            />
            <button
              type="button"
              onClick={submitChat}
              className="px-3 py-2 rounded bg-emerald-500 text-black font-semibold disabled:opacity-50"
              disabled={chatBusy || !chatInput.trim()}
            >
              {chatBusy ? "..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
