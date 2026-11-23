/** Shared explanations for controls created by any panel, including floating windows. */
const help:Record<string,string>={
 'measure from':'Choose the starting reference. Object-linked references follow that object when it moves; a crosshair snapshot keeps its captured image position.',
 'measure to':'Choose the ending reference. Distance is the straight 3D separation, and signed offsets are To minus From in the selected axes.',
 'measurement axes':'Choose the directions used to break the distance into signed components. Rotating the axes changes the components while preserving the straight-line distance.',
 'use crosshair for from':'Capture the current slice crosshair as a fixed starting point. Later crosshair movements do not move the saved point.',
 'use crosshair for to':'Capture the current slice crosshair as a fixed ending point. Later crosshair movements do not move the saved point.',
 'swap from and to':'Reverse the endpoints. Straight-line distance stays the same; the signs of the offsets reverse.',
 'save measurement':'Keep these linked references, axes, name and ruler color in the project. The result updates when the referenced objects move.',
 'add named point at crosshair':'Save this image position as a named reference point. You can later edit it, move it to the crosshair, or use it in several measurements.',
 'calculate alignment':'Fit a rigid image-to-frame transform using the enabled Fit pairs only. Independent check points do not influence this calculation. Nothing moves until Apply alignment.',
 'apply alignment':'Save the calculated alignment and align the modeled frame without moving the anatomy. Recalculation is required if the inputs or frame setup changed.',
 'capture crosshair':'Capture the current image crosshair as this fiducial location. Enter the measured instrument coordinates for that same physical point.',
 'record tool and readings':'Record the working-tip offset and the instrument readings at this modeled slide position. This defines a readout zero without moving the arm.',
 'export calibration csv':'Export paired fiducials, independent checks, calibrated target coordinates and tool readings. Stale calibrated frame coordinates are left blank.',
 'export measurements csv':'Export all saved measurements with endpoint coordinates, signed offsets, reference axes, availability status and source-image identity. Hidden rulers are included.',
 'save project with measurements':'Download a portable project containing the reference images, planned objects, named points, measurements and applied calibration. Frame previews must be applied separately.',
 'valid target geometry':'Point uses the allowed point-target miss. A spherical or voxel target accepts any reachable tip inside that defined region; display falloff never changes the valid region. Voxel selection follows the reference image lattice.',
 'valid target radius (mm)':'Physical radius of acceptable tip locations around this target point. The point-target miss tolerance is not added to this radius.',
 'clear comparison paths':'Hide all additional comparison trajectories for this electrode. Its applied position, hole and insertion depth are kept.',
 'anatomy view mode':'Choose three slices in a grid, row or column, one enlarged anatomical plane, or an electrode-aligned view after placement. MRI/CT blends and atlases are retained in all anatomical layouts. Point at the anatomy view and use keyboard arrow keys to pan; zoom stays anchored at the crosshair.',
 'paint target voxels in slices':'Click or drag in anatomical slices to add valid voxels from the reference image. Draw on several slices for a 3D region. Zoom in to select individual voxels. Stop painting to resume crosshair clicking.',
 'erase target voxels in slices':'Click or drag to remove selected reference voxels. At least one voxel is retained; Clear voxel region returns the target to a single point.',

 'fit grid inside chamber':'Move the grid base so the highest edge is flush with the chamber top. A grid taller than the shortest chamber wall still needs a smaller tilt/thickness or a taller chamber. This changes guide-hole entry heights and may require recomputing placement.',
 'prefer placement with':'Rank fits at the clicked skull location by smallest grid tilt, closest chamber axis to image superior, or closest axis to the local skull normal. Hard constraints and soft avoidance preferences are considered first. This ranks tested fits; it is not a guarantee of a global optimum.',
 'chamber mounting method':'Custom: fit variable wall lengths. Cut: shorten the rim of a fixed-height cylinder. Pedestal / acrylic: preserve the cylinder and estimate an added annular support beneath it. Applied rim dimensions and support meshes are included in export.',
 'save headpost':'Save the headpost geometry, position, angles and avoidance setting in this project. Custom dimensions represent a simple post and circular baseplate; an imported STL retains its shape.',
 'import headpost stl…':'Import a headpost model already aligned to the image RAS millimetre frame. Additional position and rotation fields start at zero. The model is saved with the project and included in mesh exports.',
 'choose headpost location on skull':'Click the planning surface in 3D to set a draft headpost base and align its axis with the local surface normal. Check the fit and press Save headpost. The app does not automatically bend the baseplate.',
 'headposts':'Define planned or existing head fixation hardware, import aligned models, and include conservative occupied-space envelopes in later placement checks.',

 'save project':'Save a portable .brainana-plan file with your images, surfaces, targets, hardware and applied placements. It also contains coordinate and dimension tables. Unapplied placement previews are not saved. Use Export dimensions and STL meshes for separate 3D model files.',
 'save portable project':'Save the images and editable plan in a portable .brainana-plan file. Unapplied previews are excluded. Coordinate and dimension tables are included inside the file.',
 'export dimensions and stl meshes':'Download a ZIP with coordinate and dimension tables plus STL models of headposts, chambers, fitted mounts, drilled grids, finalized planning surfaces, guide tubes, targets and electrode references. The README lists units and any grid that could not be exported. Exports use the applied plan, excluding unapplied previews. Models use millimetres; manufacturing tolerances are not added.',
 'export coordinate table':'Download a CSV table of target positions, chamber reference positions, guide-hole entries, electrode tips and recording contacts, plus marked-region coordinates. Positions use the project image coordinate system in millimetres.',
 'export html report':'Download a readable report with the current 3D view, coordinates, clearance information and project details. It describes the saved plan, not an unapplied placement preview.',
 'open project':'Open a saved .brainana-plan project, including its images and editable geometry. This replaces the current workspace; save your current work first if you want to keep it.',
 'reset view':'Restore panel sizes, camera framing, zoom and cutaway settings. Images, hardware definitions and the placement plan are kept.',
 'reset workspace':'Clear loaded images, targets, hardware, placements, open tools and undo history to start over. Original files and previously saved project files are kept. You will be asked to confirm.',
 'settings':'Open appearance, text size, help, color and autosave preferences. View settings do not change hardware dimensions or placement constraints.',
 'guided tutorial':'Open or resume the guided planning steps. The guide follows the data and hardware already in this project.',
 'undo':'Step back through the most recent project edit, such as a target, drawing, hardware change or applied placement. This is separate from Back in the tutorial.',
 'redo':'Restore the most recently undone project edit. A new edit starts a new history branch.',
 'compute placement candidates':'Search for chamber and electrode placements that reach the selected target and meet hardware, surface and Hard avoidance requirements. Results are previews until you apply one. Soft preferences rank results and may remain unmet.',
 'choose skull location to fit':'Activate one-click fitting, then click bone in the 3D skull view—even where the automatic map is blank. The app tests chamber angles and lower-edge shapes at that point, plus alternative grid angles up to your chosen limit. Review and apply a result to keep it.',
 'click skull in 3d · cancel selection':'Click a skull location in 3D to test it, or click this button again to leave location-selection mode. Dragging still rotates the view.',
 'place chamber here':'Apply the displayed preview to the project. The chamber position, fitted lower edge, grid design and electrode insertion are checked again before saving the placement.',
 'apply electrode trajectory':'Apply the previewed guide hole and insertion depth through the fixed chamber. The chamber stays at its measured position.',
 'cancel preview':'Discard the displayed placement preview and return to the applied plan. Hardware definitions and saved placements are kept.',
 'open surface editor':'Open CT skull settings beside slice views and a rotatable 3D preview. Changes are drafts until you select Finalize surface.',
 'finalize surface':'Save the current surface and reviewed opening markers, use it for placement calculations, and close the editor. The original CT image is unchanged.',
 'stop using surface for placement':'Stop using the finalized surface in placement calculations without deleting it. New chamber placement will need another planning surface.',
 'select skull at crosshair':'First click a bright part of skull bone in a CT slice. This button chooses the connected piece of bone containing that point, helping exclude the scanner bed or unrelated objects.',
 'set inner reference from crosshair':'First click inside the skull, away from bone, in a CT slice. This point helps find the outer skull boundary. It is not an electrode target.',
 'reset automatic skull selection':'Forget the manually chosen skull point and inside reference point. Return to automatic skull selection and update the preview.',
 'reset crop':'Restore the full CT image area. Adjust crop sliders to remove the scanner bed or other unwanted parts again if needed.',
 'detect candidates':'Find possible skull openings using the current size limits and optional upper-half filter. This replaces earlier automatic detections but keeps manual markers. Review the results; detection cannot identify which holes were made by screws.',
 'draw avoidance regions':'Enable drawing on image slices. Drag to paint a strip, or choose Outline and fill to mark an enclosed area. Your selected drawing geometry determines whether the mark is a tissue volume or a surface-only patch.',
 'finish drawing regions':'Leave drawing mode so normal slice navigation resumes. Completed strokes are already saved as project edits.',
 'update avoidance surfaces':'Refresh the displayed avoidance geometry from the saved drawing strokes. This does not add a second region or change the original images.',
 'paint surface region near crosshair':'Mark the finalized planning surface near the current crosshair using the brush radius. This creates one named surface-only avoidance region. Progress appears in the bottom-right status area.',
 'mark volume region at crosshair':'Add one spherical avoidance region centred on the current crosshair, using the brush radius. Choose its avoidance priority in the region details.',
 'add target at crosshair':'Create a target at the current slice crosshair. Its exact image coordinates are saved, along with the atlas region name if available. Rename it below.',
 'remove region':'Delete this drawn avoidance region from the project and placement selection. Undo can restore it.',
 'locate region':'Move the image crosshair to this region’s saved reference point without changing the region.',
 'define chamber':'Enter the chamber name, inner opening, wall thickness, height and optional guide-grid dimensions. Defining hardware does not place it on the skull.',
 'save specifications':'Save the chamber and grid dimensions from this editor. Position is chosen separately in the Position tab.',
 'configure electrode hardware':'Open the electrode configuration window to choose a device family, enter its physical dimensions, and inspect the live preview. Changes are drafts until applied.',
 'apply electrode configuration':'Save all electrode dimensions and hardware options from this window. This can change reach and clearance, so recompute placement after a hardware change.',
 'cancel configuration':'Close this editor and discard its unapplied changes. The previously defined device stays in the project.',
 'use these device specifications':'Confirm the required device choices above and show the remaining fields and live preview. This does not yet apply the configuration to the project.',
 'fit hole and depth':'Choose a guide hole and insertion depth that bring this electrode as close as possible to the named target. Other hardware and avoidance checks may prevent a fit.',
 'use these measurements for placement':'Use the entered chamber position and angles as its measured placement. Use this for a known or implanted chamber rather than an automatic search result.',
 'focus brain':'Centre and fit the anatomy in the 3D view without zooming out to include long electrodes. Hardware geometry is unchanged.',
 'fit all':'Fit the complete 3D scene, including the full electrode lengths, into the view. Use Focus brain to return to anatomy framing.',
 'fit':'Fit this panel’s image or model into its available space. Other panels and the plan are unchanged.',
 'top':'View the 3D scene from above the head. This changes only the camera.',
 'front':'View the 3D scene from the front of the head. This changes only the camera.',
 'side':'View the 3D scene from the side of the head. This changes only the camera.',
 'scene':'Open additional 3D visibility and display settings. Showing or hiding a region does not change whether placement calculations use it.',
 'cut':'Open separate 3D cross-section controls. Choose a cardinal cut direction, position and which parts are clipped.',
 'overlays':'Choose which additional images, functional maps and atlas regions are shown over the main image, and adjust their transparency.',
 'display':'Open detailed brightness, contrast, color and blending controls for the selected image. The original image data is unchanged.',
 'show all':'Show every region in the selected atlas, including regions outside the current search results. This changes the overlay display only.',
 'hide all':'Hide all regions in the selected atlas without unloading it or deleting any targets.',
 'invert':'Show hidden atlas regions and hide visible ones. This does not change targets or avoidance settings.',
 'show controls':'Bring the tutorial’s current controls into view. This does not change your data or undo project edits.',
 'hide tutorial':'Hide the guide while keeping your place. Guided tutorial resumes it later.',
 'restart tutorial':'Start the guide again from the beginning. Existing images, hardware and placements are kept.',
 'next step':'Continue to the next tutorial step when its requirements are met. This does not apply an unapplied placement or hardware draft.',
 'back':'Review the previous tutorial step. This does not undo project edits; use Undo for that.',
 'hardware preset':'Choose a device family or manufactured variant as a starting point. Selecting another preset replaces the unsaved draft dimensions. Confirm your actual ordered device before applying.',
 'channel count':'Choose the number of recording channels supported by the selected device. A channel is a recording input; it is not always the same as a physical shaft or the total number of contacts.',
 'sites per shaft':'Number of recording contacts along each electrode shaft. Together with contact spacing and the tip offset, this determines the length of the recording area.',
 'site arrangement':'Choose how recording contacts are grouped on this device, such as single contacts, pairs or groups of four. Available configurations follow the selected family.',
 'contacts':'Show or hide the recording-contact markers. Their physical positions still appear in placement geometry and exports.',
 'usable shaft length (mm)':'Length available from the electrode entry point to its tip. Cable, connector and shaft held above the entry do not add usable reach.',
 'shaft diameter (µm)':'The shaft width, in micrometres. Fit and avoidance calculations include the shaft’s thickness. Enter the widest relevant diameter for a tapered shaft.',
 'contact spacing (mm)':'Distance between neighbouring recording-contact centres along a shaft. More contacts or greater spacing require a longer recording area.',
 'tip offset (mm)':'Distance from the electrode tip back to the first recording-contact centre. It determines where recording starts relative to the tip.',
 'length mode':'Choose one common length, a generated length arrangement, or individual lengths. Editing a single electrode switches to Individual while preserving the others.',
 'bore / inner diameter (mm)':'Width of the clear opening inside the chamber. The outside diameter is this value plus twice the wall thickness.',
 'wall thickness (mm)':'Thickness of each chamber wall. This adds to the outside diameter on both sides and affects how much mounting area is needed.',
 'chamber height (mm)':'Distance from the chamber top to its nominal lower edge. A taller chamber uses more electrode reach. Fitting the bottom to the skull can give different wall lengths around the rim.',
 'grid tilt relative to chamber (°)':'Angle of the guide channels relative to the chamber. All channels remain parallel. A nonzero tilt represents an angled physical grid, not bending an electrode.',
 'grid tilt direction around chamber (°)':'Which way the guide channels lean around the chamber. Changing direction rotates the wedge around the chamber without changing the amount of tilt.',
 'hole pattern rotation (°)':'Rotate the arrangement of guide holes on the grid face. This changes hole positions but does not change their tilt direction.',
 'grid base height above chamber top (mm)':'Height of the grid’s flat bottom relative to the chamber top. Positive values raise it; negative values lower it into the chamber.',
 'grid thin-edge thickness (mm)':'Thickness at the thin side of a wedge-shaped grid. Tilt and chamber diameter determine the thickness at the opposite edge.',
 'guide-hole diameter (mm)':'Clear diameter of each guide channel. The electrode or guide tube must fit through it and still clear the chamber wall.',
 'maximum alternative grid tilt (°)':'Largest new grid-channel tilt to test during click-to-fit. Set 0 to keep your defined grid angle. Allowing a nonzero limit can propose a different physical grid design.',
 'allowed target miss (mm)':'Largest permitted distance between the selected electrode tip and the target. This does not enlarge the target or remove avoidance requirements.',
 'avoidance margin (mm)':'Extra space required around marked areas to avoid, in addition to the electrode or guide tube radius.',
 'search step (mm)':'Spacing used when sampling possible placements. Smaller values test more locations and may fill map gaps, but take longer. The search cannot prove every possible location has been checked.',
 'brush radius (mm)':'Half the brush width. In volume mode it sets the radius of the tissue mark. In surface mode it sets the width of the painted surface patch.',
 'drawing geometry':'Choose whether to mark a 3D tissue volume or paint only the finalized planning surface. Surface mode requires an active planning surface.',
 'drawing tool':'Paint a strip along your drag, or draw a closed outline and fill the area inside it.',
 'placement priority':'Hard rejects placements that cross this region. Soft favors avoiding it but allows a reported conflict if needed. Ignore leaves it out of the calculation. Hiding it in 3D is separate.',
 'select avoidance areas':'Choose which drawn regions participate in this placement search. Command-click on Mac or Ctrl-click on Windows selects several. Skull openings have separate priorities.',
 'a · automatic':'Search the skull for supported chamber locations and electrode paths that meet your target, hardware and avoidance settings.',
 'b · manual':'Click your preferred skull location in 3D. Fit chamber angles and an optional angled grid there, then review target reach and named avoidance conflicts.',
 '3d display…':'Open visibility and opacity controls beside the 3D viewer. These display changes do not change placement constraints.',
 'estimate surface from':'MRI only methods work without a mask. Brain-region methods appear after loading or estimating a brain region. Whole-head erosion requires a whole-head mask. Review the cyan boundary in the slices.',
 'head tissue brightness cutoff':'Lowest brightness counted as head tissue. For the MRI-only dark-band method, set it above the dark-band maximum brightness so scalp is separated from the dark band.',
 'brain tissue brightness cutoff':'Lowest brightness included in the connected region around your selected brain point. Review its outline: tissues touching the brain can be included. This is a starting estimate, not automatic skull stripping.',
 'estimate brain region from mri':'Use the current crosshair as a starting point and keep connected tissue brighter than an adjustable cutoff. Review the region before using it to guide a surface estimate.',
 'load brain mask…':'Load an already aligned brain-only mask. Its outline can be reviewed before it guides the dark-band or outward-expansion methods.',
 'search depth beneath outer scalp (mm)':'Maximum depth to inspect inward from the outside of the scalp. This includes the bright scalp and the dark band; it is not a measured skull thickness.',
 'load aligned brain mask…':'Load a brain-only mask already aligned to this MRI. It anchors the inside of the skull search; a whole-head mask is not suitable for this method.',
 'dark band maximum brightness':'Highest MRI signal treated as dark between brain and scalp. Raise it to include brighter parts of the band. Check that the cyan boundary stays beneath scalp and outside brain.',
 'search outward from brain (mm)':'Maximum distance inspected beyond the brain mask, including dark band and scalp. Increasing it expands the search but may include other bright structures.',
 'minimum dark-band width (mm)':'Reject dark intervals narrower than this physical distance, helping reject isolated dark pixels or noise. This does not measure skull thickness.',
 'maximum dark-band width (mm)':'Reject unusually wide dark intervals. The outward search distance also limits the search; these bounds help avoid unrelated air spaces.',
 'minimum bright scalp layer (mm)':'Require a bright layer of at least this width outside the dark interval. This helps reject small bright structures inside the band.',
 'boundary inset into dark band (mm)':'Zero places the boundary at the scalp-side edge of the detected dark band. A positive inset moves it inward, but cannot move it into the brain or create a missing boundary.',
 'estimate dark cutoff from brain mask':'Set an editable starting cutoff from typical MRI brain signal and background signal. Review the resulting boundary; this is not automatic tissue identification.',
 'set head centre at crosshair':'Use the current MRI crosshair inside the brain mask as the centre of the surface search. Click the brain in a slice first. Automatic centre usually works for a complete brain mask.',
 'use automatic head centre':'Use the centre of the cropped brain-mask region for the dark-band search.',
 'load aligned mri mask…':'Load a 3D brain or whole-head mask already aligned to this MRI in millimetres. Inspect the resulting boundary over all three MRI views.',
 'expand brain region outward (mm)':'Expand the brain mask by this physical distance to estimate the skull boundary. Adjust until its contour matches the intended mounting boundary in MRI slices.',
 'shrink head mask inward (mm)':'Move the outside of a whole-head mask inward by this physical distance. Review the estimated boundary against the dark band beneath the scalp.',
 'inspect blocked fit':'Show the supported local fit and its hard avoidance conflicts without applying or saving it. Move the chosen point or explicitly correct an incorrect avoidance constraint.',
 'smoothing passes':'Number of surface-smoothing passes. Increase this to soften small bumps along the CT bone boundary. Set it to 0 to keep the unsmoothed mesh. Changes are previewed before finalizing.',
 'maximum smoothing movement (mm)':'Maximum distance a vertex may move from the thresholded CT boundary. This distance uses millimetres and is independent of sample spacing. Crop edges stay fixed. Check the cyan outlines before finalizing.',
 'bone threshold':'Lowest CT brightness counted as bone. Raising it removes less-bright areas; lowering it can include more bone and unwanted material. Check the slice outlines and 3D preview before finalizing.',
 'surface detail (sample spacing)':'Distance between samples used to build the skull model. Smaller spacing preserves more detail but takes more time and memory. Choosing finer spacing than the CT cannot add missing image detail.',
 'separate pieces of bone':'Keep only the main connected piece of detected bone, or retain all pieces. Choosing bone at the crosshair overrides automatic selection.',
 'brightness':'Shift the displayed image brightness without changing the source pixels. It affects the selected image; use Overlays to control blending with other images.',
 'contrast':'Change the range of image brightness values shown. Higher contrast makes differences stronger but can hide subtle detail. Source pixels are unchanged.',
 'overlay opacity':'Transparency of this image over the main image. Lower values reveal more of the image underneath. The 3D view has separate opacity controls.',
 'project name':'Name saved in the project metadata and used for the suggested filename. Renaming it does not move or alter images, targets or hardware.',
}
Object.assign(help,{
 'detect candidate openings':help['detect candidates'],
 'show none':help['hide all'],
 'add electrode':'Add another electrode entry for the current chamber. Give it a name and configure its hardware before including it in placement calculations.',
 'add missed opening at crosshair':'Add an opening marker at the crosshair when automatic detection missed a hole. Check the marked size and priority before using it for placement. It does not fill the hole with bone.',
 'aim from current origin':'Keep the chamber top centre at its current coordinates and rotate it to aim the electrode toward the target. This does not search for a different mounting location.',
 'at tip':'Move the across-electrode slice back to the selected electrode tip. The electrode and target stay in place.',
 'atlas explorer':'Open the atlas region list to search, show or hide regions, locate a selected region, or create a target.',
 'open atlas explorer':'Open the atlas region list and display controls. The atlas must already be aligned with the anatomical images.',
 'close atlas explorer':'Close the atlas window. Its selected regions and display settings are kept.',
 'browse folders':'Browse available data folders to choose the dataset you want to load. Browsing does not alter your original files.',
 'find subjects':'List the subjects available in the selected Brainana data source so you can choose a scan session.',
 'cut at crosshair':'Place the 3D cutaway plane through the current image crosshair. Change the cut direction or position in the cutaway controls.',
 'cut at electrode tip':'Place the 3D cutaway plane through the selected electrode tip. This changes the display only.',
 'cut at target':'Place the 3D cutaway plane through the selected target. This changes the display only.',
 'cutaway':'Open controls for hiding part of the anatomy to reveal internal targets and electrode paths. The geometry used for placement is unchanged.',
 'export settings':'Download appearance, help, color and autosave preferences as a settings file. Images, hardware and placement geometry are saved separately with Save project.',
 'import settings':'Load a previously exported settings file to restore appearance, help, color and autosave preferences. This does not load a project.',
 'import viewer bookmarks':'Import saved target locations from Brainana Viewer. The subject, scan and reference image must match this project so coordinates refer to the same anatomy.',
 'inspect':'Open the selected item’s detailed controls or preview without changing its physical position.',
 'locate':'Move the image crosshair to the selected item so you can inspect it in the slice views. It does not move the item.',
 'locate selected region':'Move the image crosshair to the selected atlas region. This does not create a target or change the atlas alignment.',
 'locate target':'Move the image crosshair to the selected target. The target point and placement are unchanged.',
 'manage atlas files':'Open Images to load another aligned atlas or manage the atlases already in this project.',
 'load atlas labels tsv':'Load a tab-separated text file that maps atlas region numbers to names and optional colors. It changes labels, not the atlas image positions.',
 'open electrode to configure hardware':'Open the Electrode tab so you can define the device dimensions required for placement.',
 'open planning surface':help['open surface editor'],
 'set up planning surface':help['open surface editor'],
 'prefer access near crosshair (optional)':'Use the current crosshair as a preferred access location. Valid placements near it rank ahead of more distant ones. This is a preference, not a placed chamber, and Hard requirements still apply.',
 'use automatic access preference':'Remove the manually preferred access location. The app ranks placements using Soft avoidance preferences, then shorter electrode insertion.',
 're-review on current surface':'Confirm this opening marker against the current finalized skull surface so it can be used again for placement. Check its location, size and priority first.',
 'remove image':'Unload this additional image from the project. The original file on disk is kept. The reference image cannot be removed while it defines the project coordinate system.',
 'remove marker':'Delete the selected skull-opening annotation. This does not change skull bone or fill the opening.',
 'reset brush corrections':'Discard the manual removal and restoration strokes for this draft skull model and rebuild it from the current CT settings. The original CT is unchanged.',
 'reset display':'Restore this image’s initial brightness, contrast and color settings. Its position and source image data are kept.',
 'reset draft':'Discard unsaved changes in this editor and return to its saved or starting settings. The original images and applied project geometry are kept.',
 'reset section':'Return the current cutaway or cross-section controls to their starting state. This affects the view, not the electrode placement.',
 'restore default settings':'Restore the app’s default appearance, color, help and autosave preferences. It does not reset your project or delete files.',
 'restore flat base':'Remove the skull-shaped bottom-edge fit and restore a flat chamber base at the defined chamber height. Position and angles are kept; review surface clearance again.',
 'set origin to crosshair':'Move the chamber’s top centre to the current image crosshair. This is a manual position; it does not find an optimal mounting location or automatically aim at the target.',
 'undo brush stroke':'Remove the last skull-editing brush stroke from this draft surface. The preview updates; the source CT is unchanged.',
 'redo brush stroke':'Restore the most recently undone skull-editing stroke in this draft surface.',
 'undo opening edit':'Restore the previous opening-marker list or edit. This does not alter the CT bone segmentation.',
 '↑ parent folder':'Go up one folder in the data browser. This does not change the loaded project.',
})
const clean=(s:string)=>s.toLowerCase().replace(/…|\.\.\./g,'').replace(/\s+/g,' ').trim()
const stereotaxHelp:Record<string,string>={
 'show all animal sizes':'List every frame and compatible accessory family instead of filtering by the project species. This changes the choices offered; it does not replace your current frame.',
 'base plate model':'Choose a published base plate or enter your own dimensions. The plate is positioned relative to the ear axis. Unpublished dimensions are labeled as approximate.',
 'ear axis above plate (mm)':'Vertical distance from the top of the base plate to the original ear-tip level. For standard Kopf small-animal frames this is 53 mm.',
 'ear zero from posterior plate edge (mm)':'Distance from the back edge of the base plate to the plane of the ear tips. Changing it shifts the plate forward or backward beneath the frame.',
 'ear-tip center left/right (mm)':'Move both tips sideways by the same amount while keeping their separation. Individual front/back and height offsets are set below.',
 'individual ear-bar blocks':'Set each ear-bar block’s measured front/back and height position separately, or use the image crosshair to locate a tip.',
 'center xyz stages':'Return all three slide offsets to the middle of their travel. The whole arm’s mounting position and tilt stay as entered.',
 'adaptor a/p travel offset (mm)':'Slide the bite adaptor forward or backward within its published travel. This offset is added to the front/back contact position above.',
 'show controls and graduation marks':'Show the schematic knobs and scale markings on the frame and manipulators. Hiding them keeps the measured hardware positions and slide travel.',
 'locate holder tip in slices':'Move the slice crosshair to the modeled holder tip, including slide movement, tool tilt and frame rotation. This does not move the holder.',
 'locate ear-tip midpoint in slices':'Move the slice crosshair halfway between the two actual modeled tips, including their individual offsets. This does not move the ear bars.',
}
export function controlExplanation(control:HTMLElement):string{
 const label=control.closest('label'),field=label?.querySelector('span')?.textContent?.trim()
 const name=control.getAttribute('aria-label')||field||control.textContent?.trim()||label?.textContent?.trim()||control.getAttribute('placeholder')||'this setting'
 if(control.closest('fieldset:disabled')?.classList.contains('preview-readonly-grid'))return 'This is the grid in an unapplied placement preview. Apply or cancel the preview using the controls above before changing holes or grid dimensions.'
 const text=control.title||label?.title
 if(text&&text!==name&&!text.startsWith('Stored value:'))return text
 const key=clean(name)
 if(control.closest('.stereotax-editor')){
  const setting=key.replace(/ value$/,'')
  if(stereotaxHelp[setting])return stereotaxHelp[setting]
  if(/^stage [xyz] offset/.test(setting))return 'Move this slide relative to the middle of its travel at the entered arm location. The range follows the selected manipulator’s published travel. Tilt and swivel also turn the slide directions.'
  if(/^tool tilt [xy]/.test(setting))return 'Lean the manipulator’s slides and holder away from vertical in this plane. The preview and holder-tip locator include this angle.'
  if(/^(left|right) block/.test(setting))return 'Position this ear-bar block relative to the frame origin. Use measurements from your setup; these independent offsets do not imply that every frame has independent adjustment knobs.'
  if(/^use crosshair as (left|right) ear tip$/.test(setting))return 'Set this ear tip to the volume crosshair. The other tip stays in place, so spacing and the pair’s center update together. The point must lie within the support span.'
  if(setting==='use crosshair for bite contact')return 'Set the bite contact at the image crosshair, accounting for the frame rotation and the separate front/back adaptor offset.'
 }
 const exact=help[key];if(exact)return exact
 if(/^grid hole \(/i.test(name))return `${name}. Select this hole for the current electrode. Its usable depth depends on the target, grid angle, electrode width and any guide tube. Apply a pending placement preview before changing holes.`
 if(/zoom (in|out)|^(increase|decrease).*zoom/i.test(name)||name==='+'||name==='−')return 'Increase or decrease magnification in this viewer only. This changes the camera or image scale on screen, not physical dimensions or coordinates.'
 if(/^(add|load|import) aligned /i.test(name))return `Load this file into the current project. It must already line up with the reference image and use matching physical coordinates; the app does not align files for you. Check the result in all three slices.`
 if(/^(preview candidate|fit at chosen location|trajectory|fit \d)/i.test(name))return 'Display this tested option without saving it. Review its position, angles, insertion depth and any reported conflicts, then apply the preview to keep it.'
 if(/opacity in 3d|opacity.*3d/i.test(name))return 'Adjust how transparent this component is in the 3D view. Other components have separate controls. This changes only visibility, not geometry or placement constraints.'
 if(/^(show |toggle )/i.test(name))return `Change whether ${name.replace(/^(show |toggle )/i,'')} is visible. Display visibility does not remove geometry or marked regions from placement calculations.`
 if(/crop (minimum|maximum)/i.test(name))return 'Move one edge of the part of the scan used to build the surface. Crop out the scanner bed and unrelated objects, but keep all bone needed to support the chamber. The original CT stays unchanged.'
 if(/reference.*[ras].*\(mm\)|inside-skull reference/i.test(name))return 'Position of the point inside the skull used to help find its outer surface. Keep it away from skull bone and inside the cropped image. It is not an electrode target.'
 if(/opening.*diameter|candidate diameter/i.test(name))return 'Size in millimetres used to detect or mark a skull opening. The marked area to avoid can be larger than the measured opening. Check each result in CT before using it for placement.'
 if(/shaft|electrode|shank/.test(key)&&/length/.test(key))return 'Physical electrode shaft length available for insertion, not cable length. Individual entries correspond to the numbered electrodes in the preview. Changing a length can change target reach.'
 if(/connector|acquisition|recording system|wiring/.test(key))return 'Save this device or recording-system choice for reference. It does not add cable or connector shapes to the model, or increase electrode reach.'
 if(/resize|divider/.test(key)||control.getAttribute('role')==='separator')return 'Drag this boundary to change the neighbouring panel sizes. Arrow keys also adjust it; double-click restores the default layout.'
 const section=control.closest('section'),context=section?.querySelector('.note')?.textContent?.trim()
 if(context&&context!==name)return `${name}: ${context.slice(0,500)}`
 if(control.tagName==='BUTTON'){
  if(/^open |^configure|^edit /i.test(name))return 'Open the named tool or editor to inspect and adjust its settings. Opening it does not by itself apply changes to the project.'
  if(/^remove|^delete/i.test(name))return 'Remove the named item from the current project. Check the selection first. Most project edits can be restored with Undo.'
  if(/^apply|^save/i.test(name))return 'Save the changes from this editor to the current project. Review the entered dimensions and preview first. This does not write to or overwrite the original image files.'
  if(/^cancel|^close|^×$|^x$/i.test(name))return 'Close this tool or cancel the pending action. Changes already applied to the project are kept; unapplied drafts may be discarded.'
  if(/^reset/i.test(name))return 'Return the named settings to their starting values. Review the resulting preview before applying changes.'
 }
 return `${name}. Adjust this control to choose the value used by this panel. Numbered hardware entries match the device preview; settings in a configuration window remain drafts until applied.`
}
