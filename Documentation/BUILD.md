# Build and release

Use Node.js 24 LTS. Install with `npm ci`, build with `npm run build`, and launch the Electron app with `npm run dev`. `npm start` runs the local browser launcher. No Viewer checkout is needed.

`npm test` runs the planning and workflow regression suites. `npm run test:desktop` exercises a packaged app; set PLANNER_DESKTOP_BINARY to its executable. `npm run planner:test:tutorial:desktop` checks the real planner tutorial and rendered image changes. Use a temporary test profile, never an active user profile.

Package with `npm run planner:dist -- --mac --arm64`, `--mac --x64`, `--win --x64`, or `--linux --x64` on the corresponding native host. The normal release matrix uses macOS Apple Silicon, macOS Intel, Windows x64 and Ubuntu 22.04 x64 runners. Build outputs are under apps/planner/release and are not committed.

Version identity comes from package.json, apps/planner/package.json and VERSION.json. scripts/ci/check-version.mjs rejects mismatches and checks a release tag against the version. scripts/generate-version.mjs produces the server/runtime identity before building. The Electron package uses the root version; it does not hardcode an older extraMetadata version.

Push a vVERSION tag to run .github/workflows/release.yml. Every native job builds, runs regression checks, packages installers, inspects the packaged resources and launches the packaged app with a temporary profile. Linux GUI checks use Xvfb and CI uses software rendering for portability. Those checks do not establish graphics-driver performance on testers' computers.

The aggregate job collects installers, validation JSON, source, documentation, per-platform manifests and SHA-256 checksums. Publishing is gated on all required platform jobs succeeding. Alpha releases are marked as prereleases. workflow_dispatch builds validation artifacts without publishing.

The macOS apps are ad-hoc signed, not Apple-notarized. Windows installers are not Authenticode signed. The release notes explain the resulting first-launch prompts.
