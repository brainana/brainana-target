# Stereotax fiducial alignment and tool calibration (0.1.79)

The shared Stereotax panel now has Measurements, Alignment and Tools subpanels in both planning and evaluation. Frame/accessory configuration remains available above them and in the 3D viewer. The existing measurement workflow stays the default.

## Alignment

1. Choose the positive direction of each measured frame axis: X/ML right or left, Y/AP front or back, Z/DV up or down. Measurements are millimetres; this is an explicit sign convention, not an inferred convention or axis permutation.
2. Pair an image landmark/target with measured frame coordinates for the same physical point, or capture a fixed image crosshair snapshot. Capturing does not create a moving crosshair reference. Pair inputs are saved with the project before any alignment is applied.
3. Use at least three distinct, noncollinear fit points. Additional points can be assigned Independent check; these are excluded from the fit. Disabled pairs are retained but unused. Points should be well distributed over the anatomy. Nearly collinear configurations are reported; exactly/numerically collinear or coincident configurations cannot determine a rigid alignment.
4. Calculate alignment. The preview reports each enabled pair's mismatch and separate fit/check RMS values. Applying is a separate action; pending results cannot be applied after their inputs or frame setup change. Failed calculations leave the previous applied result intact.
5. Apply alignment. The saved transform maps image RAS to frame right/front/up; selected instrument sign directions convert this to the entered raw frame convention. Only the modeled frame pose changes. Targets, anatomy and implant coordinates remain in image space. An alignment can also be used without a modeled frame.
6. Select a target, named point or placed implant reference to see image RAS and calibrated frame XYZ side by side. Review lists calibrated frame coordinates for all targets.

The transform contains rotation and translation only, with no scale, reflection or automatic outlier removal. Fit RMS describes agreement at the fitting fiducials and is not a targeting-accuracy estimate. Independent checks describe mismatch at their measured locations; they do not establish accuracy everywhere in the brain.

Applied calibration is flagged as changed after fit coordinates/references, axis directions, reference image identity, the modeled frame pose, ear-contact configuration or the anatomy's setup offset changes. A check-point edit does not invalidate the fit and immediately updates the independent residuals. Renaming a fiducial and moving an arm's slides do not invalidate global alignment. Missing image references remain unavailable rather than silently retargeting.

Changed alignments retain their input data and old transform for review/recalculation. Operational coordinate readouts and derived exports leave stale calibrated coordinates/mismatches blank. Planner Undo/Redo restores both inputs and calibration validity.

## Tools and slide zeros

Each stable arm identity can hold its own named working tool, three-dimensional working-tip offset from the modeled holder end, measured slide readings at a recorded modeled slide position, and positive slide directions. Local tool X/Y/Z follow the modeled holder/stage axes. A tool extending below the holder normally has a negative Z offset.

Record tool and readings captures the current modeled stage position without moving the arm. Later stage motion changes the displayed slide readings by the signed displacement from that position. The working-tip point incorporates the offset rotated by holder/stage and frame orientation. A current working tip is also selectable as a live measurement endpoint, independently of the existing modeled holder-tip endpoint.

Changing mount/model/holder/axis geometry flags the tool calibration as changed and makes its working tip unavailable until checked and recorded again. Stage translations preserve the recorded zero. Frame alignment validity is checked separately when reporting the tip in calibrated frame coordinates.

Tool offsets/readings are entered from measurements; the app does not estimate an unknown physical tip from nothing. This release does not solve inverse manipulator kinematics to reach a target, simulate every manufacturer knob, or control hardware. Those remain separate work from defining trustworthy coordinate relationships.

## Persistence and exports

Optional frameCalibration metadata is stored in the existing Project schema. Tool calibration belongs to its arm and survives arm reordering. Full precision is retained in portable project metadata, planner autosave and history, with a derived calibration.csv added alongside coordinates.csv and dimensions-and-coordinates.json. Coordinate CSV and HTML reports include calibration data and status. Evaluation saves the edited reference/plan/calibration as a portable working copy, including MRI-only projects. Imported measured-track files remain separate.

## Numerical method and references

The rigid least-squares solver uses Horn's symmetric quaternion matrix and a Jacobi eigensolver to select its largest algebraic eigenvalue. The scale is fixed at one. The inverse transform supplies the modeled frame pose.

- Horn, B. K. P. (1987), [Closed-form solution of absolute orientation using unit quaternions](https://people.csail.mit.edu/bkph/papers/Absolute_Orientation.pdf).
- SimpleITK, [Registration Errors, Terminology and Interpretation](https://insightsoftwareconsortium.github.io/SimpleITK-Notebooks/Python_html/68_Registration_Errors.html), especially the distinction between fit residuals and independent target/check errors.

## Verification

Domain tests cover known translations/rotations, 180° rotations, Euler gimbal cases, reordered and noisy correspondences, rigid distance/no-reflection invariants, degeneracy rejection, separate check residuals, convention signs, setup-change detection, recorded slide-zero invariance, tool offsets, validation, full-precision exports and Undo/Redo. Packaged Electron tests enter pairs through the UI, apply alignment, edit fit/check pairs, exercise stale readouts and Undo, record tools, export and reopen, and edit/save the same alignment in MRI-only evaluation. Existing planner workflow and desktop regressions cover startup, measurement rulers, placement and evaluation.
