#!/usr/bin/env python3
"""Retain the MEBRAINS skull on an expanded NMT lattice using original RheMAP components.

Requires the previously prepared MEBRAINS-to-NMT bundle, nibabel, numpy, scipy and ANTs.
The bundle contains the source CT with verified RheMAP geometry and the cropped CT.
Missing published transform components are downloaded from RheMAP. No voxel filling,
deformation extrapolation, or new registration is performed.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import nibabel as nib
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('bundle', type=Path)
parser.add_argument('--ants', default='antsApplyTransforms')
parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'datasets/demo_viewer/nmt2sym')
args = parser.parse_args()
bundle = args.bundle.resolve()
output = args.output.resolve()
name = 'tpl-NMT2Sym_res-05_desc-MEBRAINS_CT.nii.gz'
affine_name = 'NMTv2.0-0.5mm-sym_to_MEBRAINS_affine_0GenericAffine.mat'
warp_name = 'NMTv2.0-0.5mm-sym_to_MEBRAINS_1InverseWarp.nii.gz'
urls = {
    affine_name: 'https://gin.g-node.org/ChrisKlink/RheMAP/raw/master/warps/linear/' + affine_name,
    warp_name: 'https://gin.g-node.org/ChrisKlink/RheMAP/raw/master/warps/nonlinear/' + warp_name,
}
for filename, url in urls.items():
    target = bundle / 'transforms' / filename
    if not target.exists():
        urllib.request.urlretrieve(url, target)
affine = bundle / 'transforms' / affine_name
warp = bundle / 'transforms' / warp_name
reference_path = bundle / 'reference/tpl-NMT2Sym_res-05_T1w.nii.gz'
source = bundle / 'source/MEBRAINS_CT_RheMAP-geometry.nii.gz'
original = nib.load(bundle / 'derived' / name)
reference = nib.load(reference_path)
assert original.shape == reference.shape and np.allclose(original.affine, reference.affine)
# Twenty extra 0.5-mm voxels on every side, keeping MRI voxel centers exactly aligned.
padding = 20
shape = tuple(np.array(reference.shape) + 2 * padding)
grid_affine = reference.affine.copy()
grid_affine[:3, 3] = nib.affines.apply_affine(reference.affine, [-padding] * 3)
chain = ['-t', f'[{affine},1]', '-t', str(warp)]
with tempfile.TemporaryDirectory(prefix='brainana-ct-coverage-') as directory:
    stage = Path(directory)
    grid = nib.Nifti1Image(np.zeros(shape, np.uint8), grid_affine)
    grid.header.set_xyzt_units('mm')
    nib.save(grid, stage / 'grid.nii.gz')
    command = [args.ants, '-d', '3', '-i', str(source), '-r', str(stage / 'grid.nii.gz'), '-n', 'Linear', '-o', str(stage / name), *chain]
    subprocess.run(command, check=True)
    composite_command = [args.ants, '-d', '3', '-r', str(stage / 'grid.nii.gz'), '-o', f'[{stage / "composite.nii.gz"},1]', *chain]
    subprocess.run(composite_command, check=True)
    ct = nib.load(stage / name)
    values = ct.get_fdata()
    overlap = values[padding:-padding, padding:-padding, padding:-padding]
    difference = float(np.max(np.abs(overlap - original.get_fdata())))
    if difference > 1e-5:
        raise RuntimeError(f'Transform components do not reproduce the published composite: {difference}')
    displacement = nib.load(stage / 'composite.nii.gz').get_fdata(dtype=np.float32)[..., 0, :] * [-1, -1, 1]
    jacobian = np.empty((*shape, 3, 3), np.float32)
    for i in range(3):
        for j in range(3):
            jacobian[..., i, j] = np.gradient(displacement[..., i], .5, axis=j) + (i == j)
    determinant = np.linalg.det(jacobian)
    if not np.isfinite(values).all() or np.any(determinant <= 0):
        raise RuntimeError('Invalid intensities or folded registration in the expanded CT')
    bone = values >= 226
    face_contacts = [int(np.take(bone, side, axis=axis).sum()) for axis in range(3) for side in (0, -1)]
    if any(face_contacts):
        raise RuntimeError(f'Expanded image still truncates thresholded skull: {face_contacts}')
    output.mkdir(parents=True, exist_ok=True)
    # Retain the ANTs output precision and its physical-space header unchanged.
    shutil.copyfile(stage / name, output / name)

sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
metadata = json.loads((bundle / 'provenance.json').read_text())
metadata['source_urls'].update({'inverse_affine': urls[affine_name], 'inverse_deformation': urls[warp_name]})
metadata['metrics'].update({
    'output_shape': shape, 'output_spacing_mm': [.5] * 3, 'output_affine_ras': grid_affine.tolist(),
    'output_CT_range': [float(values.min()), float(values.max())],
    'overlap_with_original_CT_max_absolute_difference': difference,
    'expanded_jacobian_determinant_min': float(determinant.min()),
    'expanded_jacobian_determinant_max': float(determinant.max()),
    'expanded_nonpositive_jacobians': int(np.count_nonzero(determinant <= 0)),
    'expanded_bone_contacts_at_image_faces_threshold_226': face_contacts,
})
metadata['coverage'] = {
    'padding_voxels_each_side': padding,
    'method': 'Original RheMAP inverse affine and inverse deformation components, in the published inverse-chain order. The precomposed MEBRAINS-to-NMT field was restricted to the MRI field of view; the original components retain the skull outside it.',
    'deformation_extrapolated': False, 'holes_filled': False,
    'original_mri_shape': reference.shape, 'original_mri_affine_ras': reference.affine.tolist(),
}
for path in [affine, warp]:
    metadata['files'][str(path.relative_to(bundle))] = {'bytes': path.stat().st_size, 'sha256': sha(path)}
metadata['files']['derived/' + name] = {'bytes': (output / name).stat().st_size, 'sha256': sha(output / name)}
metadata.pop('commands', None)
metadata['reproduction'] = 'scripts/expand-demo-ct.py <MEBRAINS-to-NMT-bundle> --ants <antsApplyTransforms>'
metadata['limitations'] = [entry for entry in metadata['limitations'] if 'outside that field is cropped' not in entry]
metadata['description'] = 'MEBRAINS population CT estimate in NMT2Sym coordinates with expanded skull coverage. Original RheMAP registration components preserve the crown without filling bone or extrapolating a displacement field. Brain registration does not independently validate skull anatomy; intensities are not calibrated Hounsfield units.'
(output / name.replace('.nii.gz', '.json')).write_text(json.dumps(metadata, indent=2, default=lambda item: int(item)) + '\n')
sources_path = output / 'sources.json'
if sources_path.exists():
    sources = json.loads(sources_path.read_text())
    for entry in sources:
        if entry['file'] == name:
            entry['sha256'] = sha(output / name)
            entry['transform_components'] = list(urls.values())
    sources_path.write_text(json.dumps(sources, indent=2) + '\n')
print(json.dumps(metadata['metrics'], indent=2, default=lambda item: int(item)))
