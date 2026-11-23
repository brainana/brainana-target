# MRI boundary reconstruction — BrainanaTarget 0.1.56

## Using it

Open Planning surface → Open surface editor and choose either MRI dark-band method. A supplied brain mask remains optional for the direct MRI method.

The new **Reconstruct and display boundary** section provides:

- **Bridge gaps along surface**, enabled by default when preparing an MRI dark-band estimate.
- **Maximum gap span**, initially 8 mm. This limits the whole patch, including its attachment edge. Increase it to consider larger missing sections; decrease it to keep reconstruction local.
- **Reconstruction smoothness**, initially 0.5. Higher values give more weight to the fitted surrounding curve; lower values let the patch follow local variations more closely.
- **Show boundary voxels in slices**, initially enabled, with an opacity slider.
- **Highlight reconstructed areas**. Cyan slice voxels show detected boundary; amber slice voxels and amber preview patches show inferred boundary.

Use Erase to keep a known opening or unwanted patch open. Add back reverses an erasure, subject to the reconstruction controls. Crop edges and missing regions touching protected cuts are not bridged. Large, unresolved gaps remain visible.

Finalize saves both the surface STL and an aligned `MRI-boundary-voxels.nii.gz` overlay in the project. This overlay appears in the main anatomy views and can be turned off or adjusted in Image layers. Its values are 0 = background, 1 = detected boundary, 2 = reconstructed boundary. The fill is a thin layer of voxels intersected by the estimated surface, not the brain interior or a measurement of skull thickness. The source MRI is unchanged. Reopening the surface editor restores the saved reconstruction settings.

## Implementation

`radialCompletion.ts` performs a bounded surface reconstruction before triangulation. It retains reliable detected radii, filters isolated large deviations, groups missing samples across the longitude seam and poles, fits a robust local quadratic radius field, and solves a constrained residual field against surrounding observations. Physical patch-size checks use nearby boundary distances and the final patch's three-dimensional extent. Previously inferred patches never serve as observations for subsequent patches.

Crop-truncated samples and manually erased detected samples are protected. Proposed inferred points are also checked against the crop and brush history. Observed and reconstructed face classifications remain aligned after mesh smoothing and transfer to the preview.

`boundaryVoxels.ts` conservatively intersects triangles with native-image voxels using separating-axis tests. It preserves anisotropic/oblique affines, crops the output label image without changing its world position, and encodes a NIfTI with separate detected/reconstructed labels. Reconstruction, rasterization and compression run in the existing cancellable MRI worker. Slice image/overlay caches avoid repeating rasterization on pointer hover or brush preview updates.

`mriBoundaryAssets.ts` assembles the mesh, voxel file, input-mask link and saved recipe as one project update. Re-finalizing replaces the previous derived pair rather than adding duplicates. Removing an input image also removes its derived pair; removing only the voxel overlay clears its optional recipe link.

CT preparation is unchanged. Legacy MRI surfaces remain intact until the user finalizes a new draft.

## Validation

- Analytic curved surfaces with bounded gaps, seam/pole cases, unchanged detected samples, isolated spikes, gap limits and protected cuts.
- Direct MRI and brain-guided reconstruction, near-side placement support, erasures and crop boundaries.
- Thin-shell voxel labels, empty interior, oblique/anisotropic alignment, NIfTI reload, worker output parity and reconstructed-label transfer.
- Atomic derived-asset replacement, checksummed project save/reopen and invalid recipe rejection.
- Editor defaults, voxel visibility/opacity without recomputation, invalidation after geometry-setting changes, and finalization payload.
- All 18 core and 30 workflow script groups, TypeScript/production build and lint passed. The available native 0.5 mm MRI was also used to exercise the reconstruction.
- Bundled desktop assets, ad-hoc signature and archive integrity checked. A native interactive UI check could not be completed in this environment; automated UI checks use mocked DOM/GPU surfaces.
