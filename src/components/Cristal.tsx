import { useEffect, useState } from "react";

/**
 * Cristal — easter egg siamese cat that strolls across the workspace once
 * whenever a Crystal component is placed. Named after the developer's cat.
 * Adult profile, walking right, one pass only.
 */
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
        bottom: 12,
        left: "-160px",
        width: 140,
        height: 80,
        pointerEvents: "none",
        zIndex: 50,
        animation: "cristal-walk 14s linear forwards",
      }}
    >
      <div style={{ animation: "cristal-bounce 0.85s ease-in-out infinite" }}>
        <svg viewBox="0 0 200 110" width="140" height="80">
          <defs>
            <linearGradient id="cristalBody" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f7ecda" />
              <stop offset="60%" stopColor="#ecdcc0" />
              <stop offset="100%" stopColor="#d9c4a3" />
            </linearGradient>
            <radialGradient id="cristalHaunch" cx="0.5" cy="0.4" r="0.6">
              <stop offset="0%" stopColor="#f7ecda" />
              <stop offset="100%" stopColor="#c9b393" />
            </radialGradient>
          </defs>

          {/* tail — long, low, slight curl at tip, dark brown */}
          <path d="M 18 70 Q 28 64 42 66" stroke="#3a2510" strokeWidth="6" fill="none" strokeLinecap="round" />
          <path d="M 18 70 Q 28 64 42 66" stroke="#5a3a1f" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />

          {/* haunch / back leg muscle area */}
          <ellipse cx="58" cy="62" rx="20" ry="20" fill="url(#cristalHaunch)" />

          {/* body — long and lean */}
          <path d="M 50 55 Q 70 48 110 50 Q 145 52 158 56 Q 162 60 158 66 Q 145 72 110 70 Q 70 70 50 65 Z"
                fill="url(#cristalBody)" />
          {/* back arch line */}
          <path d="M 50 55 Q 80 46 110 49 Q 140 52 158 56" stroke="#d9c4a3" strokeWidth="0.5" fill="none" opacity="0.6" />

          {/* chest / belly underline */}
          <path d="M 68 68 Q 95 73 130 70" stroke="#c9b393" strokeWidth="1" fill="none" opacity="0.5" />

          {/* BACK LEGS — dark brown points */}
          {/* far back leg */}
          <g>
            <path d="M 54 70 Q 50 80 49 86" stroke="#3a2510" strokeWidth="7" fill="none" strokeLinecap="round" />
            <ellipse cx="49" cy="88" rx="5" ry="2.5" fill="#1f1408">
              <animate attributeName="cy" values="88;84;88" dur="1.7s" repeatCount="indefinite" />
            </ellipse>
            <animate attributeName="opacity" values="0.85;1;0.85" dur="1.7s" repeatCount="indefinite" />
          </g>
          {/* near back leg */}
          <g>
            <path d="M 64 70 Q 64 80 66 86" stroke="#5a3a1f" strokeWidth="7" fill="none" strokeLinecap="round">
              <animate attributeName="d"
                values="M 64 70 Q 64 80 66 86; M 64 70 Q 68 78 72 82; M 64 70 Q 64 80 66 86"
                dur="1.7s" repeatCount="indefinite" />
            </path>
            <ellipse cx="66" cy="88" rx="5" ry="2.5" fill="#1f1408">
              <animate attributeName="cx" values="66;72;66" dur="1.7s" repeatCount="indefinite" />
              <animate attributeName="cy" values="88;83;88" dur="1.7s" repeatCount="indefinite" />
            </ellipse>
          </g>

          {/* FRONT LEGS — dark brown points */}
          {/* far front leg */}
          <g>
            <path d="M 138 68 Q 137 80 136 86" stroke="#3a2510" strokeWidth="6" fill="none" strokeLinecap="round" />
            <ellipse cx="136" cy="88" rx="4.5" ry="2.5" fill="#1f1408">
              <animate attributeName="cy" values="88;84;88" dur="1.7s" repeatCount="indefinite" begin="0.85s" />
            </ellipse>
          </g>
          {/* near front leg — animated forward step */}
          <g>
            <path d="M 148 68 Q 150 80 152 86" stroke="#5a3a1f" strokeWidth="6" fill="none" strokeLinecap="round">
              <animate attributeName="d"
                values="M 148 68 Q 150 80 152 86; M 148 68 Q 154 78 158 82; M 148 68 Q 150 80 152 86"
                dur="1.7s" repeatCount="indefinite" begin="0.85s" />
            </path>
            <ellipse cx="152" cy="88" rx="4.5" ry="2.5" fill="#1f1408">
              <animate attributeName="cx" values="152;158;152" dur="1.7s" repeatCount="indefinite" begin="0.85s" />
              <animate attributeName="cy" values="88;83;88" dur="1.7s" repeatCount="indefinite" begin="0.85s" />
            </ellipse>
          </g>

          {/* shoulder blade hint */}
          <ellipse cx="138" cy="56" rx="10" ry="8" fill="url(#cristalHaunch)" opacity="0.6" />

          {/* neck — angled forward and slightly down */}
          <path d="M 152 56 Q 162 50 170 46" stroke="#f7ecda" strokeWidth="13" fill="none" strokeLinecap="round" />

          {/* head — pointed siamese wedge profile */}
          <path d="M 162 42 Q 170 36 184 38 Q 192 42 188 50 Q 180 54 168 52 Q 160 50 162 42 Z"
                fill="#f7ecda" />

          {/* dark mask — face points */}
          <path d="M 178 42 Q 192 42 190 50 Q 184 54 176 52 Q 176 46 178 42 Z" fill="#5a3a1f" />
          {/* mask edge softening */}
          <path d="M 174 44 Q 178 42 184 43" stroke="#8a6038" strokeWidth="1" fill="none" opacity="0.5" />

          {/* ears — large pointed siamese ears, dark */}
          <polygon points="164,38 162,22 174,32" fill="#3a2510" />
          <polygon points="166,34 165,26 171,32" fill="#e8a8a8" opacity="0.7" />
          <polygon points="176,34 178,18 184,32" fill="#3a2510" />
          <polygon points="178,30 179,22 182,30" fill="#e8a8a8" opacity="0.7" />

          {/* eye — almond, bright blue, profile */}
          <ellipse cx="180" cy="44" rx="2.5" ry="3" fill="#5ab8ff" />
          <ellipse cx="180" cy="44" rx="1" ry="2.8" fill="#0a0a0a" />
          <circle cx="180.5" cy="43" r="0.5" fill="#fff" />
          {/* eye outline */}
          <path d="M 178 42 Q 180 41 183 43" stroke="#3a2510" strokeWidth="0.4" fill="none" />
          <path d="M 178 46 Q 180 47 183 45" stroke="#3a2510" strokeWidth="0.4" fill="none" />

          {/* nose — small pink */}
          <ellipse cx="190" cy="47" rx="1.5" ry="1.2" fill="#d49a9a" />

          {/* mouth */}
          <path d="M 190 49 Q 187 51 184 50" stroke="#3a2510" strokeWidth="0.5" fill="none" strokeLinecap="round" />

          {/* whiskers */}
          <line x1="185" y1="48" x2="172" y2="46" stroke="#2a1a08" strokeWidth="0.3" opacity="0.7" />
          <line x1="185" y1="49" x2="172" y2="50" stroke="#2a1a08" strokeWidth="0.3" opacity="0.7" />
          <line x1="190" y1="48" x2="198" y2="44" stroke="#2a1a08" strokeWidth="0.3" opacity="0.7" />
          <line x1="190" y1="50" x2="198" y2="52" stroke="#2a1a08" strokeWidth="0.3" opacity="0.7" />
        </svg>
      </div>
      <style>{`
        @keyframes cristal-walk {
          0%   { transform: translateX(0); }
          100% { transform: translateX(1400px); }
        }
        @keyframes cristal-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.5px); }
        }
      `}</style>
    </div>
  );
}