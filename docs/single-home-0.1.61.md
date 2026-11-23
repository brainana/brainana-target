# BrainanaTarget 0.1.61 · single home screen

The app opens directly to one home screen. The planning task selector, reference image buttons, demo, saved project and autosave actions, and postoperative evaluation are all on this page. A new plan goes straight from this page to the loaded workspace. Evaluation opens directly and its Home link returns here.

The home screen fills the window with a solid theme background. Viewer controls and empty canvases are hidden until a project loads. The planner's shared typography and theme styles are bundled with the initial page rather than loaded with a workspace. Evaluation uses the same saved appearance preference. Home keeps a plain HTML recovery screen if the application scripts cannot load.

Project format, source data, and autosave storage are unchanged.

Checking each home action in the Mac app also exposed a validation error when starting a chamber-free project. The new, unplaced electrode now initializes with a valid minimum insertion depth. It remains unplaced until the user applies a placement.
