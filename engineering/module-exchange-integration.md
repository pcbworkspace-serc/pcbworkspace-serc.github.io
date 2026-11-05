# Module exchange simulation panel

The left sidebar now includes a dummy-module exchange panel backed by the new
`/exchange/plan` and `/exchange/simulate` routes in pcbworkspace-backend.
Set `VITE_NN_URL` to that backend as for existing AI/vision requests. The panel
requires preview and explicit confirmation; changing the scenario resets both.
All traces are synthetic and no WebSerial or robot-control calls are made.

Review the matching backend change before deploying either side. An older backend
returns an error in this panel; it does not fall back to hardware or claim success.
If BACKEND_API_KEY is enabled, the existing frontend authentication design needs
a trusted proxy/session integration; do not embed the shared backend key in a
public build. This simulation client deliberately does not add such a secret.

Tests cover request/approval binding, failure reporting, simulation labeling and
the panel confirmation flow. These establish software behavior, not physical
grip, gravity, placement accuracy or flight readiness. The next hardware stage
requires a measured fixture registry, actuator/sensor interface and commissioned
controller with homing, feedback, watchdog and passive retention.
