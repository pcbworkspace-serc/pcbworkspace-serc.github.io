# MiniMEE SCARA layout study

`scara_layout.py` generates an editable STEP assembly envelope with two planar
revolute axes, a guided Z axis, and a rotating nozzle axis. Run:

```sh
python cad/scara_layout.py --link1 150 --link2 180 --theta1 0 --theta2 60
```

The 150 and 180 mm defaults come from the current Python configuration. They
are **not verified from the STLs or approved for fabrication**. Each STL lacks
joint mates and units; the Kboy assembly is a posed mesh reference. Motor body
dimensions, shaft interfaces, bearings, belt ratios, Z stroke, PCB and feeder
locations, cable routing, and nozzle fit must be measured before designing
printable brackets.

Proposed motor roles: NEMA 17 at joint 1 and joint 2; NEMA 14 on the guided Z
axis; hollow-shaft NEMA 8 on nozzle rotation. These are allocation candidates,
pending motor torque curves and moving-mass calculations.

This model intentionally contains envelope solids only. Do not manufacture it
as a load-bearing arm. The next CAD revision will replace these with parts and
mates after measuring the hardware and setting the board/feeder workspace.

See [PRINT_PLAN.md](PRINT_PLAN.md) for archive-by-archive print decisions and the required CAD changes.
