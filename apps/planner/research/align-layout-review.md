# BrainanaTarget / Align organization review

Reference: supplied Align 0.16.41-guide.1 source archive, including settingsUI.ts,
preferences.ts, style.css, guided setup, and desktop composition. Review covers
source organization; Align was not launched side by side in this sandbox.

| Area | Finding and decision |
| --- | --- |
| Application identity | Keep shared Brainana typography, amber palette, header/status bar; retain Target name and planning context. |
| Toolbar | Align groups related actions and wraps at narrow widths. Target now separates history, preferences/help, and project actions with dividers and wraps without a fixed-height header. |
| Workflow | Align registration modes do not map to intervention planning. Retain Target's Data → Targets → Avoid → Chamber → Electrode → Position → Grid → Review progression, including Grid compatibility feedback. |
| Inspector | Keep one contextual inspector rather than duplicating controls across all views. Apply preference text scaling to notes, labels and readouts as well as body text. |
| Settings | Match Align's 720px responsive card, 16px padding, close header, section navigation, horizontal label/control rows, selected-section treatment, and reset-section/import/export footer. Use Appearance, Display, Interaction, Saving; omit registration-only settings. |
| Hardware editor | The wider two-column draft editor is needed for array visualization. Keep Apply/Cancel and isolated draft semantics; add the same close-header pattern as Settings. Closing discards draft. |
| Atlas explorer | Keep movable nonmodal explorer, visibility bulk actions, ROI search and opacity. It must remain usable alongside anatomy; a modal settings card would interrupt targeting. |
| Views | Keep anatomy, 3D, along-trajectory and across-trajectory views with resize dividers. Align's fixed/moving overlays serve a different function. Layer/cutaway/opacity controls remain view-local. |
| Guide | Both use a movable guide and highlighted bounding regions. Preserve Target's feature navigation and feasibility-gated steps. Registration instructions and transform selectors are inappropriate here. |
| Startup | Keep fresh startup and explicit recovery, consistent with user's earlier requirement. Startup must not expose unused imaging splitters. |
| Feedback | Preserve hover explanations and invalid-choice gating, constraint rejection counts, explicit unapplied placement preview and transactional Apply. Preferences save immediately; hardware edits remain drafts. |
| Persistence | Preferences remain separate from project geometry. Browser/Electron local-origin storage is still port-associated; Align's desktop preference bridge is a future architectural migration, not implemented by this layout change. |
| Keyboard/accessibility | Native settings dialog traps focus, Escape closes, named header close control, keyboard shortcut, selected-section accessibility state; keep field labels and existing disabled-control explanations. |
| Responsive layout | Wrap toolbar actions; constrain settings to viewport; preserve independently scrollable inspector and image views. Large-target preferences can consume additional toolbar rows. |
| Distribution | Rebuild standalone payload after layout changes. Native macOS window execution remains subject to sandbox registration restriction; browser verification is not evidence of native-window launch. |

Remaining differences are purposeful functional differences, except desktop
preference storage across ports and custom/named appearance presets (available
in Align but not yet in Target). These are explicitly not presented as complete
feature parity.
