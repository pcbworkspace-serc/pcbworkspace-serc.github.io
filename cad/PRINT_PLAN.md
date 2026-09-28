# MiniMEE CAD selection and print plan

Status: **pre-assembly design review**, 2026-09-28. These are conclusions
from the three user-supplied ZIP archives, not a verified physical fit. STL
coordinates are treated as millimetres provisionally; no source assembly,
joint mates, tolerances, or motor drawings were provided.

## Decision

Do **not** print a full arm from any archive yet. Use the Kboy posed assembly
as a spatial reference, and redraw the load-bearing parts as one parametric
2R + Z + nozzle-rotation assembly. The existing firmware and inverse
kinematics describe a different base/shoulder/elbow/wrist arrangement, so
printing the legacy parts would lock in a mechanical layout that the planned
SCARA controller does not model.

### First prints from the new editable CAD

Run `python cad/scara_fit_prototype.py` to export separate STEP and STL files
to `cad/fit_prototype/`. The two links, base and spacer make a hand-operated
reach mockup. Their pivot holes are 5.4 mm and joint-center distances are
150 and 180 mm by default. Check whether the 210 mm overall second link fits
your printer. If it does not, change the center distance only after checking
the workspace, or print a scaled paper outline; do not scale a motor interface.

| New export | Quantity | Check |
| --- | ---: | --- |
| `base_reach_mockup.stl` | 1 | Fix to a bench fixture; mounting holes depend on that fixture. |
| `link1_reach_mockup.stl` | 1 | Joint 1 to joint 2 reach, collision around the base. |
| `link2_reach_mockup.stl` | 1 | Joint 2 to nozzle projection, PCB and feeder reach. |
| `elbow_spacer_reach_mockup.stl` | 1 | Hand-operated link clearance with washers/fastener. |
| `nema17_face_gauge.stl` | 1 | Pilot and four motor fasteners, **after entering actual motor drawing dimensions**. |
| `nema14_face_gauge.stl` | 1 | Same for actual NEMA 14. |

Use loose M5 hardware and washers for manual motion; this is a position
mockup without a supported bearing joint. The link STL pivot holes and default
gauge dimensions are not a tolerance certification. Compare pilot, bolt
pattern, shaft protrusion, and screw length against the actual motor drawings.
There is no NEMA 8 coupon until its exact hollow-shaft interface is known.

### Optional comparisons from the old archives, when motors are in hand

| Print one of | Archive | Purpose | Acceptance check |
| --- | --- | --- | --- |
| `serc_nema17_joint1.stl` | SERC Final Assembly | NEMA 17 mounting *sample only* | Pilot, hole spacing, screw access, shaft clearance, face seating; inspect print for delamination and distortion. |
| `serc_nema14_arm1.stl` | SERC Final Assembly | NEMA 14 mounting *sample only* | Same checks with actual NEMA 14. Do not assume the similarly named joint3/joint4 pieces belong to the new Z axis. |
| `rev2_arm1.stl` | Kboy revised arm | Link cross-section/print orientation *sample only* | Measure actual center-to-center hole distance and bending by hand with safe loads; outer bounding length is 110 mm and is **not** a joint spacing. |

These legacy parts are optional sacrificial samples, **not** the parts list
for a working arm. Prefer the smaller parametric face gauges above for the
first motor fit test. Check STL units in the slicer before any legacy print.

### Archive triage

| Archive / files | Use | Why |
| --- | --- | --- |
| Kboy `kboy_assembly.stl` | Visual/layout reference; **do not slice as an assembly** | Posed mesh spans roughly 179 × 309 × 202 STL units and has 23 disconnected shells. It does not provide mates or printable parts. This envelope is not workspace reach. |
| Kboy `rev2_arm1.stl`, `kboy1`–`kboy4.stl` | Geometry references; only `rev2_arm1` is nominated for a link sample | Individual meshes are watertight, but their mating relationships, load path, and hardware are not established. |
| Kboy `soph_nozzle_2.stl` | Nozzle appearance reference; **do not print yet** | Ten disconnected shells in a single STL; bore, vacuum seal, hollow-shaft motor interface, and shaft support are unverified. |
| SERC `serc_nema17_joint1.stl`, `serc_nema14_arm1.stl` | Motor-fit samples above | Single watertight shells; dimensions alone do not prove fit. |
| SERC `serc_nema17_joint2.stl` | Repair/redraw | Two disconnected bodies. Do not assume they fuse or assemble correctly. |
| SERC `serc_base.stl`, `serc_shaft_connector_x3.stl` | Repair/redraw | Non-watertight; base has three shells, connector has two. The base is byte-identical to Brian's `soph_demo14.stl`. |
| SERC `serc_base_arm1/2`, `serc_nema14_arm2/joint3/joint4`, `serc_rotate_base`, `serc_cyc_base`, `serc_tip`, `serc_tip_connector`, `serc_tube_long/short` | Hold pending unified assembly | Files look like another arm architecture. Tubes have outer boxes 49 × 100 × 49 and 49 × 70 × 49; those are not proven link-center distances. `serc_cyc_base` has three separate watertight shells. |
| Brian `brian_arm0/1/2` and `Reprint/*_MANU`, connectors, actuator, rod | Shape and variant references; **do not mix versions for production** | Multiple revisions and connector thicknesses; no chosen revision, constrained assembly, or material/fastener schedule. `brian_rod.stl` is about 2.9 × 2.9 × 33 STL units and is not an approved bearing shaft. |
| Brian `soph_new_connectorFINAL.stl`, `soph_demo13/14.stl` | Repair/reference only | `soph_new_connectorFINAL` is non-watertight. `soph_demo14` duplicates `serc_base`. `soph_demo13` contains three bodies. |
| Brian `krish_connector.gcode.3mf` | Do not use as editable CAD | Contains a sliced print job, with machine/material assumptions; not a source model. |

Watertight means only that a triangle mesh encloses volume. It does **not**
verify clearances, strength, motor interfaces, assembly, or safe operation.

## Changes required for a printable revision

1. **Freeze the layout:** choose board size/location, feeder pickup zone,
   nozzle working height, keep-out zones, Z travel, and required reach.
   Parameterize the two joint-center distances from these. The current
   `scara_layout.py` uses provisional 150/180 mm software values; the 110 mm
   STL outer length cannot be substituted for either value.
2. **Assign motor roles:** two NEMA 17s to planar J1/J2, NEMA 14 to guided Z,
   hollow-shaft NEMA 8 to nozzle rotation as a first candidate. Confirm exact
   part numbers, shaft/pilot/bolt dimensions, torque curves, moving mass and
   reduction before sizing links and brackets. Model bearing-supported joints
   so motor shafts do not carry the arm's bending load.
3. **Rebuild editable parts:** base, J1/J2 bearing housings and belt/pulley
   mounts, two links, Z carriage/guide and actuator mount, nozzle bearing and
   vacuum pass-through, motor brackets, covers and cable routing. Include
   homing reference/limit-switch mounts and mechanical travel stops. Keep
   each printable solid and its revision separate in the CAD assembly.
4. **Dimension mating interfaces:** use actual motor drawings and calipers for
   mounting hole patterns, pilot recess, shaft and coupler fit; choose real
   bearings/rails/fasteners and test printed clearance coupons before the
   structural parts. Specify joint-axis coordinates, nozzle offset, printable
   orientation, inserts, and assembly order.
5. **Close the software loop:** export the resulting center distances, Z
   offset, rotation conventions, joint limits, homing references and gear
   ratios to `config.py`, IK/FK, and the ESP32 driver. The current arm firmware
   also conflicts with the proposed three-driver wiring and must be redesigned
   for four axes before hardware motion.

## What can proceed now

The editable `scara_layout.step` in this folder is a **space-claim model**,
not a printable mechanical design. Use it to review workspace with a PCB and
feeder layout. We can then make a first revision of printable parts and a
small set of fit coupons. No existing archive establishes a complete four-axis
print bill of materials.
