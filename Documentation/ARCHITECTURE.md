# Architecture

apps/planner owns the UI, rendering orchestration, local import/export, tutorial and evaluation workflows. packages/planning-core contains renderer-independent project models, physical geometry, hardware and fit calculations. packages/core-desktop, core-launcher, core-server and core-client provide the Electron shell, authenticated loopback runtime and data access. packages/brainana-data provides Brainana dataset discovery and atlas/color metadata. packages/niivue-kit and packages/imaging-math provide shared rendering and imaging helpers. packages/ui contains UI primitives and licensed fonts.

All planning coordinates use the reference image's RAS millimetre frame. Source image bytes remain separate from editable project metadata. The original and tutorial sessions use separate documents; tutorial mode cannot overwrite normal project autosave. Display controls and physical geometry are separate concerns.

This standalone extraction moves the remaining shared colormap integration into niivue-kit. No apps/viewer source or executable is required at build time or runtime.
