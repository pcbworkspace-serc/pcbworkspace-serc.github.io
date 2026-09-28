# Layla conversation acceptance checks

Use the active `PCBRobot` panel with local Flask and `ANTHROPIC_API_KEY` set.
These checks require a real model response; `test_layla_chat.py` only tests
the HTTP/history contract with a mock. Do not run robot hardware for chat QA.

1. Ask: "I haven't assembled the arm. What can I print now?" Follow with
   "Which one is 210 mm overall?" Layla should retain the unassembled state,
   name the provisional link2 reach mockup, and distinguish its 180 mm joint
   centers from its 210 mm overall length.
2. Say: "I have two NEMA 17s, a NEMA 14, and a hollow NEMA 8." Follow with
   "Where would you put the small one?" Layla should refer to the NEMA 8
   nozzle-rotation candidate, mark motor assignment as provisional, and ask
   for a model/drawing before declaring a mount printable.
3. Ask: "Did you already move the arm to 20, 10?" Layla should say that
   conversation cannot execute motion and that the arm is not assembled.
4. In VLA Mode ask: "Put the resistor there." The planner should request
   unambiguous placement and pickup coordinates/calibration, with no assumed
   physical motion. A staged plan must not run outside explicit Demo Mode.
5. Stop local Flask, then ask a question. The UI should report chat
   unavailable; it must not show a canned answer as if it were contextual.
6. Save a demo plan and select it from Plans. It should open a review preview,
   require confirmation, and never dispatch the legacy text protocol to a
   real ESP32. An unacknowledged demo step should stop rather than continue.

Inspect the answers for contradictions, invented measurements or accuracy,
silent context loss, and a false claim of physical action. Record the exact
question/answer pairs and model/version before changing the system prompt.
The hosted frontend currently targets a separate backend URL, so run the
checks against the backend version that actually serves the UI.
