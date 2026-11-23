import {calibrationReport,calibrationRows} from './calibrationExport.ts'
import {measurementRows} from './measurementExport.ts'
import {electrodeAssembly} from '@brainana/planning-core/electrode-frame.ts'
import type { Project } from '@brainana/planning-core/model.ts'
import { clearance, settings, softConflicts } from '@brainana/planning-core/optimization.ts'
import { trajectory, electrodePaths, sub, dot, gridHoles, holeLocal, localToWorld } from '@brainana/planning-core/geometry.ts'
const csv = (v: unknown): string => `"${String(v).replace(/"/g, '""')}"`
export function coordinateRows(project: Project): Array<Array<string | number>> {
  const ref = project.assets.find((a) => a.id === project.frame.referenceAssetId)!
  const rows: Array<Array<string | number>> = [
    [
      'kind',
      'name',
      'frame_id',
      'R_mm',
      'A_mm',
      'S_mm',
      'grid_x',
      'grid_y',
      'depth_from_grid_mm',
      'reference_image',
      'reference_sha256',
      'subject',
      'scan',
      'region_radius_mm',
    ],
  ]
  const identity = [ref.name, ref.sha256, project.provenance.subject ?? '', project.provenance.scan ?? '', '']
  for(const post of project.headposts??[])rows.push(['headpost_base',post.name,post.frameId,...post.pose.origin,'','','',...identity])
  for (const mark of project.landmarks ?? []) rows.push(['landmark', mark.name, mark.frameId, ...mark.point, '', '', '', ...identity])
  for (const t of project.targets)
    {rows.push(['target', t.name, t.frameId, ...t.point, '', '', '', ...identity.slice(0,4),t.region?.kind==='sphere'?t.region.radiusMm:'']);if(t.region?.kind==='voxels')for(const center of t.region.centers)rows.push(['valid_target_voxel_center',t.name,t.frameId,...center,'','','',...identity])}
  for (const r of project.avoidRegions ?? []) {
    rows.push([
      r.points ? 'avoidance_brush_origin' : 'avoidance_region',
      r.name,
      r.frameId,
      ...r.center,
      '',
      '',
      '',
      ...identity.slice(0, 4),
      r.radius,
    ])
    r.points?.forEach((point, i) =>
      rows.push([
        'avoidance_brush_point',
        `${r.name} point ${i + 1}`,
        r.frameId,
        ...point,
        '',
        '',
        '',
        ...identity.slice(0, 4),
        r.radius,
      ]),
    )
    r.stamps?.forEach((point,i)=>rows.push(['avoidance_fill_stamp',`${r.name} stamp ${i+1}`,r.frameId,...point,'','','',...identity.slice(0,4),r.radius]))
  }
  for (const c of project.chambers)
    if(c.placementState!=='unplaced')rows.push(['chamber_origin', c.name, c.frameId, ...c.pose.origin, '', '', '', ...identity])
  for(const g of project.grids){
    const c=project.chambers.find(c=>c.id===g.chamberId)!
    if(c.placementState!=='unplaced'&&g.enabled!==false)for(const hole of gridHoles(c,g))rows.push(['grid_hole',`${c.name} grid ${g.id}`,c.frameId,...localToWorld(c.pose,holeLocal(g,hole,c)),...hole,0,...identity])
  }
  for (const e of project.electrodes) {
    const {grid:g,chamber:c} = electrodeAssembly(project,e)!
    if(e.connector&&!e.connector.unplaced)rows.push(['connector_base',e.name,c.frameId,...e.connector.pose.origin,'','','',...identity])
    if(e.direct?.unplaced||c.placementState==='unplaced')continue
    const t=trajectory(c,g,e)
    if(e.direct?.preferredEntry)rows.push(['skull_entry',e.name,c.frameId,...e.direct.preferredEntry,'','','',...identity])
    rows.push(['electrode_entry', e.name, c.frameId, ...t.entry, ...e.hole, 0, ...identity])
    rows.push(['electrode_tip', e.name, c.frameId, ...t.tip, ...e.hole, e.depth, ...identity])
    electrodePaths(c, g, e).forEach((path, shaft) => {
      if (e.hardware) {
        rows.push([
          'shaft_entry',
          `${e.name} shaft ${shaft + 1}`,
          c.frameId,
          ...path.entry,
          ...e.hole,
          0,
          ...identity,
        ])
        rows.push([
          'shaft_tip',
          `${e.name} shaft ${shaft + 1}`,
          c.frameId,
          ...path.tip,
          ...e.hole,
          Math.hypot(...sub(path.tip, path.entry)),
          ...identity,
        ])
      }
      path.contacts.forEach((point, i) =>
        rows.push([
          'contact',
          e.hardware ? `${e.name} shaft ${shaft + 1} site ${i + 1}` : `${e.name} contact ${i + 1}`,
          c.frameId,
          ...point,
          ...e.hole,
          dot(sub(point, path.entry), path.direction),
          ...identity,
        ]),
      )
    })
  }
  if(project.measurements?.length){
    const measurements=measurementRows(project),baseWidth=rows[0].length
    rows[0].push(...measurements[0].map(name=>'measurement_'+name))
    for(const row of rows.slice(1))while(row.length<rows[0].length)row.push('')
    for(const row of measurements.slice(1))rows.push(['measurement',String(row[1]),project.frame.id,...Array(baseWidth-3).fill(''),...row])
  }
  if(project.frameCalibration||project.stereotax?.arms.some(a=>a.toolCalibration)){
    const data=calibrationRows(project),base=rows[0].length
    rows[0].push(...data[0].map(name=>'calibration_'+name))
    for(const row of rows.slice(1))row.push(...Array(data[0].length).fill(''))
    for(const row of data.slice(1))rows.push(['calibration',String(row[1]),project.frame.id,...Array(base-3).fill(''),...row])
  }
  return rows
}
export function coordinateCsv(project: Project): string {
  return coordinateRows(project)
    .map((row) => row.map(csv).join(','))
    .join('\r\n')
}
const escape = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function planReport(project: Project, screenshot: string | null): string {
  const rows = coordinateRows(project),
    json = JSON.stringify(project, null, 2).replace(/</g, '\\u003c')
  const checks = project.electrodes
    .map((e) => {
      const {grid:g,chamber:c} = electrodeAssembly(project,e)!
      if(e.direct?.unplaced||c.placementState==='unplaced')return `${escape(e.name)}: not placed; no clearance evaluated`
      const value = clearance(project, c, g, e),soft=softConflicts(project,c,g,e,!e.direct&&settings(project).mode==='new')
      return `${escape(e.name)}: ${Number.isFinite(value) ? `${value.toFixed(2)} mm shaft clearance (${value < settings(project).margin - 1e-8 ? 'below margin' : 'meets margin'})` : 'no hard avoidance regions marked'}${soft.length?`; soft preferences not met: ${soft.map(r=>`${escape(r.name)} (${r.clearance.toFixed(2)} mm)`).join(', ')}`:''}`
    })
    .join('<br>')
  const measurementData=measurementRows(project)
  const measurementHtml=project.measurements?.length?`<h2>Saved measurements</h2><p>Offsets are To minus From, in the named reference axes. All distances are millimetres.</p><table><thead><tr>${['Name','From','To','Axes','Distance (mm)','X offset (mm)','Y offset (mm)','Z offset (mm)','Status'].map(s=>`<th>${escape(s)}</th>`).join('')}</tr></thead><tbody>${measurementData.slice(1).map(row=>`<tr>${[1,2,3,10,14,15,16,17,18].map(i=>`<td>${escape(row[i])}</td>`).join('')}</tr>`).join('')}</tbody></table>`:''
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(project.name)}</title><style>body{font:15px system-ui;color:#25211a;max-width:1200px;margin:40px auto;padding:24px}h1{font-size:28px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border:1px solid #ddd;padding:8px;text-align:left;overflow-wrap:anywhere}img{max-width:100%;background:#15120d}code{overflow-wrap:anywhere}details{margin-top:24px}</style><h1>${escape(project.name)}</h1><p>Brainana Planner · ${escape(project.updatedAt)} · RAS millimetres</p><p>Image-based placement plan. Avoidance checks use the marked regions and electrode width. A finalized planning surface is used for chamber support checks when available. Unmarked tissue and collisions between electrodes are not assessed. Electrode depth starts at the selected guide-hole entry, the chamber top without a grid, or the electrode reference point for direct placement.</p><p>Planning mode: ${escape(settings(project).mode)} · Avoidance margin: ${settings(project).margin} mm</p><p>${checks}</p>${measurementHtml}${calibrationReport(project)}${screenshot ? `<img alt="Planning scene" src="${escape(screenshot)}">` : ''}<table><thead><tr>${rows[0]
    .slice(0, 9)
    .map((c) => `<th>${escape(c)}</th>`)
    .join('')}</tr></thead><tbody>${rows
    .slice(1)
    .filter(row=>row[0]!=='measurement'&&row[0]!=='calibration')
    .map(
      (row) =>
        `<tr>${row
          .slice(0, 9)
          .map((c) => `<td>${escape(c)}</td>`)
          .join('')}</tr>`,
    )
    .join(
      '',
    )}</tbody></table><details><summary>Full project geometry and provenance</summary><pre>${escape(JSON.stringify(project, null, 2))}</pre></details><script type="application/json" id="brainana-plan-data">${json}</script></html>`
}
