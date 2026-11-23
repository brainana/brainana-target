# Macaque demo tutorial prototype (0.1.83)

Demo tutorials is an additional feature, available beside Guided tutorial on Home and in the planner toolbar. It opens a four-step Images and display walkthrough: identify the slice and 3D viewers, demonstrate linked slice navigation, demonstrate MRI/CT blending, and optionally practice CT overlay opacity.

The tutorial uses the bundled NMT MRI, cortical pial meshes and MEBRAINS CT estimate with the normal NiiVuePlanningScene renderer and imageFiles display controls. The first steps display MRI alone; later steps blend CT over MRI at 50%. The 3D brain shows cortical surfaces, not a finalized skull. The CT's status as a warped population estimate is explained in the blending step.

The walkthrough has Previous/Next, named step markers, a keyboard-accessible step slider, replay, restart, Restore lesson view, and explicit completion. Only the authored opacity step offers Try this step. That exercise enables the normal Overlay opacity slider and exact value field; other image controls remain unavailable. A mutation check also rejects edits to any other project property. Practice supports Reset step and Show me; continuing restores the prepared 50% opacity example. No timed advancement or exact-value quiz is required. Slice/camera inspection remains available, and Restore lesson view resets viewing without changing practice opacity.

Every seek restores a project/display/camera checkpoint. Aborted requests cannot overwrite later steps; replay animation is cancelled when seeking. Reduced-motion preferences skip animation. Progress remembers only the lesson version and step, never practice edits or a tutorial project.

Isolation is implemented as a separate document inside a modal iframe. The tutorial entry never imports the planner workspace or project persistence. Its project store, history, viewers and temporary display tools belong to that document. The original workspace remains loaded and modal/inert, preserving project history, unfinished editors, selected panels and view state. Tutorial edits cannot replace normal project recovery. Normal pending autosaves may still complete independently. Exit or Escape removes the tutorial document and restores focus. Guided tutorial remains a separate feature and retains its place.

The first release intentionally includes only this four-step prototype; it does not claim to provide the full Images and display curriculum, planning-surface lesson, or evaluation lessons. Future sections can extend the checkpoint/player structure after the prototype is reviewed.

Validation includes player cancellation and completion races, strict opacity-only edits, actual bundled-viewer pixel changes, practice/reset/skip/continue, progress resume, entry from Home, minimum-window navigation, preservation of normal autosave and unfinished headpost fields, retained Undo/Redo, and coexistence with the existing guided tutorial. Tests use isolated desktop profiles.
