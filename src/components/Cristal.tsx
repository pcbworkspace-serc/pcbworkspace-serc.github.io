import { useEffect, useState } from "react";

interface CristalProps {
  crystalCount: number;
}

export default function Cristal({ crystalCount }: CristalProps) {
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    if (crystalCount === 0) return;
    setWalking(true);
    const t = setTimeout(() => setWalking(false), 14000);
    return () => clearTimeout(t);
  }, [crystalCount]);

  if (!walking) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 60,
        left: "-180px",
        width: 160,
        height: 100,
        pointerEvents: "none",
        zIndex: 50,
        animation: "cristal-walk 14s linear forwards",
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}cristal.gif`}
        alt="Cristal"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.4))",
        }}
      />
      <style>{`
        @keyframes cristal-walk {
          0%   { transform: translate(0, 0); }
          100% { transform: translate(1500px, -300px); }
        }
      `}</style>
    </div>
  );
}