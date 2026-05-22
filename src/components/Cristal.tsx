import { useEffect, useState } from "react";

/**
 * Cristal — easter egg siamese cat that strolls across the workspace once
 * whenever a Crystal component is placed. Named after the developer's cat.
 * Profile view, adult proportions, slow lazy gait. One pass per placement.
 */
interface CristalProps {
  crystalCount: number;
}

export default function Cristal({ crystalCount }: CristalProps) {
  const [walking, setWalking] = useState(false);

  useEffect(() => {
    if (crystalCount === 0) return;
    setWalking(true);
    const t = setTimeout(() => setWalking(false), 16000);
    return () => clearTimeout(t);
  }, [crystalCount]);

  if (!walking) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 18,
        left: "-130px",
        width: 110,
        height: 70,
        pointerEvents: "none",
        zIndex: 50,
        animation: "cristal-walk 16s linear forwards",
      }}
    >
      <div style={{ animation: "cristal-bounce 0.9s ease-in-out infinite" }}>
        <svg viewBox="0 0 160 90" width="110" height="70">
          {/* tail — long, curved up, swishing */}
          <path d="M 22 50 Q 4 38 6 18 Q 8 6 16 8" stroke="#5a3a1f" strokeWidth="5" fill="none" strokeLinecap="round">
            <animate attributeName="d"
              values="M 22 50 Q 4 38 6 18 Q 8 6 16 8;
                      M 22 50 Q 2 42 4 22 Q 4 8 14 10;
                      M 22 50 Q 4 38 6 18 Q 8 6 16 8"
              dur="2.2s" repeatCount="indefinite" />
          </path>
          {/* tail cream highlight */}
          <path d="M 22 50 Q 4 38 6 18 Q 8 6 16 8" stroke="#f5e6d3" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.5" />

          {/* body — elongated cream torso */}
          <ellipse cx="65" cy="50" rx="38" ry="14" fill="#f5e6d3" />
          {/* belly shadow */}
          <ellipse cx="65" cy="56" rx="32" ry="6" fill="#e8d6bf" opacity="0.6" />

          {/* back leg far — animated step */}
          <g>
            <rect x="38" y="58" width="6" height="14" fill="#5a3a1f" rx="2">
              <animate attributeName="height" values="14;10;14" dur="1.8s" repeatCount="indefinite" />
              <animate attributeName="y" values="58;58;58" dur="1.8s" repeatCount="indefinite" />
            </rect>
            <ellipse cx="41" cy="73" rx="4" ry="2" fill="#3a2510">
              <animate attributeName="cy" values="73;69;73" dur="1.8s" repeatCount="indefinite" />
            </ellipse>
          </g>
          {/* back leg near */}
          <g>
            <rect x="48" y="58" width="6" height="14" fill="#6b4423" rx="2">
              <animate attributeName="height" values="10;14;10" dur="1.8s" repeatCount="indefinite" />
            </rect>
            <ellipse cx="51" cy="73" rx="4" ry="2" fill="#3a2510">
              <animate attributeName="cy" values="69;73;69" dur="1.8s" repeatCount="indefinite" />
            </ellipse>
          </g>
          {/* front leg far */}
          <g>
            <rect x="86" y="58" width="6" height="14" fill="#5a3a1f" rx="2">
              <animate attributeName="height" values="10;14;10" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
            </rect>
            <ellipse cx="89" cy="73" rx="4" ry="2" fill="#3a2510">
              <animate attributeName="cy" values="69;73;69" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
            </ellipse>
          </g>
          {/* front leg near */}
          <g>
            <rect x="96" y="58" width="6" height="14" fill="#6b4423" rx="2">
              <animate attributeName="height" values="14;10;14" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
            </rect>
            <ellipse cx="99" cy="73" rx="4" ry="2" fill="#3a2510">
              <animate attributeName="cy" values="73;69;73" dur="1.8s" repeatCount="indefinite" begin="0.9s" />
            </ellipse>
          </g>

          {/* neck — narrow bridge between body and head */}
          <path d="M 102 48 Q 108 42 116 38" stroke="#f5e6d3" strokeWidth="11" fill="none" strokeLinecap="round" />

          {/* head — profile view, pointing right */}
          <ellipse cx="124" cy="32" rx="14" ry="11" fill="#f5e6d3" />
          {/* siamese face mask — covers muzzle and around eye */}
          <ellipse cx="134" cy="34" rx="9" ry="7" fill="#6b4423" />
          {/* cream stripe down face */}
          <ellipse cx="128" cy="31" rx="3" ry="6" fill="#f5e6d3" />
          {/* chin */}
          <ellipse cx="134" cy="38" rx="4" ry="2" fill="#f5e6d3" />

          {/* ear far (smaller, slightly behind) */}
          <polygon points="118,22 116,10 124,18" fill="#5a3a1f" />
          <polygon points="119,20 118,14 122,18" fill="#f4a8a8" />
          {/* ear near */}
          <polygon points="128,20 126,6 134,16" fill="#6b4423" />
          <polygon points="129,18 128,10 132,16" fill="#f4a8a8" />

          {/* single eye visible (profile) — blue almond */}
          <ellipse cx="130" cy="29" rx="2.2" ry="2.8" fill="#5ab0ff" />
          <ellipse cx="130" cy="29" rx="0.9" ry="2.4" fill="#000" />
          <circle cx="130.5" cy="28.5" r="0.5" fill="#fff" />

          {/* pink nose at tip of muzzle */}
          <ellipse cx="140" cy="34" rx="1.8" ry="1.5" fill="#e8a8a8" />
          {/* mouth */}
          <path d="M 140 36 Q 138 38 136 37" stroke="#3a2510" strokeWidth="0.6" fill="none" strokeLinecap="round" />
          {/* whiskers */}
          <line x1="136" y1="35" x2="128" y2="34" stroke="#3a2510" strokeWidth="0.4" />
          <line x1="136" y1="36" x2="128" y2="37" stroke="#3a2510" strokeWidth="0.4" />
          <line x1="139" y1="35" x2="146" y2="33" stroke="#3a2510" strokeWidth="0.4" />
          <line x1="139" y1="36" x2="146" y2="38" stroke="#3a2510" strokeWidth="0.4" />
        </svg>
      </div>
      <style>{`
        @keyframes cristal-walk {
          0%   { transform: translateX(0)         scaleX(1); }
          47%  { transform: translateX(1100px)    scaleX(1); }
          50%  { transform: translateX(1100px)    scaleX(-1); }
          100% { transform: translateX(0)         scaleX(-1); }
        }
        @keyframes cristal-bounce {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-2px); }
        }
      `}</style>
    </div>
  );
}