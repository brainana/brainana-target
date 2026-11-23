# BrainanaTarget 0.1.59 · startup recovery

The home screen is included in the page itself. Both workspace choices appear before the application scripts run. If a workspace script fails to load, the page keeps a visible recovery message and a way back to Home. If Electron cannot load its local page or its renderer crashes, the Mac app offers to reload the page without using the cached copy.

This release keeps the same application identity and storage. It does not clear project files or autosave. The ZIP contains a separately named `BrainanaTarget 0.1.59.app` so it can be opened alongside an earlier copy.

The reported blank window could not be reproduced on demand. The downloaded 0.1.58 app matched its packaged archive and passed signature verification. Browser fault injection confirmed recovery with the entry script blocked and with the planning chunk blocked.
