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
  { keywords:["resistor","resistance","ohm","ohms law"], answer:"Great question! Resistors are fundamental to every circuit you will ever design. Ohm's Law ties it all together: V = I x R\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Power dissipated: P = IÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²R = VÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²/R\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Series: R_total = R1 + R2 (they add up)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Parallel: 1/R_total = 1/R1 + 1/R2 (total is always less than the smallest)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ 4-band color code: Blk=0 Brn=1 Red=2 Org=3 Yel=4 Grn=5 Blu=6 Vio=7 Gry=8 Wht=9\nOnce you memorize the color code, reading resistors becomes second nature!\nSource: Sedra & Smith, Microelectronic Circuits Ch.1" },
  { keywords:["capacitor","capacitance","farad","decoupling","bypass"], answer:"Capacitors are endlessly useful ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â they show up in almost every subsystem you will work with. C = Q/V\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Energy stored: E = 0.5CVÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Impedance: Z = 1/(jwC) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â short circuit at high frequencies, open at DC\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Series: 1/C = 1/C1 + 1/C2 | Parallel: C = C1 + C2\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ One of the most impactful things you can do on a PCB: place a 100nF decoupling cap within 1mm of every IC power pin. It genuinely makes a difference.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Electrolytic caps are polarized ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â longer lead is positive, never reverse them.\nSource: Horowitz & Hill, The Art of Electronics Ch.1" },
  { keywords:["inductor","inductance","henry","coil","choke"], answer:"Inductors resist changes in current ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â they are the complement to capacitors in almost every way.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Governing equation: V = L x dI/dt\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Energy stored: E = 0.5LIÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â²\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Impedance: Z = jwL ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â open at high frequencies, short at DC (exactly opposite to a capacitor)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Essential for switching power supplies, EMI filters, and RF matching networks\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Watch out for the self-resonant frequency ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â operating above it defeats the purpose.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["diode","pn junction","forward bias","rectifier","schottky","zener"], answer:"Diodes are one of the most elegant components in electronics ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â current flows in one direction only.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Forward voltage: ~0.7V silicon, ~0.3V Schottky, 1.8-3.5V for LEDs\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Zener diodes conduct in reverse at a defined breakdown voltage ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â excellent for voltage clamping and regulation\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Schottky diodes switch faster and have lower Vf ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â preferred for high-speed and power applications\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Polarity matters! Mark the cathode band clearly on your silkscreen ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â it is a simple step that prevents a frustrating mistake.\nSource: Sedra & Smith Ch.3" },
  { keywords:["transistor","bjt","mosfet","npn","pnp","amplifier","switch","fet"], answer:"Transistors are the foundation of modern electronics ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â every processor, amplifier, and power switch relies on them.\n**BJT (current-controlled):** Ic = Beta x Ib\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ NPN: Vbe ~0.7V to turn on | Beta typically 50-500\n**MOSFET (voltage-controlled):**\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ NMOS: requires Vgs > Vth to conduct (typically 1-3V)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Near-zero gate current makes MOSFETs ideal for power switching\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ PCB tip: a 10-33 ohm gate resistor with short gate traces prevents oscillation ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â a small detail with real impact.\nSource: Sedra & Smith Ch.4-5" },
  { keywords:["led","light emitting","brightness","current limiting"], answer:"LEDs require a current-limiting resistor ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â without one, they will draw too much current and fail quickly.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Forward voltage: Red 1.8-2.2V | Green 2-3.5V | Blue/White 3-3.5V\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Typical operating current: 10-20mA\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Resistor formula: R = (Vsupply - Vf) / I_LED\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Example: 5V supply, red LED (Vf=2V), 20mA ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ R = (5-2)/0.02 = 150 ohm\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Identification: longer lead = anode (+), flat edge on dome = cathode (-)\nSource: Horowitz & Hill Ch.2" },
  { keywords:["pcb","printed circuit","trace","via","layer","gerber","copper"], answer:"PCB design is where theory meets hardware ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â getting the fundamentals right here pays dividends throughout the project.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Trace width: IPC-2221 is your reference ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â 1oz copper, 1A ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ ~0.25mm on external layer\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Clearance: 0.1mm minimum for low-voltage signals, more for anything higher\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Vias: 0.3mm minimum drill, 0.6mm pad for standard fab\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ A solid ground plane on an inner layer is one of the best investments you can make for EMI performance\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Always include 3 fiducial markers for pick-and-place alignment ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â this robot uses them!\nSource: IPC-2221 Standard, Grover & Ghassemi PCB Design Techniques" },
  { keywords:["smd","surface mount","reflow","solder","paste","soldering","assembly"], answer:"SMT assembly is a precise process ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â small variations in paste volume or thermal profile can affect yield significantly.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Reflow profile: Preheat 150ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°C ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Soak ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Peak 220-250ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°C (SAC305 lead-free) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ Controlled cool\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Stencil thickness: 0.12mm for 0402 components, 0.15mm for larger\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Tombstoning occurs when heating is uneven or pads are asymmetric ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â balanced pad design prevents it\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ This robot arm places components with sub-millimeter accuracy using JEPA vision correction ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â that is exactly what the alignment system is for.\nSource: IPC-7711, J-STD-001" },
  { keywords:["opamp","op-amp","operational amplifier","gain","feedback"], answer:"Op-amps are remarkably versatile ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â with the right feedback network, a single device can amplify, filter, compare, or buffer.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Inverting: Vout = -(Rf/Rin) x Vin\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Non-inverting: Vout = (1 + Rf/Rin) x Vin\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Unity-gain buffer: Vout = Vin ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â invaluable for impedance isolation\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Virtual ground principle: V+ = V- in negative feedback ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â understanding this unlocks most op-amp analysis\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ PCB tip: a small capacitor (100pF) across the feedback resistor improves phase margin. Always bypass supply pins with 100nF.\nSource: Sedra & Smith Ch.2" },
  { keywords:["power supply","ldo","buck","boost","regulator","switching","voltage"], answer:"Choosing the right power topology early saves significant redesign effort later.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ LDO: Vout = Vref x (1 + R1/R2) | Simple, low noise, but efficiency = Vout/Vin ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â excess becomes heat\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Buck (step-down): Vout = D x Vin | 85-95% efficient ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the right choice for most battery-powered designs\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Boost (step-up): Vout = Vin/(1-D)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ PCB tip: minimize the switching loop area, place input capacitors close to the switch node, and use wide traces for high-current paths.\nSource: Razavi Ch.11, Texas Instruments Power Design Seminar" },
  { keywords:["filter","low pass","high pass","cutoff","rc filter","lc filter"], answer:"Filters are essential for signal conditioning, noise rejection, and power supply design.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ RC Low-Pass: fc = 1/(2*pi*R*C) | -20dB/decade rolloff above fc\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ RC High-Pass: same formula, passes frequencies above fc\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ LC Low-Pass: fc = 1/(2*pi*sqrt(LC)) | -40dB/decade ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â sharper rolloff\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Butterworth: maximally flat passband, good general-purpose choice\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Chebyshev: steeper rolloff at the cost of passband ripple\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Higher-order filters give steeper rolloff but add component count and complexity.\nSource: Horowitz & Hill Ch.1" },
  { keywords:["uart","i2c","spi","serial","protocol","communication","can"], answer:"Choosing the right protocol comes down to speed, pin count, and distance requirements.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ UART: asynchronous, 2 wires, 9600-115200 baud ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â simple and universally supported\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ I2C: 2 wires, multi-device on one bus, requires 4.7k pull-ups, up to 1MHz\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ SPI: 4 wires, full duplex, up to 50MHz+ ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â fastest and simplest electrically, one CS per device\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ CAN: differential pair, 120 ohm termination at each end, up to 1Mbps ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â robust in electrically noisy environments\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ For high-speed SPI: match trace impedance and keep clock lines short.\nSource: Horowitz & Hill Ch.14" },
  { keywords:["ground","grounding","emi","noise","plane","star ground"], answer:"Grounding strategy is one of the most overlooked aspects of PCB design ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â and one of the most consequential.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ A continuous ground plane on an inner layer dramatically reduces impedance and EMI\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Star ground: bring all grounds to a single point ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â best for mixed analog and digital designs\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Decoupling: 100nF ceramic at every IC power pin, plus 10uF bulk per power domain\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Never route a high-speed signal over a break in the ground plane ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â the return current has nowhere clean to go\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Guard rings around sensitive analog circuits help reject interference from nearby digital signals.\nSource: Ott, Electromagnetic Compatibility Engineering" },
  { keywords:["jepa","neural network","alignment","vision","camera","machine learning","ai"], answer:"The JEPA Vision System is the intelligence behind this robot arm ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â and it is genuinely interesting technology.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ JEPA stands for Joint Embedding Predictive Architecture, developed by Yann LeCun at Meta AI\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ It learns PCB board structure from unlabeled camera footage ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â no hand-labeling required for pretraining\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Three specialized inference heads:\n  1. ComponentDetector ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â locates fiducials, classifies component types from the top camera\n  2. AlignmentCorrector ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â computes the rotation and XY offset needed before each placement\n  3. PlacementValidator ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â compares pre and post placement frames to verify success\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Achieves less than 2 degree rotation error and less than 0.2mm positional error\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Click JEPA Vision in the sidebar to run alignment live, or try the Demo to see the full pipeline." },
  { keywords:["place","placement","put","add","drag","drop"], answer:"Placing components on the board is straightforward.\n1. Locate the component in the Inventory panel on the left\n2. Click and drag it onto the PCB board\n3. Release to drop it at that position\nAvailable components: Resistor, Diode, Capacitor, LED, Transistor, Channel Port\nIn a real assembly workflow, this robot arm would pick and place each component using the JEPA vision system for sub-millimeter accuracy." },
  { keywords:["robot command","robot control","drive robot","control the robot","control robot","what can the robot do","robot commands"], answer:"You can drive the SCARA arm directly from this chat once connected. Click the **Connect Robot** badge in the top bar (top-right) first ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â it opens a USB port picker.\n\n**Things you can type to me:**\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `home` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â return to home position\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `move 10 20` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â go to X=10mm, Y=20mm (add a 3rd or 4th number for Z and rotation)\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `pick` / `place` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â gripper close / open\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `rotate 90` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â rotate end-effector by 90ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `stop` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â emergency halt\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ `scan`, `detect`, `align`, `validate` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â task verbs\n\n**Or turn on VLA Mode** (header button) to ask in plain English: *\"place a resistor in the upper left\"* or *\"pick up whatever is near the center and home\"* ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Layla will plan and execute the steps." },
  { keywords:["vla","vision language","gemini robotics","natural language robot"], answer:"VLA Mode (Vision-Language-Action) lets you control the robot with plain English instead of explicit commands.\n\n**To enable:** click the **VLA: OFF** button at the top of this panel ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â it turns purple.\n\n**How it works:**\n1. Your message + current board state + (optionally) the camera frame are sent to your local Flask server at `127.0.0.1:5000/vla/plan`\n2. Anthropic Claude breaks the instruction into a sequence of robot actions (HOME, MOVE, PICK, PLACEÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦)\n3. Each action is sent to your ESP32 over serial in order\n\n**Try:** *\"place a resistor 10mm from the lower left corner\"* or *\"go home and then move to the middle of the board\"*.\n\nRequires: local Flask running with the `flask_vla.py` route registered and `ANTHROPIC_API_KEY` set." },
  { keywords:["help","what can","commands","tutorial","how"], answer:"Happy to help! Here is what I can assist with:\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Electronics theory ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â resistors, capacitors, inductors, transistors, op-amps, diodes\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ PCB design ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â trace width, clearance, via sizing, impedance, grounding, EMI\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Assembly ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â SMT reflow, solder paste, component placement\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Communication protocols ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â UART, I2C, SPI, CAN\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Power electronics ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â LDO, buck, boost, filtering\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ The JEPA Vision System ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â how this robot arm uses AI for precision placement\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ Component placement ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â drag items from Inventory onto the board\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ **Driving the SCARA robot** ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â type `home`, `move 10 20`, `pick`, `place`, etc.\nÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢ **VLA Mode** ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â toggle the VLA button to drive the robot with plain English\n\nSome questions to try:\n  How do I calculate an LED current-limiting resistor?\n  What is the difference between I2C and SPI?\n  How does a buck converter work?" },
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
        <p key={i} className={["text-sm leading-relaxed", line.startsWith("ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢") || line.startsWith(" ") ? "pl-2" : ""].join(" ")}>
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
    appendAssistant("ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Aborted by user. Sending STOP to robotÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦");
    sendSerialCommand("STOP").catch(() => {});
  };

  const runVLA = async (instruction: string): Promise<boolean> => {
    appendAssistant("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â§Ãƒâ€šÃ‚Â  PlanningÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦");

    // Try to grab a camera frame for visual grounding
    let frame: Blob | null = null;
    try { frame = await grabCameraFrame(); } catch {}

    const plan = await planAction(instruction, boardItems, frame);

    if (!plan.ok) {
      appendAssistant(`VLA error: ${plan.error}${plan.raw_response ? `\n\nRaw response:\n${plan.raw_response.slice(0, 400)}` : ""}`);
      return true;   // we tried, surfaced an error ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â don't double-respond from KB
    }

    // No motion intent ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â let the caller fall through to KB
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
      appendAssistant("Robot isn't connected, so I can show the plan but can't execute it.\n\nClick the **Connect Robot** badge in the top bar ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â pick **ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚Â® Demo Mode** to simulate it, or **Real Robot** to drive your ESP32.");
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
        // After PICK ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ bottom camera sees the part held on the nozzle
        // After PLACE / RELEASE ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ top camera sees the part on the PCB
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
          appendAssistant(`ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Ãƒâ€šÃ‚Â¶ Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
        } else if (e.kind === "response") {
          appendAssistant(`  ${e.ok ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â"} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
        } else if (e.kind === "timeout") {
          appendAssistant(`  ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬â„¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Âº Step ${e.index + 1}: no ack from robot (continuing)`);
        } else if (e.kind === "observe_start") {
          appendAssistant(`  ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Checking cameraÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦`);
        } else if (e.kind === "observe_result") {
          const icon = e.verified ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
          const conf = (e.confidence * 100).toFixed(0);
          appendAssistant(`  ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â ${icon} ${e.observation} _(${e.recommendation}, ${conf}% conf)_`);
        } else if (e.kind === "observe_skip") {
          appendAssistant(`  ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â Visual check skipped: ${e.reason}`);
        } else if (e.kind === "retry") {
          appendAssistant(`  ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾ Observer recommended retry ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â re-running step ${e.index + 1}ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦`);
        } else if (e.kind === "done") {
          appendAssistant("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Plan complete.");
        } else if (e.kind === "error") {
          appendAssistant(`ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Step ${e.index + 1} failed: ${e.message}`);
        } else if (e.kind === "aborted") {
          appendAssistant(`ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Aborted after step ${e.index}.`);
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
    appendAssistant(`Saved as "${saved.name}". Open the **Plans** popover above to replay it later.`);
  };

  /** Execute a saved plan immediately ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â no LLM round-trip. */
  const replayPlan = async (plan: SavedPlan) => {
    setPlanLibraryOpen(false);
    markPlanUsed(plan.id);
    setMessages(prev => [...prev, { role: "user", content: `[Replay] ${plan.name}` }]);
    appendAssistant(`ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚Â¡ Replaying **${plan.name}** ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ${plan.actions.length} step${plan.actions.length === 1 ? "" : "s"}.`);

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
          appendAssistant(`ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Ãƒâ€šÃ‚Â¶ Step ${e.index + 1}/${e.total}${retrySuffix}: \`${e.line}\``);
        } else if (e.kind === "response") {
          appendAssistant(`  ${e.ok ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã‚Â¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â"} ${e.line.trim() || (e.ok ? "OK" : "ERR")}`);
        } else if (e.kind === "timeout") {
          appendAssistant(`  ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬â„¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Âº Step ${e.index + 1}: no ack from robot (continuing)`);
        } else if (e.kind === "observe_result") {
          const icon = e.verified ? "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ" : "ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â";
          appendAssistant(`  ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¯Ãƒâ€šÃ‚Â¸Ãƒâ€šÃ‚Â ${icon} ${e.observation}`);
        } else if (e.kind === "done") {
          appendAssistant("ÃƒÆ’Ã‚Â¢Ãƒâ€¦Ã¢â‚¬Å“ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ Replay complete.");
        } else if (e.kind === "error") {
          appendAssistant(`ÃƒÆ’Ã‚Â¢Ãƒâ€šÃ‚ÂÃƒâ€¦Ã¢â‚¬â„¢ Step ${e.index + 1} failed: ${e.message}`);
        } else if (e.kind === "aborted") {
          appendAssistant(`ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚ÂºÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Aborted after step ${e.index}.`);
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
        appendAssistant("There's no plan to save yet.\n\nFirst, toggle **VLA: ON**, give an instruction like *\"go home and move to the center\"*, and let it execute. Then you'll see a **ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚Â¡ Save plan** button below the chat ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â clicking it (or typing `save plan`) stores the plan for later replay.");
      }
      setBusy(false); return;
    }
    if (/^(plans|library|show plans|my plans|list plans)$/i.test(text)) {
      setPlanLibraryOpen(true);
      appendAssistant("ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚Â¡ Plan library opened above. Click any saved plan to replay it.");
      setBusy(false); return;
    }

    // 1) Always try regex robot commands first ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â fast path, no LLM
    const robotLine = parseRobotCommand(text);
    if (robotLine) {
      if (getSerialStatus() !== "connected") {
        appendAssistant(`That looks like a robot command, but the robot isn't connected yet.\n\nClick the **Connect Robot** badge in the top bar (top-right), pick your ESP32 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â or pick **ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€¦Ã‚Â½Ãƒâ€šÃ‚Â® Demo Mode** to try the app without hardware ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â then try again.`);
        setBusy(false); return;
      }
      try {
        await sendSerialCommand(robotLine);
        appendAssistant(`ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸Ãƒâ€šÃ‚Â¤ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“ Sent: \`${robotLine}\``);
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
    appendAssistant(`That one is outside my current knowledge base. Try toggling **VLA Mode** above if you want me to interpret freeform instructions ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â or ask me about resistors, capacitors, transistors, PCB design, protocols, or how to drive the robot (\`home\`, \`move 10 20\`, \`pick\`).`);
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
            title="Toggle Vision-Language-Action mode: route freeform instructions through Claude ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ robot"
          >
            {vlaMode ? "ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬ÂÃƒâ€šÃ‚Â VLA: ON" : "VLA: OFF"}
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
            <span className="text-[10px] font-bold text-purple-200">ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“Ãƒâ€šÃ‚Â¶ Executing planÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦</span>
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
              ÃƒÆ’Ã‚Â°Ãƒâ€¦Ã‚Â¸ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œÃƒâ€¦Ã‚Â¡ Save plan
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
            placeholder={vlaMode ? "Tell me what the robot should doÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦" : "Ask Layla, or type a robot commandÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦"}
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