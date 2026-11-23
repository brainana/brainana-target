# Bundled demonstration data

Brainana Target's **Try the macaque demo** loads the NMT2Sym template and companion files in `nmt2sym/`: MRI, cortical surfaces, atlases, retinotopy maps and the MEBRAINS CT estimate warped to an expanded NMT grid. See the source manifests, reference files, and [CT derivation](nmt2sym/MEBRAINS-CT.md) for provenance and dataset-specific terms.

The CT is a population estimate resampled to 0.5 mm. It is not a CT acquired from the NMT subjects. The expanded field of view retains the skull crown; it does not synthesize missing bone.

The small `sub-example/` and `fastsurfer/` trees are inherited, publicly shared Brainana Viewer fixtures used by the shared data/import code. They are separate from the Target home-screen demo.

Demo data retain their own licenses and citations; the application's AGPL license does not replace them.
