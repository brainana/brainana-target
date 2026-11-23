This is a very preliminary **early alpha**, shared with brave souls who want to explore unfinished software and help us decide what is useful, confusing, or missing. Expect bugs and changing workflows. The models and fit results are not validated for surgical decisions.

Start with the bundled NMT macaque demo and the separate **Demo tutorials** walkthrough. The existing **Guided tutorial** remains available.

Choose your platform's installer: Apple Silicon or Intel macOS DMG, Windows x64 setup EXE, or Linux x64 AppImage/DEB. Mac and Windows portable ZIPs are also provided. Installers include the demo. The source ZIP is for development; the full-release ZIP contains all platforms, source, documentation and validation reports.

macOS builds are ad-hoc signed, not Apple-notarized; you may need System Settings → Privacy & Security → Open Anyway after attempting to launch. Windows builds do not carry a verified publisher signature and may show SmartScreen. Linux builds use Ubuntu 22.04 as their baseline.

Each platform is built on a native runner, inspected for version and bundled resources, and launched to check the home screen, evaluation navigation, NMT/CT demo loading, WebGL2, isolated renderer, and server shutdown. CI uses software rendering. These checks establish basic application behavior, not anatomical accuracy, clinical suitability or graphics performance on your computer.

The demo CT is an estimated MEBRAINS population CT warped to a 0.5 mm NMT grid with expanded coverage. It is not a CT acquired from the NMT subjects.

Please share bugs and workflow feedback through this repository's Issues. SHA256SUMS.txt and platform manifests accompany the downloads.
