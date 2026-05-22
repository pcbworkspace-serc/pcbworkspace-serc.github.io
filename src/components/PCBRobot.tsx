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
  { keywords:["resistor","resistance","ohm","ohms law"], answer:"Great question! Resistors are fundamental to every circuit you will ever design. Ohm's Law ties it all together: V = I x R\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Power dissipated: P = IÃƒâ€šÃ‚Â²R = VÃƒâ€šÃ‚Â²/R\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Series: R_total = R1 + R2 (they add up)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Parallel: 1/R_total = 1/R1 + 1/R2 (total is always less than the smallest)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ 4-band color code: Blk=0 Brn=1 Red=2 Org=3 Yel=4 Grn=5 Blu=6 Vio=7 Gry=8 Wht=9\nOnce you memorize the color code, reading resistors becomes second nature!\nSource: Sedra & Smith, Microelectronic Circuits Ch.1" },
  { keywords:["capacitor","capacitance","farad","decoupling","bypass"], answer:"Capacitors are endlessly useful ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â they show up in almost every subsystem you will work with. C = Q/V\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Energy stored: E = 0.5CVÃƒâ€šÃ‚Â²\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Impedance: Z = 1/(jwC) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â short circuit at high frequencies, open at DC\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Series: 1/C = 1/C1 + 1/C2 | Parallel: C = C1 + C2\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ One of the most impactful things you can do on a PCB: place a 100nF decoupling cap within 1mm of every IC power pin. It genuinely makes a difference.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Electrolytic caps are polarized ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â longer lead is positive, never reverse them.\nSource: Horowitz & Hill, The Art of Electronics Ch.1" },
  { keywords:["inductor","inductance","henry","coil","choke"], answer:"Inductors resist changes in current ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â they are the complement to capacitors in almost every way.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Governing equation: V = L x dI/dt\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Energy stored: E = 0.5LIÃƒâ€šÃ‚Â²\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Impedance: Z = jwL ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â open at high frequencies, short at DC (exactly opposite to a capacitor)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Essential for switching power supplies, EMI filters, and RF matching networks\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Watch out for the self-resonant frequency ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â operating above it defeats the purpose.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["diode","pn junction","forward bias","rectifier","schottky","zener"], answer:"Diodes are one of the most elegant components in electronics ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â current flows in one direction only.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Forward voltage: ~0.7V silicon, ~0.3V Schottky, 1.8-3.5V for LEDs\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Zener diodes conduct in reverse at a defined breakdown voltage ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â excellent for voltage clamping and regulation\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Schottky diodes switch faster and have lower Vf ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â preferred for high-speed and power applications\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Polarity matters! Mark the cathode band clearly on your silkscreen ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it is a simple step that prevents a frustrating mistake.\nSource: Sedra & Smith Ch.3" },
  { keywords:["transistor","bjt","mosfet","npn","pnp","amplifier","switch","fet"], answer:"Transistors are the foundation of modern electronics ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â every processor, amplifier, and power switch relies on them.\n**BJT (current-controlled):** Ic = Beta x Ib\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ NPN: Vbe ~0.7V to turn on | Beta typically 50-500\n**MOSFET (voltage-controlled):**\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ NMOS: requires Vgs > Vth to conduct (typically 1-3V)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Near-zero gate current makes MOSFETs ideal for power switching\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ PCB tip: a 10-33 ohm gate resistor with short gate traces prevents oscillation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a small detail with real impact.\nSource: Sedra & Smith Ch.4-5" },
  { keywords:["led","light emitting","brightness","current limiting"], answer:"LEDs require a current-limiting resistor ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â without one, they will draw too much current and fail quickly.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Forward voltage: Red 1.8-2.2V | Green 2-3.5V | Blue/White 3-3.5V\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Typical operating current: 10-20mA\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Resistor formula: R = (Vsupply - Vf) / I_LED\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Example: 5V supply, red LED (Vf=2V), 20mA ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ R = (5-2)/0.02 = 150 ohm\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Identification: longer lead = anode (+), flat edge on dome = cathode (-)\nSource: Horowitz & Hill Ch.2" },
  { keywords:["pcb","printed circuit","trace","via","layer","gerber","copper"], answer:"PCB design is where theory meets hardware ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â getting the fundamentals right here pays dividends throughout the project.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Trace width: IPC-2221 is your reference ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 1oz copper, 1A ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ~0.25mm on external layer\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Clearance: 0.1mm minimum for low-voltage signals, more for anything higher\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Vias: 0.3mm minimum drill, 0.6mm pad for standard fab\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ A solid ground plane on an inner layer is one of the best investments you can make for EMI performance\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Always include 3 fiducial markers for pick-and-place alignment ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â this robot uses them!\nSource: IPC-2221 Standard, Grover & Ghassemi PCB Design Techniques" },
  { keywords:["smd","surface mount","reflow","solder","paste","soldering","assembly"], answer:"SMT assembly is a precise process ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â small variations in paste volume or thermal profile can affect yield significantly.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Reflow profile: Preheat 150Ãƒâ€šÃ‚Â°C ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Soak ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Peak 220-250Ãƒâ€šÃ‚Â°C (SAC305 lead-free) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Controlled cool\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Stencil thickness: 0.12mm for 0402 components, 0.15mm for larger\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Tombstoning occurs when heating is uneven or pads are asymmetric ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â balanced pad design prevents it\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ This robot arm places components with sub-millimeter accuracy using JEPA vision correction ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â that is exactly what the alignment system is for.\nSource: IPC-7711, J-STD-001" },
  { keywords:["opamp","op-amp","operational amplifier","gain","feedback"], answer:"Op-amps are remarkably versatile ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â with the right feedback network, a single device can amplify, filter, compare, or buffer.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Inverting: Vout = -(Rf/Rin) x Vin\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Non-inverting: Vout = (1 + Rf/Rin) x Vin\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Unity-gain buffer: Vout = Vin ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â invaluable for impedance isolation\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Virtual ground principle: V+ = V- in negative feedback ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â understanding this unlocks most op-amp analysis\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ PCB tip: a small capacitor (100pF) across the feedback resistor improves phase margin. Always bypass supply pins with 100nF.\nSource: Sedra & Smith Ch.2" },
  { keywords:["power supply","ldo","buck","boost","regulator","switching","voltage"], answer:"Choosing the right power topology early saves significant redesign effort later.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ LDO: Vout = Vref x (1 + R1/R2) | Simple, low noise, but efficiency = Vout/Vin ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â excess becomes heat\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Buck (step-down): Vout = D x Vin | 85-95% efficient ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the right choice for most battery-powered designs\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Boost (step-up): Vout = Vin/(1-D)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ PCB tip: minimize the switching loop area, place input capacitors close to the switch node, and use wide traces for high-current paths.\nSource: Razavi Ch.11, Texas Instruments Power Design Seminar" },
  { keywords:["filter","low pass","high pass","cutoff","rc filter","lc filter"], answer:"Filters are essential for signal conditioning, noise rejection, and power supply design.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ RC Low-Pass: fc = 1/(2*pi*R*C) | -20dB/decade rolloff above fc\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ RC High-Pass: same formula, passes frequencies above fc\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ LC Low-Pass: fc = 1/(2*pi*sqrt(LC)) | -40dB/decade ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â sharper rolloff\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Butterworth: maximally flat passband, good general-purpose choice\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Chebyshev: steeper rolloff at the cost of passband ripple\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Higher-order filters give steeper rolloff but add component count and complexity.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["uart","i2c","spi","serial","protocol","communication","can"], answer:"Choosing the right protocol comes down to speed, pin count, and distance requirements.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ UART: asynchronous, 2 wires, 9600-115200 baud ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â simple and universally supported\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ I2C: 2 wires, multi-device on one bus, requires 4.7k pull-ups, up to 1MHz\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ SPI: 4 wires, full duplex, up to 50MHz+ ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fastest and simplest electrically, one CS per device\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ CAN: differential pair, 120 ohm termination at each end, up to 1Mbps ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â robust in electrically noisy environments\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ For high-speed SPI: match trace impedance and keep clock lines short.\nSource: Horowitz & Hill Ch.14" },
  { keywords:["ground","grounding","emi","noise","plane","star ground"], answer:"Grounding strategy is one of the most overlooked aspects of PCB design ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â and one of the most consequential.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ A continuous ground plane on an inner layer dramatically reduces impedance and EMI\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Star ground: bring all grounds to a single point ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â best for mixed analog and digital designs\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Decoupling: 100nF ceramic at every IC power pin, plus 10uF bulk per power domain\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Never route a high-speed signal over a break in the ground plane ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the return current has nowhere clean to go\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Guard rings around sensitive analog circuits help reject interference from nearby digital signals.\nSource: Ott, Electromagnetic Compatibility Engineering" },
  { keywords:["jepa","neural network","alignment","vision","camera","machine learning","ai"], answer:"The JEPA Vision System is the intelligence behind this robot arm ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â and it is genuinely interesting technology.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ JEPA stands for Joint Embedding Predictive Architecture, developed by Yann LeCun at Meta AI\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ It learns PCB board structure from unlabeled camera footage ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no hand-labeling required for pretraining\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Three specialized inference heads:\n  1. ComponentDetector ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â locates fiducials, classifies component types from the top camera\n  2. AlignmentCorrector ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â computes the rotation and XY offset needed before each placement\n  3. PlacementValidator ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â compares pre and post placement frames to verify success\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Achieves less than 2 degree rotation error and less than 0.2mm positional error\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Click JEPA Vision in the sidebar to run alignment live, or try the Demo to see the full pipeline." },
  { keywords:["place","placement","put","add","drag","drop"], answer:"Placing components on the board is straightforward.\n1. Locate the component in the Inventory panel on the left\n2. Click and drag it onto the PCB board\n3. Release to drop it at that position\nAvailable components: Resistor, Diode, Capacitor, LED, Transistor, Channel Port\nIn a real assembly workflow, this robot arm would pick and place each component using the JEPA vision system for sub-millimeter accuracy." },
  { keywords:["robot command","robot control","drive robot","control the robot","control robot","what can the robot do","robot commands"], answer:"You can drive the SCARA arm directly from this chat once connected. Click the **Connect Robot** badge in the top bar (top-right) first ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it opens a USB port picker.\n\n**Things you can type to me:**\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `home` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â return to home position\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `move 10 20` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â go to X=10mm, Y=20mm (add a 3rd or 4th number for Z and rotation)\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `pick` / `place` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â gripper close / open\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `rotate 90` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â rotate end-effector by 90Ãƒâ€šÃ‚Â°\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `stop` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â emergency halt\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ `scan`, `detect`, `align`, `validate` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â task verbs\n\n**Or turn on VLA Mode** (header button) to ask in plain English: *\"place a resistor in the upper left\"* or *\"pick up whatever is near the center and home\"* ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Layla will plan and execute the steps." },
  { keywords:["vla","vision language","gemini robotics","natural language robot"], answer:"VLA Mode (Vision-Language-Action) lets you control the robot with plain English instead of explicit commands.\n\n**To enable:** click the **VLA: OFF** button at the top of this panel ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it turns purple.\n\n**How it works:**\n1. Your message + current board state + (optionally) the camera frame are sent to your local Flask server at `127.0.0.1:5000/vla/plan`\n2. Anthropic Claude breaks the instruction into a sequence of robot actions (HOME, MOVE, PICK, PLACEÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦)\n3. Each action is sent to your ESP32 over serial in order\n\n**Try:** *\"place a resistor 10mm from the lower left corner\"* or *\"go home and then move to the middle of the board\"*.\n\nRequires: local Flask running with the `flask_vla.py` route registered and `ANTHROPIC_API_KEY` set." },
  { keywords:["help","what can","commands","tutorial","how"], answer:"Happy to help! Here is what I can assist with:\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Electronics theory ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â resistors, capacitors, inductors, transistors, op-amps, diodes\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ PCB design ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â trace width, clearance, via sizing, impedance, grounding, EMI\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Assembly ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â SMT reflow, solder paste, component placement\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Communication protocols ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â UART, I2C, SPI, CAN\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Power electronics ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â LDO, buck, boost, filtering\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ The JEPA Vision System ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â how this robot arm uses AI for precision placement\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ Component placement ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â drag items from Inventory onto the board\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ **Driving the SCARA robot** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â type `home`, `move 10 20`, `pick`, `place`, etc.\nÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ **VLA Mode** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â toggle the VLA button to drive the robot with plain English\n\nSome questions to try:\n  How do I calculate an LED current-limiting resistor?\n  What is the difference between I2C and SPI?\n  How does a buck converter work?" },
];

function findAnswer(input: string): string | null {
  const lower = input.toLowerCase();
  for (const e of KB) if (e.keywords.some(k => lower.includes(k))) return e.answer;
  return null;
}

function parseRobotCommand(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (/^(go )?home$/.test(t))                          return "HOME";
  if (/^(emergency )?stop$/.test(t) || t === "halt")   return "STOP";
  if (/^pick( up)?$/.test(t))                          return "PICK";
  if (/^(place|release|drop)$/.test(t))                return "PLACE";
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
        <p key={i} className={["text-sm leading-relaxed", line.startsWith("ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢") || line.startsWith(" ") ? "pl-2" : ""].join(" ")}>
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
}

export default function PCBRobot({ boardItems = [] }: PCBRobotProps) {
  const [visible, setVisible] = useState(true);
  const [vlaMode, setVlaMode] = useState(false);
  const [planLibraryOpen, setPlanLibraryOpen] = useState(false);
  const [lastPlan, setLastPlan] = useState<{ instruction: string; actions: VLAAction[] } | null>(null);
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

  const appendAssistant = (content: string) =>
    setMessages(prev => [...prev, { role: "assistant", content }]);

  const handleAbort = () => {
    abortRef.current?.abort();
    appendAssistant("ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â Aborted by user. Sending STOP to robotÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");
    sendSerialCommand("STOP").catch(() => {});
  };

  const runVLA = async (instruction: string): Promise<boolean> => {
    appendAssistant("ÃƒÂ°Ã…Â¸Ã‚Â§Ã‚Â  PlanningÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦");

    // Try to grab a camera frame for visual grounding
    let frame: Blob | null = null;
    try { frame = await grabCameraFrame(); } catch {}

    const plan = await planAction(instruction, boardItems, frame);

    if (!plan.ok) {
      appendAssistant(`VLA error: ${plan.error}${plan.raw_response ? `\n\nRaw response:\n${plan.raw_response.slice(0, 400)}` : ""}`);
      return true;   // we tried, surfaced an error ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â don't double-respond from KB
    }

    // No motion intent ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â let the caller fall through to KB
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
      summary += `\n  ${i + 1}. \`${line}\``;
    });
    if (plan.warnings?.length) {
      summary += `\n\n**Warnings:** ${plan.warnings.join("; ")}`;
    }
    appendAssistant(summary);

    // Remember this plan so the user can save it later
    setLastPlan({ instruction, actions: plan.actions });

    if (getSerialStatus() !== "connected") {
      appendAssistant("Robot isn't connected, so I can show the plan but can't execute it.\n\nClick the **Connect Robot** badge in the top bar ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â pick **ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â® Demo Mode** to simulate it, or **Real Robot** to drive your ESP32.");
      return true;
    }

    setExecuting(true);
    abortRef.current = new AbortController();
    await executePlan(plan.actions, {
      abortSignal: abortRef.current.signal,
      waitForOk: true,
      stepTimeoutMs: 8000,
      // Sprint 8/9: camera feedback loop on critical actions, with per-action camera routing
      observeAfter: ["pick", "place", "release"],
      getFrameForAction: async (a) => {
        // After PICK ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ bottom camera sees the part held on the nozzle
        // After PLACE / RELEASE ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ top camera sees the part on the PCB
        const role = a.action === "pick" ? "bottom" : "top";
        const frame = await captureFrameByRole(role);
        if (frame) return frame;
        // Fallback to whatever the live CameraFeed has if dual-camera setup isn't ready
        try { return await grabCameraFrame(); } catch { return null; }
      },
      maxRetries: 1,
      onEvent: (e) => {
        if (e.kind === "step") {
          const retrySuffix = e.attempt > 1 ? ` (retry ${e.attempt - 1})` : "";
          appendAssistant(`ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¶ Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
        } else if (e.kind === "response") {
          appendAssistant(`  ${e.ok ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦" : "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â"} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
        } else if (e.kind === "timeout") {
          appendAssistant(`  ÃƒÂ¢Ã…â€™Ã¢â‚¬Âº Step ${e.index + 1}: no ack from robot (continuing)`);
        } else if (e.kind === "observe_start") {
          appendAssistant(`  ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚ÂÃƒÂ¯Ã‚Â¸Ã‚Â Checking cameraÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`);
        } else if (e.kind === "observe_result") {
          const icon = e.verified ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“" : "ÃƒÂ¢Ã…â€œÃ¢â‚¬â€";
          const conf = (e.confidence * 100).toFixed(0);
          appendAssistant(`  ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚ÂÃƒÂ¯Ã‚Â¸Ã‚Â ${icon} ${e.observation} _(${e.recommendation}, ${conf}% conf)_`);
        } else if (e.kind === "observe_skip") {
          appendAssistant(`  ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚ÂÃƒÂ¯Ã‚Â¸Ã‚Â Visual check skipped: ${e.reason}`);
        } else if (e.kind === "retry") {
          appendAssistant(`  ÃƒÂ°Ã…Â¸Ã¢â‚¬ÂÃ¢â‚¬Å¾ Observer recommended retry ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â re-running step ${e.index + 1}ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`);
        } else if (e.kind === "done") {
          appendAssistant("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Plan complete.");
        } else if (e.kind === "error") {
          appendAssistant(`ÃƒÂ¢Ã‚ÂÃ…â€™ Step ${e.index + 1} failed: ${e.message}`);
        } else if (e.kind === "aborted") {
          appendAssistant(`ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â Aborted after step ${e.index}.`);
        }
      },
    });
    setExecuting(false);
    abortRef.current = null;
    return true;
  };

  /** Save the most recently generated VLA plan as a named template. */
  const handleSaveLastPlan = () => {
    if (!lastPlan) return;
    const defaultName = lastPlan.instruction.slice(0, 40);
    const name = window.prompt("Name this plan:", defaultName);
    if (name === null) return;
    const saved = savePlan(name, lastPlan.instruction, lastPlan.actions);
    appendAssistant(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Saved as "${saved.name}". Open the **Plans** popover above to replay it later.`);
  };

  /** Execute a saved plan immediately ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no LLM round-trip. */
  const replayPlan = async (plan: SavedPlan) => {
    setPlanLibraryOpen(false);
    markPlanUsed(plan.id);
    setMessages(prev => [...prev, { role: "user", content: `[Replay] ${plan.name}` }]);
    appendAssistant(`ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Replaying **${plan.name}** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${plan.actions.length} step${plan.actions.length === 1 ? "" : "s"}.`);

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
          appendAssistant(`ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¶ Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
        } else if (e.kind === "response") {
          appendAssistant(`  ${e.ok ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦" : "ÃƒÂ¢Ã…Â¡Ã‚Â ÃƒÂ¯Ã‚Â¸Ã‚Â"} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
        } else if (e.kind === "timeout") {
          appendAssistant(`  ÃƒÂ¢Ã…â€™Ã¢â‚¬Âº Step ${e.index + 1}: no ack from robot (continuing)`);
        } else if (e.kind === "observe_result") {
          const icon = e.verified ? "ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“" : "ÃƒÂ¢Ã…â€œÃ¢â‚¬â€";
          appendAssistant(`  ÃƒÂ°Ã…Â¸Ã¢â‚¬ËœÃ‚ÂÃƒÂ¯Ã‚Â¸Ã‚Â ${icon} ${e.observation}`);
        } else if (e.kind === "done") {
          appendAssistant("ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Replay complete.");
        } else if (e.kind === "error") {
          appendAssistant(`ÃƒÂ¢Ã‚ÂÃ…â€™ Step ${e.index + 1} failed: ${e.message}`);
        } else if (e.kind === "aborted") {
          appendAssistant(`ÃƒÂ¢Ã¢â‚¬ÂºÃ¢â‚¬Â Aborted after step ${e.index}.`);
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
        appendAssistant("There's no plan to save yet.\n\nFirst, toggle **VLA: ON**, give an instruction like *\"go home and move to the center\"*, and let it execute. Then you'll see a **ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Save plan** button below the chat ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â clicking it (or typing `save plan`) stores the plan for later replay.");
      }
      setBusy(false); return;
    }
    if (/^(plans|library|show plans|my plans|list plans)$/i.test(text)) {
      setPlanLibraryOpen(true);
      appendAssistant("ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Plan library opened above. Click any saved plan to replay it.");
      setBusy(false); return;
    }

    // 1) Always try regex robot commands first ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â fast path, no LLM
    const robotLine = parseRobotCommand(text);
    if (robotLine) {
      if (getSerialStatus() !== "connected") {
        appendAssistant(`That looks like a robot command, but the robot isn't connected yet.\n\nClick the **Connect Robot** badge in the top bar (top-right), pick your ESP32 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â or pick **ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â® Demo Mode** to try the app without hardware ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â then try again.`);
        setBusy(false); return;
      }
      try {
        await sendSerialCommand(robotLine);
        appendAssistant(`ÃƒÂ°Ã…Â¸Ã‚Â¤Ã¢â‚¬â€œ Sent: \`${robotLine}\``);
      } catch (e) {
        appendAssistant(`Robot error: ${e instanceof Error ? e.message : "send failed"}`);
      }
      setBusy(false); return;
    }

    // 2) VLA mode: route freeform instructions to the planner first.
    //    If the planner returns NO actions (it was a question / non-motion),
    //    fall through to the KB so electronics questions still work in VLA mode.
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

    // 3) KB lookup
    const kb = findAnswer(text);
    if (kb) {
      await new Promise(r => setTimeout(r, 350));
      appendAssistant(kb);
      setBusy(false); return;
    }

    // 4) Fallback to local Flask chat server, if running
    try {
      const res = await fetch("http://127.0.0.1:5000/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }), signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const d = await res.json() as { reply?: string };
        appendAssistant(d.reply ?? "No response.");
        setBusy(false); return;
      }
    } catch {}

    // 5) Generic miss
    appendAssistant(`That one is outside my current knowledge base. Try toggling **VLA Mode** above if you want me to interpret freeform instructions ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â or ask me about resistors, capacitors, transistors, PCB design, protocols, or how to drive the robot (\`home\`, \`move 10 20\`, \`pick\`).`);
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
            ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Plans
          </button>
          <button
            type="button"
            onClick={() => setVlaMode(v => !v)}
            className={`text-[10px] font-bold px-2 py-1 rounded border transition-colors ${
              vlaMode
                ? "bg-purple-500/25 text-purple-200 border-purple-400/60"
                : "bg-white/5 text-white/60 border-white/20 hover:bg-white/10"
            }`}
            title="Toggle Vision-Language-Action mode: route freeform instructions through Claude ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ robot"
          >
            {vlaMode ? "ÃƒÂ¢Ã¢â‚¬â€Ã‚Â VLA: ON" : "VLA: OFF"}
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
        {executing && (
          <div className="px-3 py-2 bg-purple-900/40 border-t border-purple-400/30 flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold text-purple-200">ÃƒÂ¢Ã¢â‚¬â€œÃ‚Â¶ Executing planÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</span>
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
              ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…Â¡ Save plan
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
            placeholder={vlaMode ? "Tell me what the robot should doÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "Ask Layla, or type a robot commandÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦"}
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