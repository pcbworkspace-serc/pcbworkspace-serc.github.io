import { useEffect, useState } from "react";
import { listSavedPlans, deletePlan, type SavedPlan } from "@/lib/plans";

interface PlanLibraryProps {
  onClose: () => void;
  onSelect: (plan: SavedPlan) => void;
}

/**
 * Popover panel showing all saved VLA plans. Click a row to execute it
 * (re-uses the captured action sequence — no LLM round-trip).
 *
 * Rendered conditionally from PCBRobot.tsx; positioning is anchored to
 * the parent's relative container.
 */
export default function PlanLibrary({ onClose, onSelect }: PlanLibraryProps) {
  const [plans, setPlans] = useState<SavedPlan[]>([]);

  useEffect(() => {
    setPlans(listSavedPlans());
  }, []);

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this saved plan?")) return;
    deletePlan(id);
    setPlans(listSavedPlans());
  };

  const handleSelect = (plan: SavedPlan) => {
    onSelect(plan);
  };

  return (
    <div className="absolute top-12 right-2 z-40 w-[320px] rounded-lg border border-purple-400/30 bg-black/95 shadow-2xl backdrop-blur-sm overflow-hidden">
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-purple-300">
          Saved Plans
        </span>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-white/50 hover:text-white"
        >
          ✕
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="px-3 py-4 text-[10px] text-white/50 text-center leading-relaxed">
          No saved plans yet.<br/>
          Run a VLA plan that works well, then click "Save plan" in the chat to add one.
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="px-3 py-2 border-b border-white/5 hover:bg-purple-500/10 cursor-pointer group"
              onClick={() => handleSelect(plan)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-white truncate">
                    {plan.name}
                  </div>
                  <div className="text-[9px] text-white/50 truncate mt-0.5">
                    {plan.instruction}
                  </div>
                  <div className="text-[9px] text-white/30 mt-1 font-mono">
                    {plan.actions.length} step{plan.actions.length === 1 ? "" : "s"}
                    {plan.useCount > 0 && ` · used ${plan.useCount}×`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleDelete(plan.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-[10px] text-red-400 hover:text-red-300 transition-opacity flex-shrink-0"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-3 py-1.5 border-t border-white/10 bg-black/40 text-[9px] text-white/40">
        Click a plan to execute immediately. No LLM cost — replays exactly.
      </div>
    </div>
  );
}
