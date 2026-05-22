import { useEffect, useState } from "react";

/**
 * Cristal — a tiny easter egg siamese cat that walks across the bottom of the
 * workspace once whenever a Crystal component is placed. Named after the
 * developer's cat. One pass per placement, then disappears.
 */
interface CristalProps {
  crystalCount: number;  // bump this whenever a Crystal is added
}

export default function Cristal({ crystalCount }: CristalProps) {
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    if (crystalCount === 0) return;
    setWalking(true);
    const t = setTimeout(() => setWalking(false), 9000);  // walk takes 9s
    return () => clearTimeout(t);
  }, [crystalCount]);

  if (!walking) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 14,
        left: "-80px",
        width: 70,
        height: 40,
        pointerEvents: "none",
        zIndex: 50,
        animation: "cristal-walk 9s linear forwards",
      }}
    >
      <svg viewBox="0 0 100 60" width="70" height="40">
        {/* tail — slightly waving */}
        <path d="M 18 38 Q 4 30 8 14" stroke="#6b4423" strokeWidth="4" fill="none" strokeLinecap="round">
          <animate attributeName="d" values="M 18 38 Q 4 30 8 14; M 18 38 Q 2 34 10 18; M 18 38 Q 4 30 8 14" dur="0.8s" repeatCount="indefinite" />
        </path>
        {/* body — cream */}
        <ellipse cx="50" cy="38" rx="26" ry="13" fill="#f5e6d3" />
        {/* back legs (animated walking) */}
        <rect x="32" y="44" width="5" height="10" fill="#6b4423" rx="1">
          <animate attributeName="y" values="44;48;44" dur="0.4s" repeatCount="indefinite" />
        </rect>
        <rect x="60" y="44" width="5" height="10" fill="#6b4423" rx="1">
          <animate attributeName="y" values="48;44;48" dur="0.4s" repeatCount="indefinite" />
        </rect>
        {/* front legs */}
        <rect x="68" y="44" width="5" height="10" fill="#6b4423" rx="1">
          <animate attributeName="y" values="44;48;44" dur="0.4s" repeatCount="indefinite" begin="0.2s" />
        </rect>
        <rect x="38" y="44" width="5" height="10" fill="#6b4423" rx="1">
          <animate attributeName="y" values="48;44;48" dur="0.4s" repeatCount="indefinite" begin="0.2s" />
        </rect>
        {/* head */}
        <circle cx="76" cy="30" r="13" fill="#f5e6d3" />
        {/* face mask — siamese brown */}
        <ellipse cx="76" cy="34" rx="9" ry="7" fill="#6b4423" />
        <ellipse cx="76" cy="32" rx="6" ry="4" fill="#f5e6d3" />
        {/* ears */}
        <polygon points="68,22 70,12 75,20" fill="#6b4423" />
        <polygon points="84,22 82,12 77,20" fill="#6b4423" />
        <polygon points="70,20 71,16 74,20" fill="#f4a8a8" />
        <polygon points="82,20 81,16 78,20" fill="#f4a8a8" />
        {/* eyes — blue siamese */}
        <ellipse cx="72" cy="29" rx="1.8" ry="2.2" fill="#4a9eff" />
        <ellipse cx="80" cy="29" rx="1.8" ry="2.2" fill="#4a9eff" />
        <circle cx="72" cy="29" r="0.8" fill="#000" />
        <circle cx="80" cy="29" r="0.8" fill="#000" />
        {/* nose */}
        <polygon points="76,33 74,35 78,35" fill="#f4a8a8" />
        {/* whiskers */}
        <line x1="70" y1="36" x2="64" y2="35" stroke="#000" strokeWidth="0.4" />
        <line x1="70" y1="37" x2="64" y2="38" stroke="#000" strokeWidth="0.4" />
        <line x1="82" y1="36" x2="88" y2="35" stroke="#000" strokeWidth="0.4" />
        <line x1="82" y1="37" x2="88" y2="38" stroke="#000" strokeWidth="0.4" />
      </svg>
      <style>{`
        @keyframes cristal-walk {
          0%   { transform: translateX(0)        scaleX(1); }
          48%  { transform: translateX(900px)    scaleX(1); }
          52%  { transform: translateX(900px)    scaleX(-1); }
          100% { transform: translateX(0)        scaleX(-1); }
        }
      `}</style>
    </div>
  );
}