import { useEffect, useState } from "react";
import {
  isRecording, getFrameCount, startRecording, stopRecording,
  discardEpisode, downloadEpisode, onTeachChange,
} from "@/lib/teach";

/**
 * Teach Mode pill — sits in the top bar next to the Robot Connect badge.
 *
 *  • Click idle pill → starts recording. Every robot command from now on is
 *    captured into a LeRobot-format episode.
 *  • Click recording pill → popover with frame count, last 3 actions,
 *    Save Episode (downloads JSON), Discard.
 */
export default function TeachMode() {
  const [recording, setRecording] = useState(isRecording());
  const [count, setCount] = useState(getFrameCount());
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState("PCB assembly demonstration");

  useEffect(() => {
    return onTeachChange(() => {
      setRecording(isRecording());
      setCount(getFrameCount());
    });
  }, []);

  const handleClick = () => {
    if (!recording) {
      startRecording();
      setOpen(false);
    } else {
      setOpen((v) => !v);
    }
  };

  const handleSave = () => {
    if (!task.trim()) return;
    const ok = downloadEpisode(task.trim());
    if (!ok) {
      alert("No actions recorded yet. Send some robot commands first.");
      return;
    }
    setOpen(false);
  };

  const handleDiscard = () => {
    if (count > 0 && !window.confirm(`Discard ${count} recorded action${count === 1 ? "" : "s"}?`)) return;
    discardEpisode();
    setOpen(false);
  };

  const handleStopWithoutSave = () => {
    stopRecording();
    setOpen(false);
  };

  // Pill appearance
  const pillStyle = recording
    ? "bg-red-500/20 text-red-300 border-red-400/60"
    : "bg-purple-500/15 text-purple-300 border-purple-400/50";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors hover:opacity-90 flex items-center gap-1.5 ${pillStyle}`}
        title={
          recording
            ? `Recording demonstration — ${count} actions captured`
            : "Start recording a LeRobot demonstration episode"
        }
      >
        <span className={`inline-block w-1.5 h-1.5 rounded-full ${recording ? "bg-red-400 animate-pulse" : "bg-purple-400"}`} />
        {recording ? `REC (${count})` : "Teach Mode"}
      </button>

      {open && recording && (
        <div className="absolute right-0 mt-2 z-50 w-[340px] rounded-lg border border-red-400/30 bg-black/95 shadow-2xl backdrop-blur-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Recording Demonstration</span>
            <span className="text-[10px] font-mono text-red-200">{count} action{count === 1 ? "" : "s"}</span>
          </div>

          <div className="px-3 py-2 bg-black/60 text-[10px] text-white/70">
            Every robot command you send is being captured.{" "}
            {count === 0
              ? "Send a command (e.g. type `home` in Layla's chat) to begin."
              : "When you're done teaching, save it as a LeRobot-compatible JSON episode."}
          </div>

          <div className="px-3 py-2 border-t border-white/10 bg-black/40">
            <label className="text-[9px] font-bold uppercase tracking-wider text-white/50">Task description</label>
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full mt-1 text-[10px] font-mono bg-white/5 border border-white/15 rounded px-2 py-1 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/60"
              placeholder="e.g. Place 4 resistors in a row"
            />
          </div>

          <div className="flex items-center gap-1 px-2 py-2 border-t border-white/10 bg-black/40">
            <button
              type="button"
              onClick={handleSave}
              disabled={count === 0}
              className="flex-1 text-[10px] font-bold text-purple-200 hover:text-purple-100 disabled:opacity-40 border border-purple-400/40 hover:border-purple-400/70 rounded px-2 py-1"
            >
              Save Episode
            </button>
            <button
              type="button"
              onClick={handleStopWithoutSave}
              className="text-[10px] font-bold text-white/60 hover:text-white border border-white/20 hover:border-white/50 rounded px-2 py-1"
            >
              Pause
            </button>
            <button
              type="button"
              onClick={handleDiscard}
              className="text-[10px] font-bold text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400/70 rounded px-2 py-1"
            >
              Discard
            </button>
          </div>

          <div className="px-3 py-1.5 border-t border-white/10 bg-black/30 text-[9px] text-white/40 leading-snug">
            Output: LeRobot-compatible JSON ({"{"}meta, frames[]{"}"}). Convert to a LeRobotDataset with a small Python script and use it for imitation learning.
          </div>
        </div>
      )}
    </div>
  );
}
