import { useState, useCallback, useRef, useEffect } from "react";
type Message = { role: "user"|"assistant"; content: string; };
type KBEntry = { keywords: string[]; answer: string };
const KB: KBEntry[] = [
  { keywords:["resistor","resistance","ohm","ohms law"], answer:"Great question! Resistors are fundamental to every circuit you will ever design. Ohm's Law ties it all together: V = I x R\n• Power dissipated: P = I²R = V²/R\n• Series: R_total = R1 + R2 (they add up)\n• Parallel: 1/R_total = 1/R1 + 1/R2 (total is always less than the smallest)\n• 4-band color code: Blk=0 Brn=1 Red=2 Org=3 Yel=4 Grn=5 Blu=6 Vio=7 Gry=8 Wht=9\nOnce you memorize the color code, reading resistors becomes second nature!\nSource: Sedra & Smith, Microelectronic Circuits Ch.1" },
  { keywords:["capacitor","capacitance","farad","decoupling","bypass"], answer:"Capacitors are endlessly useful — they show up in almost every subsystem you will work with. C = Q/V\n• Energy stored: E = 0.5CV²\n• Impedance: Z = 1/(jwC) — short circuit at high frequencies, open at DC\n• Series: 1/C = 1/C1 + 1/C2 | Parallel: C = C1 + C2\n• One of the most impactful things you can do on a PCB: place a 100nF decoupling cap within 1mm of every IC power pin. It genuinely makes a difference.\n• Electrolytic caps are polarized — longer lead is positive, never reverse them.\nSource: Horowitz & Hill, The Art of Electronics Ch.1" },
  { keywords:["inductor","inductance","henry","coil","choke"], answer:"Inductors resist changes in current — they are the complement to capacitors in almost every way.\n• Governing equation: V = L x dI/dt\n• Energy stored: E = 0.5LI²\n• Impedance: Z = jwL — open at high frequencies, short at DC (exactly opposite to a capacitor)\n• Essential for switching power supplies, EMI filters, and RF matching networks\n• Watch out for the self-resonant frequency — operating above it defeats the purpose.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["diode","pn junction","forward bias","rectifier","schottky","zener"], answer:"Diodes are one of the most elegant components in electronics — current flows in one direction only.\n• Forward voltage: ~0.7V silicon, ~0.3V Schottky, 1.8-3.5V for LEDs\n• Zener diodes conduct in reverse at a defined breakdown voltage — excellent for voltage clamping and regulation\n• Schottky diodes switch faster and have lower Vf — preferred for high-speed and power applications\n• Polarity matters! Mark the cathode band clearly on your silkscreen — it is a simple step that prevents a frustrating mistake.\nSource: Sedra & Smith Ch.3" },
  { keywords:["transistor","bjt","mosfet","npn","pnp","amplifier","switch","fet"], answer:"Transistors are the foundation of modern electronics — every processor, amplifier, and power switch relies on them.\n**BJT (current-controlled):** Ic = Beta x Ib\n• NPN: Vbe ~0.7V to turn on | Beta typically 50-500\n**MOSFET (voltage-controlled):**\n• NMOS: requires Vgs > Vth to conduct (typically 1-3V)\n• Near-zero gate current makes MOSFETs ideal for power switching\n• PCB tip: a 10-33 ohm gate resistor with short gate traces prevents oscillation — a small detail with real impact.\nSource: Sedra & Smith Ch.4-5" },
  { keywords:["led","light emitting","brightness","current limiting"], answer:"LEDs require a current-limiting resistor — without one, they will draw too much current and fail quickly.\n• Forward voltage: Red 1.8-2.2V | Green 2-3.5V | Blue/White 3-3.5V\n• Typical operating current: 10-20mA\n• Resistor formula: R = (Vsupply - Vf) / I_LED\n• Example: 5V supply, red LED (Vf=2V), 20mA → R = (5-2)/0.02 = 150 ohm\n• Identification: longer lead = anode (+), flat edge on dome = cathode (-)\nSource: Horowitz & Hill Ch.2" },
  { keywords:["pcb","printed circuit","trace","via","layer","gerber","copper"], answer:"PCB design is where theory meets hardware — getting the fundamentals right here pays dividends throughout the project.\n• Trace width: IPC-2221 is your reference — 1oz copper, 1A → ~0.25mm on external layer\n• Clearance: 0.1mm minimum for low-voltage signals, more for anything higher\n• Vias: 0.3mm minimum drill, 0.6mm pad for standard fab\n• A solid ground plane on an inner layer is one of the best investments you can make for EMI performance\n• Always include 3 fiducial markers for pick-and-place alignment — this robot uses them!\nSource: IPC-2221 Standard, Grover & Ghassemi PCB Design Techniques" },
  { keywords:["smd","surface mount","reflow","solder","paste","soldering","assembly"], answer:"SMT assembly is a precise process — small variations in paste volume or thermal profile can affect yield significantly.\n• Reflow profile: Preheat 150°C → Soak → Peak 220-250°C (SAC305 lead-free) → Controlled cool\n• Stencil thickness: 0.12mm for 0402 components, 0.15mm for larger\n• Tombstoning occurs when heating is uneven or pads are asymmetric — balanced pad design prevents it\n• This robot arm places components with sub-millimeter accuracy using JEPA vision correction — that is exactly what the alignment system is for.\nSource: IPC-7711, J-STD-001" },
  { keywords:["opamp","op-amp","operational amplifier","gain","feedback"], answer:"Op-amps are remarkably versatile — with the right feedback network, a single device can amplify, filter, compare, or buffer.\n• Inverting: Vout = -(Rf/Rin) x Vin\n• Non-inverting: Vout = (1 + Rf/Rin) x Vin\n• Unity-gain buffer: Vout = Vin — invaluable for impedance isolation\n• Virtual ground principle: V+ = V- in negative feedback — understanding this unlocks most op-amp analysis\n• PCB tip: a small capacitor (100pF) across the feedback resistor improves phase margin. Always bypass supply pins with 100nF.\nSource: Sedra & Smith Ch.2" },
  { keywords:["power supply","ldo","buck","boost","regulator","switching","voltage"], answer:"Choosing the right power topology early saves significant redesign effort later.\n• LDO: Vout = Vref x (1 + R1/R2) | Simple, low noise, but efficiency = Vout/Vin — excess becomes heat\n• Buck (step-down): Vout = D x Vin | 85-95% efficient — the right choice for most battery-powered designs\n• Boost (step-up): Vout = Vin/(1-D)\n• PCB tip: minimize the switching loop area, place input capacitors close to the switch node, and use wide traces for high-current paths.\nSource: Razavi Ch.11, Texas Instruments Power Design Seminar" },
  { keywords:["filter","low pass","high pass","cutoff","rc filter","lc filter"], answer:"Filters are essential for signal conditioning, noise rejection, and power supply design.\n• RC Low-Pass: fc = 1/(2*pi*R*C) | -20dB/decade rolloff above fc\n• RC High-Pass: same formula, passes frequencies above fc\n• LC Low-Pass: fc = 1/(2*pi*sqrt(LC)) | -40dB/decade — sharper rolloff\n• Butterworth: maximally flat passband, good general-purpose choice\n• Chebyshev: steeper rolloff at the cost of passband ripple\n• Higher-order filters give steeper rolloff but add component count and complexity.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["uart","i2c","spi","serial","protocol","communication","can"], answer:"Choosing the right protocol comes down to speed, pin count, and distance requirements.\n• UART: asynchronous, 2 wires, 9600-115200 baud — simple and universally supported\n• I2C: 2 wires, multi-device on one bus, requires 4.7k pull-ups, up to 1MHz\n• SPI: 4 wires, full duplex, up to 50MHz+ — fastest and simplest electrically, one CS per device\n• CAN: differential pair, 120 ohm termination at each end, up to 1Mbps — robust in electrically noisy environments\n• For high-speed SPI: match trace impedance and keep clock lines short.\nSource: Horowitz & Hill Ch.14" },
  { keywords:["ground","grounding","emi","noise","plane","star ground"], answer:"Grounding strategy is one of the most overlooked aspects of PCB design — and one of the most consequential.\n• A continuous ground plane on an inner layer dramatically reduces impedance and EMI\n• Star ground: bring all grounds to a single point — best for mixed analog and digital designs\n• Decoupling: 100nF ceramic at every IC power pin, plus 10uF bulk per power domain\n• Never route a high-speed signal over a break in the ground plane — the return current has nowhere clean to go\n• Guard rings around sensitive analog circuits help reject interference from nearby digital signals.\nSource: Ott, Electromagnetic Compatibility Engineering" },
  { keywords:["jepa","neural network","alignment","vision","camera","machine learning","ai"], answer:"The JEPA Vision System is the intelligence behind this robot arm — and it is genuinely interesting technology.\n• JEPA stands for Joint Embedding Predictive Architecture, developed by Yann LeCun at Meta AI\n• It learns PCB board structure from unlabeled camera footage — no hand-labeling required for pretraining\n• Three specialized inference heads:\n  1. ComponentDetector — locates fiducials, classifies component types from the top camera\n  2. AlignmentCorrector — computes the rotation and XY offset needed before each placement\n  3. PlacementValidator — compares pre and post placement frames to verify success\n• Achieves less than 2 degree rotation error and less than 0.2mm positional error\n• Click JEPA Vision in the sidebar to run alignment live, or try the Demo to see the full pipeline." },
  { keywords:["place","placement","put","add","drag","drop"], answer:"Placing components on the board is straightforward.\n1. Locate the component in the Inventory panel on the left\n2. Click and drag it onto the PCB board\n3. Release to drop it at that position\nAvailable components: Resistor, Diode, Capacitor, LED, Transistor, Channel Port\nIn a real assembly workflow, this robot arm would pick and place each component using the JEPA vision system for sub-millimeter accuracy." },
  { keywords:["help","what can","commands","tutorial","how"], answer:"Happy to help! Here is what I can assist with:\n• Electronics theory — resistors, capacitors, inductors, transistors, op-amps, diodes\n• PCB design — trace width, clearance, via sizing, impedance, grounding, EMI\n• Assembly — SMT reflow, solder paste, component placement\n• Communication protocols — UART, I2C, SPI, CAN\n• Power electronics — LDO, buck, boost, filtering\n• The JEPA Vision System — how this robot arm uses AI for precision placement\n• Component placement — drag items from Inventory onto the board\n\nSome questions to try:\n  How do I calculate an LED current-limiting resistor?\n  What is the difference between I2C and SPI?\n  How does a buck converter work?" },
];
function findAnswer(input: string): string | null {
  const lower = input.toLowerCase();
  for (const e of KB) { if (e.keywords.some(k => lower.includes(k))) return e.answer; }
  return null;
}
function RenderMsg({ content }: { content: string }) {
  return (
    <div className="space-y-0.5">
      {content.split("\n").map((line, i) => (
        <p key={i} className={["text-sm leading-relaxed", line.startsWith("•") || line.startsWith(" ") ? "pl-2" : ""].join(" ")}>
          {line.split(/(\*\*[^*]+\*\*)/).map((part, j) =>
            part.startsWith("**") && part.endsWith("**")
              ? <strong key={j} className="text-white">{part.slice(2,-2)}</strong>
              : part
          )}
        </p>
      ))}
    </div>
  );
}
export default function PCBRobot() {
  const [visible, setVisible] = useState(true);
  const [messages, setMessages] = useState<Message[]>([{ role:"assistant", content:"Hi! I am Layla, your PCB design assistant. I can help with electronics theory, PCB design rules, component placement, communication protocols, and the JEPA vision system.\n\nFeel free to ask anything — try \"How does a capacitor work?\" or \"What is the difference between I2C and SPI?\"" }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);
  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true);
    setMessages(prev => [...prev, { role:"user", content:text }]);
    const kb = findAnswer(text);
    if (kb) {
      await new Promise(r => setTimeout(r, 350));
      setMessages(prev => [...prev, { role:"assistant", content:kb }]);
      setBusy(false); return;
    }
    try {
      const res = await fetch("http://127.0.0.1:5000/chat", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({message:text}), signal:AbortSignal.timeout(4000) });
      if (res.ok) { const d = await res.json() as {reply?:string}; setMessages(prev=>[...prev,{role:"assistant",content:d.reply??"No response."}]); setBusy(false); return; }
    } catch {}
    setMessages(prev => [...prev, { role:"assistant", content:`That one is outside my current knowledge base, but it is a good question worth researching further.\n\nI can help with: resistors, capacitors, transistors, op-amps, PCB design rules, communication protocols (UART, I2C, SPI), power supplies, and the JEPA vision system.\n\nIs there something along those lines I can help with?` }]);
    setBusy(false);
  }, [input, busy]);
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 shrink-0">
        <div className="font-bold text-white">PCB <span style={{color:"#00d4ff"}}>Robot</span></div>
        <button type="button" onClick={()=>setVisible(v=>!v)} className="text-xs px-3 py-1 rounded border border-white/20 text-white/70 hover:bg-white/10 transition-colors">{visible?"Hide Robot":"Show Robot"}</button>
      </div>
      {visible && <>
        <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
          {messages.map((m,i) => (
            <div key={i} className={m.role==="user"?"text-right":"text-left"}>
              <div className={["inline-block max-w-[92%] px-3 py-2 rounded-lg text-left", m.role==="user"?"bg-[#00d4ff]/15 text-[#00d4ff]":"bg-black/30 text-white/85"].join(" ")}>
                <div className="text-[10px] opacity-60 mb-1">{m.role==="user"?"you:":"Layla:"}</div>
                <RenderMsg content={m.content} />
              </div>
            </div>
          ))}
          {busy && <div className="text-left"><div className="inline-block px-3 py-2 rounded-lg bg-black/30"><div className="flex gap-1">{[0,1,2].map(i=><div key={i} className="w-1.5 h-1.5 bg-[#00d4ff]/60 rounded-full animate-bounce" style={{animationDelay:`${i*150}ms`}}/>)}</div></div></div>}
          <div ref={bottomRef}/>
        </div>
        <div className="p-3 border-t border-white/10 flex gap-2 shrink-0">
          <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send();}} className="flex-1 rounded-md px-3 py-2 text-sm bg-[#e8f3ff] text-[#001524] border border-[#00d4ff]/30 focus:outline-none focus:ring-2 focus:ring-[#00d4ff]/30" placeholder="Ask Layla an electronics question..." disabled={busy}/>
          <button type="button" onClick={send} disabled={busy||!input.trim()} className="px-4 py-2 rounded-md font-semibold text-sm bg-[#00d4ff] text-[#001524] hover:bg-[#00b8d9] disabled:opacity-50 transition-colors">{busy?"...":"Send"}</button>
        </div>
      </>}
    </div>
  );
}
