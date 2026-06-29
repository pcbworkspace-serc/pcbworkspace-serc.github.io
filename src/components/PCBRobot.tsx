import { useState, useCallback, useRef, useEffect } from "react";
import { sendSerialCommand, getSerialStatus } from "@/lib/serial";
import { planAction, executePlan, type VLAAction, type BoardStateItem } from "@/lib/vla";
import { captureFrameByRole } from "@/lib/cameras";
import { savePlan, markPlanUsed, type SavedPlan } from "@/lib/plans";
import { grabCameraFrame } from "@/components/CameraFeed";
import PlanLibrary from "@/components/PlanLibrary";

type Message = { role: "user" | "assistant"; content: string };
type KBEntry = { keywords: string[]; answer: string };

const KB: KBEntry[] = [
 { keywords:["resistor","resistance","ohm","ohms law"], answer:"Great question! Resistors are fundamental to every circuit you will ever design. Ohm's Law ties it all together: V = I x R\n Power dissipated: P = IR = V/R\n Series: R_total = R1 + R2 (they add up)\n Parallel: 1/R_total = 1/R1 + 1/R2 (total is always less than the smallest)\n 4-band color code: Blk=0 Brn=1 Red=2 Org=3 Yel=4 Grn=5 Blu=6 Vio=7 Gry=8 Wht=9\nOnce you memorize the color code, reading resistors becomes second nature!\nSource: Sedra & Smith, Microelectronic Circuits Ch.1" },
 { keywords:["capacitor","capacitance","farad","decoupling","bypass"], answer:"Capacitors are endlessly useful they show up in almost every subsystem you will work with. C = Q/V\n Energy stored: E = 0.5CV\n Impedance: Z = 1/(jwC) short circuit at high frequencies, open at DC\n Series: 1/C = 1/C1 + 1/C2 | Parallel: C = C1 + C2\n One of the most impactful things you can do on a PCB: place a 100nF decoupling cap within 1mm of every IC power pin. It genuinely makes a difference.\n Electrolytic caps are polarized longer lead is positive, never reverse them.\nSource: Horowitz & Hill, The Art of Electronics Ch.1" },
 { keywords:["inductor","inductance","henry","coil","choke"], answer:"Inductors resist changes in current they are the complement to capacitors in almost every way.\n Governing equation: V = L x dI/dt\n Energy stored: E = 0.5LI\n Impedance: Z = jwL open at high frequencies, short at DC (exactly opposite to a capacitor)\n Essential for switching power supplies, EMI filters, and RF matching networks\n Watch out for the self-resonant frequency operating above it defeats the purpose.\nSource: Horowitz & Hill Ch.1" },
 { keywords:["diode","pn junction","forward bias","rectifier","schottky","zener"], answer:"Diodes are one of the most elegant components in electronics current flows in one direction only.\n Forward voltage: ~0.7V silicon, ~0.3V Schottky, 1.8-3.5V for LEDs\n Zener diodes conduct in reverse at a defined breakdown voltage excellent for voltage clamping and regulation\n Schottky diodes switch faster and have lower Vf preferred for high-speed and power applications\n Polarity matters! Mark the cathode band clearly on your silkscreen it is a simple step that prevents a frustrating mistake.\nSource: Sedra & Smith Ch.3" },
 { keywords:["transistor","bjt","mosfet","npn","pnp","amplifier","switch","fet"], answer:"Transistors are the foundation of modern electronics every processor, amplifier, and power switch relies on them.\n**BJT (current-controlled):** Ic = Beta x Ib\n NPN: Vbe ~0.7V to turn on | Beta typically 50-500\n**MOSFET (voltage-controlled):**\n NMOS: requires Vgs > Vth to conduct (typically 1-3V)\n Near-zero gate current makes MOSFETs ideal for power switching\n PCB tip: a 10-33 ohm gate resistor with short gate traces prevents oscillation a small detail with real impact.\nSource: Sedra & Smith Ch.4-5" },
 { keywords:["led","light emitting","brightness","current limiting"], answer:"LEDs require a current-limiting resistor without one, they will draw too much current and fail quickly.\n Forward voltage: Red 1.8-2.2V | Green 2-3.5V | Blue/White 3-3.5V\n Typical operating current: 10-20mA\n Resistor formula: R = (Vsupply - Vf) / I_LED\n Example: 5V supply, red LED (Vf=2V), 20mA R = (5-2)/0.02 = 150 ohm\n Identification: longer lead = anode (+), flat edge on dome = cathode (-)\nSource: Horowitz & Hill Ch.2" },
 { keywords:["pcb","printed circuit","trace","via","layer","gerber","copper"], answer:"PCB design is where theory meets hardware getting the fundamentals right here pays dividends throughout the project.\n Trace width: IPC-2221 is your reference 1oz copper, 1A ~0.25mm on external layer\n Clearance: 0.1mm minimum for low-voltage signals, more for anything higher\n Vias: 0.3mm minimum drill, 0.6mm pad for standard fab\n A solid ground plane on an inner layer is one of the best investments you can make for EMI performance\n Always include 3 fiducial markers for pick-and-place alignment this robot uses them!\nSource: IPC-2221 Standard, Grover & Ghassemi PCB Design Techniques" },
 { keywords:["smd","surface mount","reflow","solder","paste","soldering","assembly"], answer:"SMT assembly is a precise process small variations in paste volume or thermal profile can affect yield significantly.\n Reflow profile: Preheat 150C Soak Peak 220-250C (SAC305 lead-free) Controlled cool\n Stencil thickness: 0.12mm for 0402 components, 0.15mm for larger\n Tombstoning occurs when heating is uneven or pads are asymmetric balanced pad design prevents it\n This robot arm places components with sub-millimeter accuracy using JEPA vision correction that is exactly what the alignment system is for.\nSource: IPC-7711, J-STD-001" },
 { keywords:["opamp","op-amp","operational amplifier","gain","feedback"], answer:"Op-amps are remarkably versatile with the right feedback network, a single device can amplify, filter, compare, or buffer.\n Inverting: Vout = -(Rf/Rin) x Vin\n Non-inverting: Vout = (1 + Rf/Rin) x Vin\n Unity-gain buffer: Vout = Vin invaluable for impedance isolation\n Virtual ground principle: V+ = V- in negative feedback understanding this unlocks most op-amp analysis\n PCB tip: a small capacitor (100pF) across the feedback resistor improves phase margin. Always bypass supply pins with 100nF.\nSource: Sedra & Smith Ch.2" },
 { keywords:["power supply","ldo","buck","boost","regulator","switching","voltage"], answer:"Choosing the right power topology early saves significant redesign effort later.\n LDO: Vout = Vref x (1 + R1/R2) | Simple, low noise, but efficiency = Vout/Vin excess becomes heat\n Buck (step-down): Vout = D x Vin | 85-95% efficient the right choice for most battery-powered designs\n Boost (step-up): Vout = Vin/(1-D)\n PCB tip: minimize the switching loop area, place input capacitors close to the switch node, and use wide traces for high-current paths.\nSource: Razavi Ch.11, Texas Instruments Power Design Seminar" },
 { keywords:["filter","low pass","high pass","cutoff","rc filter","lc filter"], answer:"Filters are essential for signal conditioning, noise rejection, and power supply design.\n RC Low-Pass: fc = 1/(2*pi*R*C) | -20dB/decade rolloff above fc\n RC High-Pass: same formula, passes frequencies above fc\n LC Low-Pass: fc = 1/(2*pi*sqrt(LC)) | -40dB/decade sharper rolloff\n Butterworth: maximally flat passband, good general-purpose choice\n Chebyshev: steeper rolloff at the cost of passband ripple\n Higher-order filters give steeper rolloff but add component count and complexity.\nSource: Horowitz & Hill Ch.1" },
 { keywords:["uart","i2c","spi","serial","protocol","communication","can"], answer:"Choosing the right protocol comes down to speed, pin count, and distance requirements.\n UART: asynchronous, 2 wires, 9600-115200 baud simple and universally supported\n I2C: 2 wires, multi-device on one bus, requires 4.7k pull-ups, up to 1MHz\n SPI: 4 wires, full duplex, up to 50MHz+ fastest and simplest electrically, one CS per device\n CAN: differential pair, 120 ohm termination at each end, up to 1Mbps robust in electrically noisy environments\n For high-speed SPI: match trace impedance and keep clock lines short.\nSource: Horowitz & Hill Ch.14" },
 { keywords:["ground","grounding","emi","noise","plane","star ground"], answer:"Grounding strategy is one of the most overlooked aspects of PCB design and one of the most consequential.\n A continuous ground plane on an inner layer dramatically reduces impedance and EMI\n Star ground: bring all grounds to a single point best for mixed analog and digital designs\n Decoupling: 100nF ceramic at every IC power pin, plus 10uF bulk per power domain\n Never route a high-speed signal over a break in the ground plane the return current has nowhere clean to go\n Guard rings around sensitive analog circuits help reject interference from nearby digital signals.\nSource: Ott, Electromagnetic Compatibility Engineering" },
 { keywords:["jepa","neural network","alignment","vision","camera","machine learning","ai"], answer:"The JEPA Vision System is the intelligence behind this robot arm and it is genuinely interesting technology.\n JEPA stands for Joint Embedding Predictive Architecture, developed by Yann LeCun at Meta AI\n It learns PCB board structure from unlabeled camera footage no hand-labeling required for pretraining\n Three specialized inference heads:\n 1. ComponentDetector locates fiducials, classifies component types from the top camera\n 2. AlignmentCorrector computes the rotation and XY offset needed before each placement\n 3. PlacementValidator compares pre and post placement frames to verify success\n Achieves less than 2 degree rotation error and less than 0.2mm positional error\n Click JEPA Vision in the sidebar to run alignment live, or try the Demo to see the full pipeline." },
 { keywords:["place","placement","put","add","drag","drop"], answer:"Placing components on the board is straightforward.\n1. Locate the component in the Inventory panel on the left\n2. Click and drag it onto the PCB board\n3. Release to drop it at that position\nAvailable components: Resistor, Diode, Capacitor, LED, Transistor, Channel Port\nIn a real assembly workflow, this robot arm would pick and place each component using the JEPA vision system for sub-millimeter accuracy." },
 { keywords:["robot command","robot control","drive robot","control the robot","control robot","what can the robot do","robot commands"], answer:"You can drive the SCARA arm directly from this chat once connected. Click the **Connect Robot** badge in the top bar (top-right) first it opens a USB port picker.\n\n**Things you can type to me:**\n `home` return to home position\n `move 10 20` go to X=10mm, Y=20mm (add a 3rd or 4th number for Z and rotation)\n `pick` / `place` gripper close / open\n `rotate 90` rotate end-effector by 90\n `stop` emergency halt\n `scan`, `detect`, `align`, `validate` task verbs\n\n**Or turn on VLA Mode** (header button) to ask in plain English: *\"place a resistor in the upper left\"* or *\"pick up whatever is near the center and home\"* Layla will plan and execute the steps." },
 { keywords:["vla","vision language","gemini robotics","natural language robot"], answer:"VLA Mode (Vision-Language-Action) lets you control the robot with plain English instead of explicit commands.\n\n**To enable:** click the **VLA: OFF** button at the top of this panel it turns purple.\n\n**How it works:**\n1. Your message + current board state + (optionally) the camera frame are sent to your local Flask server at `127.0.0.1:5000/vla/plan`\n2. Anthropic Claude breaks the instruction into a sequence of robot actions (HOME, MOVE, PICK, PLACE)\n3. Each action is sent to your ESP32 over serial in order\n\n**Try:** *\"place a resistor 10mm from the lower left corner\"* or *\"go home and then move to the middle of the board\"*.\n\nRequires: local Flask running with the `flask_vla.py` route registered and `ANTHROPIC_API_KEY` set." },
 { keywords:["help","what can","commands","tutorial","how"], answer:"Happy to help! Here is what I can assist with:\n Electronics theory resistors, capacitors, inductors, transistors, op-amps, diodes\n PCB design trace width, clearance, via sizing, impedance, grounding, EMI\n Assembly SMT reflow, solder paste, component placement\n Communication protocols UART, I2C, SPI, CAN\n Power electronics LDO, buck, boost, filtering\n The JEPA Vision System how this robot arm uses AI for precision placement\n Component placement drag items from Inventory onto the board\n **Driving the SCARA robot** type `home`, `move 10 20`, `pick`, `place`, etc.\n **VLA Mode** toggle the VLA button to drive the robot with plain English\n\nSome questions to try:\n How do I calculate an LED current-limiting resistor?\n What is the difference between I2C and SPI?\n How does a buck converter work?" },
];

function findAnswer(input: string): string | null {
 const lower = input.toLowerCase();
 for (const e of KB) if (e.keywords.some(k => lower.includes(k))) return e.answer;
 return null;
}

function parseRobotCommand(text: string): string | null {
 const t = text.toLowerCase().trim();
 if (/^(go )?home$/.test(t)) return "HOME";
 if (/^(emergency )?stop$/.test(t) || t === "halt") return "STOP";
 if (/^pick( up)?$/.test(t)) return "PICK";
 if (/^(place|release|drop)$/.test(t)) return "PLACE";
 const rot = t.match(/^rotate\s+(-?\d+(?:\.\d+)?)\s*(?:deg|degrees?)?$/);
 if (rot) return `ROTATE ${rot[1]}`;
 const move = t.match(
 /^(?:move|move to|go to|goto)\s+(-?\d+(?:\.\d+)?)\s*,?\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?(?:\s+(-?\d+(?:\.\d+)?))?$/
 );
 if (move) {
 const x = move[1], y = move[2], z = move[3] ?? "0", r = move[4] ?? "0";
 return `MOVE X${x} Y${y} Z${z} R${r}`;
 }
 const single = t.match(/^(scan|detect|align|validate)$/);
 if (single) return single[1].toUpperCase();
 return null;
}

function RenderMsg({ content }: { content: string }) {
 return (
 <div className="space-y-0.5">
 {content.split("\n").map((line, i) => (
 <p key={i} className={["text-sm leading-relaxed", line.startsWith("") || line.startsWith(" ") ? "pl-2" : ""].join(" ")}>
 {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((part, j) => {
 if (part.startsWith("**") && part.endsWith("**"))
 return <strong key={j} className="text-white">{part.slice(2, -2)}</strong>;
 if (part.startsWith("`") && part.endsWith("`"))
 return <code key={j} className="px-1 py-0.5 rounded bg-black/40 text-[#00d4ff] text-[12px] font-mono">{part.slice(1, -1)}</code>;
 return part;
 })}
 </p>
 ))}
 </div>
 );
}

interface PCBRobotProps {
 boardItems?: BoardStateItem[];
 // Called whenever a plan is staged for confirmation (null = cleared)
 onPendingPlanChange?: (items: { type: string; x: number; y: number; rotation_deg: number }[] | null) => void;
}


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


// ── Arm-path diagram rendered during plan confirmation ────────────────────────
function PlanDiagram({ actions }: { actions: VLAAction[] }) {
  const W = 224, H = 128, PAD = 16;
  const bW = W - PAD * 2, bH = H - PAD * 2;

  // PCB mm -> SVG px  (flip Y so board top = SVG top)
  const pt = (xm: number, ym: number) => ({
    svgX: PAD + (xm / 62) * bW,
    svgY: H - PAD - (ym / 42) * bH,
  });

  // Build ordered waypoints from actions
  type WP = { svgX: number; svgY: number; kind: "home" | "transit" | "target" };
  const wps: WP[] = [{ ...pt(0, 0), kind: "home" }];
  for (const a of actions) {
    if (a.action === "move") {
      const m = a as VLAAction & { x_mm: number; y_mm: number; z_mm: number };
      wps.push({ ...pt(m.x_mm, m.y_mm), kind: m.z_mm <= 1 ? "target" : "transit" });
    }
  }

  const colDot  = (k: string) => k === "home" ? "#f59e0b" : k === "target" ? "#10b981" : "#00d4ff";
  const colLine = (k: string) => k === "target" ? "#10b981" : "#00d4ff";
  const dash    = (k: string) => k === "transit" ? "5 3" : "none";

  return (
    <svg width={W} height={H} style={{ display:"block", margin:"6px 0", borderRadius:6, background:"#060e1a" }}>
      <defs>
        <marker id="ac" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#00d4ff" strokeWidth="1.2"/>
        </marker>
        <marker id="ag" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,1 L6,3.5 L0,6" fill="none" stroke="#10b981" strokeWidth="1.2"/>
        </marker>
      </defs>

      {/* PCB board */}
      <rect x={PAD} y={PAD} width={bW} height={bH} fill="#0c3d1e" stroke="#1a7a3a" strokeWidth={1} rx={2}/>

      {/* Faint grid */}
      {[10,20,30,40,50].map(x => (
        <line key={"gx"+x}
          x1={PAD+(x/62)*bW} y1={PAD} x2={PAD+(x/62)*bW} y2={H-PAD}
          stroke="#1a7a3a" strokeWidth={0.3}/>
      ))}
      {[10,20,30].map(y => (
        <line key={"gy"+y}
          x1={PAD} y1={H-PAD-(y/42)*bH} x2={W-PAD} y2={H-PAD-(y/42)*bH}
          stroke="#1a7a3a" strokeWidth={0.3}/>
      ))}

      {/* Path segments */}
      {wps.slice(1).map((wp, i) => {
        const from = wps[i];
        const color = colLine(wp.kind);
        const mid = wp.kind === "target" ? "ag" : "ac";
        return (
          <line key={"seg"+i}
            x1={from.svgX} y1={from.svgY} x2={wp.svgX} y2={wp.svgY}
            stroke={color} strokeWidth={1.5}
            strokeDasharray={dash(wp.kind)}
            markerEnd={`url(#${mid})`}
          />
        );
      })}

      {/* Waypoint dots */}
      {wps.map((wp, i) => (
        <circle key={"dot"+i}
          cx={wp.svgX} cy={wp.svgY} r={i === 0 ? 5 : 3.5}
          fill={colDot(wp.kind)} stroke="#000" strokeWidth={0.5}/>
      ))}

      {/* Labels */}
      <text x={wps[0].svgX+7} y={wps[0].svgY+4}
        fill="#f59e0b" fontSize={8} fontFamily="monospace">HOME</text>
      {wps.length > 1 && (
        <text x={wps[wps.length-1].svgX+7} y={wps[wps.length-1].svgY+4}
          fill="#10b981" fontSize={8} fontFamily="monospace">
          {wps[wps.length-1].kind === "target" ? "PLACE" : "TARGET"}
        </text>
      )}

      {/* Legend */}
      <line x1={PAD} y1={H-4} x2={PAD+14} y2={H-4} stroke="#00d4ff" strokeWidth={1.5} strokeDasharray="5 3"/>
      <text x={PAD+17} y={H-1} fill="#00d4ff" fontSize={7} fontFamily="monospace">transit</text>
      <line x1={PAD+58} y1={H-4} x2={PAD+72} y2={H-4} stroke="#10b981" strokeWidth={1.5}/>
      <text x={PAD+75} y={H-1} fill="#10b981" fontSize={7} fontFamily="monospace">place</text>
    </svg>
  );
}

export default function PCBRobot({ boardItems = [], onPendingPlanChange }: PCBRobotProps) {
 const [visible, setVisible] = useState(true);
 const [vlaMode, setVlaMode] = useState(false);
 const [planLibraryOpen, setPlanLibraryOpen] = useState(false);
 const [lastPlan, setLastPlan] = useState<{ instruction: string; actions: VLAAction[] } | null>(null);
 // Confirmation gate: holds a staged plan until user confirms or cancels
 const [pendingPlan, setPendingPlan] = useState<{ instruction: string; actions: VLAAction[]; summary: string } | null>(null);
 const [messages, setMessages] = useState<Message[]>([{
 role: "assistant",
 content: "Hi! I am Layla, your PCB design assistant. Click any **Try:** pill below to drive the robot, toggle **VLA: ON** for natural language, or just ask me an electronics question."
 }]);
 const [input, setInput] = useState("");
 const [busy, setBusy] = useState(false);
 const [executing, setExecuting] = useState(false);
 const abortRef = useRef<AbortController | null>(null);
 const bottomRef = useRef<HTMLDivElement>(null);

 useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

 // Tell the parent which positions to preview on the Three.js board
 useEffect(() => {
 if (!onPendingPlanChange) return;
 if (!pendingPlan) { onPendingPlanChange(null); return; }
 const previewItems = pendingPlan.actions
 .filter(a => a.action === "move")
 .map(a => {
 const m = a as VLAAction & { x_mm: number; y_mm: number };
 // Three.js board uses the same x/y units as the VLA actions (mm → world units match)
 return { type: extractComponentType(pendingPlan.instruction), x: (m.x_mm - 31) / 10, y: (m.y_mm - 21) / 10, rotation_deg: 0 };
 });
 onPendingPlanChange(previewItems.length > 0 ? previewItems : null);
 }, [pendingPlan, onPendingPlanChange]);

 const appendAssistant = (content: string) =>
 setMessages(prev => [...prev, { role: "assistant", content }]);

 const handleAbort = () => {
 abortRef.current?.abort();
 appendAssistant(" Aborted by user. Sending STOP to robot");
 sendSerialCommand("STOP").catch(() => {});
 };

 const runVLA = async (instruction: string): Promise<boolean> => {
 appendAssistant(" Planning");

 // Try to grab a camera frame for visual grounding
 let frame: Blob | null = null;
 try { frame = await grabCameraFrame(); } catch {}

 const plan = await planAction(instruction, boardItems, frame);

 if (!plan.ok) {
 appendAssistant(`VLA error: ${plan.error}${plan.raw_response ? `\n\nRaw response:\n${plan.raw_response.slice(0, 400)}` : ""}`);
 return true; // we tried, surfaced an error don't double-respond from KB
 }

 // No motion intent let the caller fall through to KB
 if (plan.actions.length === 0) {
 return false;
 }

 let summary = `**Plan:** ${plan.interpretation}\n\n**${plan.actions.length} action${plan.actions.length === 1 ? "" : "s"}:**`;
 plan.actions.forEach((a, i) => {
 const line = a.action === "move"
 ? `MOVE X${(a as VLAAction & { x_mm: number }).x_mm} Y${(a as VLAAction & { y_mm: number }).y_mm} Z${(a as VLAAction & { z_mm: number }).z_mm}`
 : a.action === "rotate"
 ? `ROTATE ${(a as VLAAction & { degrees: number }).degrees}`
 : a.action.toUpperCase();
 summary += `\n ${i + 1}. \`${line}\``;
 });
 if (plan.warnings?.length) {
 summary += `\n\n**Warnings:** ${plan.warnings.join("; ")}`;
 }
 appendAssistant(summary);

 // Stage the plan — user must confirm before the robot moves
 setLastPlan({ instruction, actions: plan.actions });
 setPendingPlan({ instruction, actions: plan.actions, summary });
 return true;
 };

 /** Called when user clicks Confirm on the pending plan. Runs executePlan. */
 const confirmPlan = async () => {
 if (!pendingPlan) return;
 const { instruction, actions } = pendingPlan;
 setPendingPlan(null);

 if (getSerialStatus() !== "connected") {
 appendAssistant("Robot isn't connected, so I can show the plan but can't execute it.\n\nClick the **Connect Robot** badge in the top bar — pick **Demo Mode** to simulate it, or **Real Robot** to drive your ESP32.");
 setBusy(false);
 return;
 }

 setBusy(true);
 setExecuting(true);
 abortRef.current = new AbortController();
 await executePlan(actions, {
 abortSignal: abortRef.current.signal,
 waitForOk: true,
 stepTimeoutMs: 8000,
 observeAfter: ["pick", "place", "release"],
 getFrameForAction: async (a) => {
 const role = a.action === "pick" ? "bottom" : "top";
 const frame = await captureFrameByRole(role);
 if (frame) return frame;
 try { return await grabCameraFrame(); } catch { return null; }
 },
 maxRetries: 1,
 onEvent: (e) => {
 if (e.kind === "step") {
 const retrySuffix = e.attempt > 1 ? ` (retry ${e.attempt - 1})` : "";
 appendAssistant(` Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
 } else if (e.kind === "response") {
 appendAssistant(` ${e.ok ? "" : ""} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
 } else if (e.kind === "timeout") {
 appendAssistant(` Step ${e.index + 1}: no ack from robot (continuing)`);
 } else if (e.kind === "observe_start") {
 appendAssistant(` Checking camera`);
 } else if (e.kind === "observe_result") {
 const icon = e.verified ? "" : "";
 const conf = (e.confidence * 100).toFixed(0);
 appendAssistant(` ${icon} ${e.observation} _(${e.recommendation}, ${conf}% conf)_`);
 } else if (e.kind === "observe_skip") {
 appendAssistant(` Visual check skipped: ${e.reason}`);
 } else if (e.kind === "retry") {
 appendAssistant(` Observer recommended retry re-running step ${e.index + 1}`);
 } else if (e.kind === "done") {
 appendAssistant(" Plan complete.");
 } else if (e.kind === "error") {
 appendAssistant(` Step ${e.index + 1} failed: ${e.message}`);
 } else if (e.kind === "aborted") {
 appendAssistant(` Aborted after step ${e.index}.`);
 }
 },
 });
 setExecuting(false);
 setBusy(false);
 abortRef.current = null;
 // surfaced instruction for later save
 void instruction;
 };

 /** Save the most recently generated VLA plan as a named template. */
 const handleSaveLastPlan = () => {
 if (!lastPlan) return;
 const defaultName = lastPlan.instruction.slice(0, 40);
 const name = window.prompt("Name this plan:", defaultName);
 if (name === null) return;
 const saved = savePlan(name, lastPlan.instruction, lastPlan.actions);
 appendAssistant(`Saved as "${saved.name}". Open the **Plans** popover above to replay it later.`);
 };

 /** Execute a saved plan immediately no LLM round-trip. */
 const replayPlan = async (plan: SavedPlan) => {
 setPlanLibraryOpen(false);
 markPlanUsed(plan.id);
 setMessages(prev => [...prev, { role: "user", content: `[Replay] ${plan.name}` }]);
 appendAssistant(` Replaying **${plan.name}** ${plan.actions.length} step${plan.actions.length === 1 ? "" : "s"}.`);

 if (getSerialStatus() !== "connected") {
 appendAssistant("Robot isn't connected. Click the Connect Robot badge in the top bar.");
 return;
 }

 setBusy(true);
 setExecuting(true);
 abortRef.current = new AbortController();
 await executePlan(plan.actions, {
 abortSignal: abortRef.current.signal,
 waitForOk: true,
 stepTimeoutMs: 8000,
 observeAfter: ["pick", "place", "release"],
 getFrameForAction: async (a) => {
 const role = a.action === "pick" ? "bottom" : "top";
 const frame = await captureFrameByRole(role);
 if (frame) return frame;
 try { return await grabCameraFrame(); } catch { return null; }
 },
 maxRetries: 1,
 onEvent: (e) => {
 if (e.kind === "step") {
 const retrySuffix = e.attempt > 1 ? ` (retry ${e.attempt - 1})` : "";
 appendAssistant(` Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
 } else if (e.kind === "response") {
 appendAssistant(` ${e.ok ? "" : ""} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
 } else if (e.kind === "timeout") {
 appendAssistant(` Step ${e.index + 1}: no ack from robot (continuing)`);
 } else if (e.kind === "observe_result") {
 const icon = e.verified ? "" : "";
 appendAssistant(` ${icon} ${e.observation}`);
 } else if (e.kind === "done") {
 appendAssistant(" Replay complete.");
 } else if (e.kind === "error") {
 appendAssistant(` Step ${e.index + 1} failed: ${e.message}`);
 } else if (e.kind === "aborted") {
 appendAssistant(` Aborted after step ${e.index}.`);
 }
 },
 });
 setExecuting(false);
 setBusy(false);
 abortRef.current = null;
 };

 const send = useCallback(async () => {
 const text = input.trim();
 if (!text || busy) return;
 setInput(""); setBusy(true);
 setMessages(prev => [...prev, { role: "user", content: text }]);

 // 0) Meta-commands that operate on the UI, not the robot
 if (/^(save|save (this )?plan|save the (last )?plan|save it)$/i.test(text)) {
 if (lastPlan) {
 handleSaveLastPlan();
 } else {
 appendAssistant("There's no plan to save yet.\n\nFirst, toggle **VLA: ON**, give an instruction like *\"go home and move to the center\"*, and let it execute. Then you'll see a ** Save plan** button below the chat clicking it (or typing `save plan`) stores the plan for later replay.");
 }
 setBusy(false); return;
 }
 if (/^(plans|library|show plans|my plans|list plans)$/i.test(text)) {
 setPlanLibraryOpen(true);
 appendAssistant(" Plan library opened above. Click any saved plan to replay it.");
 setBusy(false); return;
 }

 // 1) Always try regex robot commands first fast path, no LLM
 const robotLine = parseRobotCommand(text);
 if (robotLine) {
 if (getSerialStatus() !== "connected") {
 appendAssistant(`That looks like a robot command, but the robot isn't connected yet.\n\nClick the **Connect Robot** badge in the top bar (top-right), pick your ESP32 or pick ** Demo Mode** to try the app without hardware then try again.`);
 setBusy(false); return;
 }
 try {
 await sendSerialCommand(robotLine);
 appendAssistant(` Sent: \`${robotLine}\``);
 } catch (e) {
 appendAssistant(`Robot error: ${e instanceof Error ? e.message : "send failed"}`);
 }
 setBusy(false); return;
 }

 // 2) VLA mode: route freeform instructions to the planner first.
 // If the planner returns NO actions (it was a question / non-motion),
 // fall through to the KB so electronics questions still work in VLA mode.
 if (vlaMode) {
 let handled = false;
 try {
 handled = await runVLA(text);
 } catch (e) {
 appendAssistant(`VLA failed: ${e instanceof Error ? e.message : String(e)}`);
 handled = true;
 }
 if (handled) { setBusy(false); return; }
 // else fall through to KB
 }

 // 3) Claude-powered backend chat (primary conversational path)
    const NN_BASE = (import.meta.env.VITE_NN_URL as string | undefined) ?? "http://127.0.0.1:5000";
    try {
      const res = await fetch(`${NN_BASE}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }), signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const d = await res.json() as { reply?: string };
        if (d.reply) { appendAssistant(d.reply); setBusy(false); return; }
      }
    } catch {}
    // 4) Offline fallback: keyword KB if backend unreachable
    const kb = findAnswer(text);
    if (kb) {
      appendAssistant(kb);
      setBusy(false); return;
    }

 // 5) Generic miss
 appendAssistant(`That one is outside my current knowledge base. Try toggling **VLA Mode** above if you want me to interpret freeform instructions or ask me about resistors, capacitors, transistors, PCB design, protocols, or how to drive the robot (\`home\`, \`move 10 20\`, \`pick\`).`);
 setBusy(false);
 }, [input, busy, vlaMode, boardItems, lastPlan]);

 return (
 <div className="flex flex-col h-full">
 <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0 gap-2 relative">
 <div className="font-bold text-white">PCB <span style={{ color: "#00d4ff" }}>Robot</span></div>
 <div className="flex items-center gap-1.5">
 <button
 type="button"
 onClick={() => setPlanLibraryOpen(v => !v)}
 className="text-[10px] font-bold px-2 py-1 rounded border bg-white/5 text-white/70 border-white/20 hover:bg-white/10 transition-colors"
 title="Open the saved-plans library"
 >
 Plans
 </button>
 <button
 type="button"
 onClick={() => setVlaMode(v => !v)}
 className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
 vlaMode
 ? "bg-purple-500/25 text-purple-200 border-purple-400/60"
 : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10"
 }`}
 title="Toggle Vision-Language-Action mode: route freeform instructions through Claude robot"
 >
 {vlaMode ? " VLA: ON" : "VLA: OFF"}
 </button>
 <button
 type="button"
 onClick={() => setVisible(v => !v)}
 className="text-xs px-3 py-1 rounded border border-white/20 text-white/70 hover:bg-white/10 transition-colors"
 >
 {visible ? "Hide Robot" : "Show Robot"}
 </button>
 </div>
 {planLibraryOpen && (
 <PlanLibrary
 onClose={() => setPlanLibraryOpen(false)}
 onSelect={replayPlan}
 />
 )}
 </div>
 {visible && <>
 <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
 {messages.map((m, i) => (
 <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
 <div className={["inline-block max-w-[92%] px-3 py-2 rounded-lg text-left", m.role === "user" ? "bg-[#00d4ff]/15 text-[#00d4ff]" : "bg-black/30 text-white/85"].join(" ")}>
 <div className="text-[10px] opacity-60 mb-1">{m.role === "user" ? "you:" : "Layla:"}</div>
 <RenderMsg content={m.content} />
 </div>
 </div>
 ))}
 {busy && !executing && (
 <div className="text-left">
 <div className="inline-block px-3 py-2 rounded-lg bg-black/30">
 <div className="flex gap-1">
 {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-[#00d4ff]/60 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }}/>)}
 </div>
 </div>
 </div>
 )}
 <div ref={bottomRef}/>
 </div>
 {/* ── Confirmation gate: shown after Layla plans, before robot moves ── */}
 {pendingPlan && !executing && (
 <div className="px-3 py-2.5 bg-amber-900/30 border-t border-amber-400/40 shrink-0">
 <p className="text-[10px] font-bold text-amber-300 mb-1.5">
 ⚠ Ready to execute {pendingPlan.actions.length} step{pendingPlan.actions.length === 1 ? "" : "s"} — confirm?
 </p>
        <PlanDiagram actions={pendingPlan.actions} />
 <div className="flex gap-2">
 <button
 type="button"
 onClick={confirmPlan}
 className="flex-1 text-[10px] font-bold py-1 rounded border bg-emerald-500/20 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/35 transition-colors"
 >
 ✅ Confirm — run robot
 </button>
 <button
 type="button"
 onClick={() => { setPendingPlan(null); appendAssistant("Plan cancelled. The robot will not move."); setBusy(false); }}
 className="flex-1 text-[10px] font-bold py-1 rounded border bg-red-500/15 text-red-300 border-red-400/40 hover:bg-red-500/30 transition-colors"
 >
 ❌ Cancel
 </button>
 </div>
 </div>
 )}
 {executing && (
 <div className="px-3 py-2 bg-purple-900/40 border-t border-purple-400/30 flex items-center justify-between shrink-0">
 <span className="text-[10px] font-bold text-purple-200"> Executing plan</span>
 <button
 type="button"
 onClick={handleAbort}
 className="text-[10px] font-bold text-red-300 hover:text-red-200 border border-red-400/40 hover:border-red-400/70 rounded px-2 py-0.5"
 >
 ABORT
 </button>
 </div>
 )}
 {!executing && lastPlan && (
 <div className="px-3 py-1.5 bg-purple-900/15 border-t border-purple-400/15 flex items-center justify-between shrink-0">
 <span className="text-[10px] text-purple-300/70">
 Last plan: {lastPlan.actions.length} step{lastPlan.actions.length === 1 ? "" : "s"}
 </span>
 <button
 type="button"
 onClick={handleSaveLastPlan}
 className="text-[10px] font-bold text-purple-300 hover:text-purple-200 border border-purple-400/40 hover:border-purple-400/70 rounded px-2 py-0.5"
 >
 Save plan
 </button>
 </div>
 )}
 <div className="px-3 pt-2 pb-1 border-t border-white/10 flex flex-wrap gap-1 shrink-0 bg-black/20">
 <span className="text-[9px] text-white/40 mr-1 self-center uppercase tracking-wide">Try:</span>
 {vlaMode
 ? ["go home", "move to the center", "pick and place a resistor", "place a part in the upper right"].map(ex => (
 <button
 key={ex}
 type="button"
 onClick={() => setInput(ex)}
 className="text-[9px] text-purple-200/70 hover:text-purple-100 border border-purple-400/25 hover:border-purple-400/60 rounded px-1.5 py-0.5 transition-colors"
 >
 {ex}
 </button>
 ))
 : ["home", "move 30 20", "pick", "place", "rotate 90", "save plan"].map(ex => (
 <button
 key={ex}
 type="button"
 onClick={() => setInput(ex)}
 className="text-[9px] font-mono text-white/60 hover:text-white border border-white/15 hover:border-white/40 rounded px-1.5 py-0.5 transition-colors"
 >
 {ex}
 </button>
 ))}
 </div>
 <div className="p-3 border-t border-white/10 flex gap-2 shrink-0">
 <input
 value={input}
 onChange={e => setInput(e.target.value)}
 onKeyDown={e => { if (e.key === "Enter") send(); }}
 className="flex-1 rounded-md px-3 py-2 text-sm bg-[#e8f3ff] text-[#001524] border border-[#00d4ff]/30 focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30"
 placeholder={vlaMode ? "Tell me what the robot should do" : "Ask Layla, or type a robot command"}
 disabled={busy}
 />
 <button
 type="button"
 onClick={send}
 disabled={busy || !input.trim()}
 className="px-4 py-2 rounded-md font-semibold text-sm bg-[#00d4ff] text-[#001524] hover:bg-[#00b8d9] disabled:opacity-50 transition-colors"
 >
 {busy ? "..." : "Send"}
 </button>
 </div>
 </>}
 </div>
 );
}