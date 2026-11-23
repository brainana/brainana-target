# MEBRAINS CT estimate in the NMT demo

Balan et al., MEBRAINS 1.0: A new population-based macaque atlas, Imaging Neuroscience (2024), https://doi.org/10.1162/imag_a_00077. The publication supplement supplies the CT and matching T1; CC BY 4.0.

Projected with the published RheMAP MEBRAINS → NMT v2 symmetric 0.5 mm composite warp: https://gin.g-node.org/ChrisKlink/RheMAP/src/master/warps/final/MEBRAINS_to_NMTv2.0-0.5mm-sym_CompositeWarp.nii.gz . Credit Sirmpilatze and Klink, RheMAP, https://github.com/PRIME-RE/RheMAP .

The supplementary CT/T1 1 mm headers were harmonized to the matched RheMAP 0.4 mm source geometry after exact voxel correspondence was established using the T1 images. Linear interpolation resampled the CT onto the demo MRI lattice with 10 mm of additional coverage on every side. This preserves the skull crown that the MRI field of view cuts off. The JSON sidecar records original/corrected geometry, source hashes, URLs and quality checks. Version 0.1.82 uses the original NMT-to-MEBRAINS inverse affine and inverse deformation in the published inverse-chain order, rather than the MRI-sized precomposed field. No bone filling or displacement extrapolation is performed. Reproduce with scripts/expand-demo-ct.py and the MEBRAINS-to-NMT source bundle.

This is a warped population CT estimate, not a CT measured from the NMT subjects. Brain-mask Dice 0.9847 assesses brain alignment and does not independently validate skull anatomy. The averaged CT intensities are not established to be calibrated Hounsfield units. The MRI-overlapping CT values match the prior composite-warp result to numerical precision. The CT has larger coverage than the MRI.

The demo loads this CT as an aligned image, visible as a slice overlay and selectable in the CT surface editor. Finalizing a planning surface is still explicit.
