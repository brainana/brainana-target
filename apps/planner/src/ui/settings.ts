import { defaultSceneColors, sceneColorLabels, type SceneColors } from '../render/colors.ts'
import { h } from '@brainana/ui/dom.ts'
import { button, note, selectField, numberField, chooseFile, download, errorDialog } from './controls.ts'
export interface Preferences {
  schemaVersion: 1
  colors: SceneColors
  theme: string
  textSize: number
  largeControls: boolean
  helpTips: boolean
  crosshairColor: string
  crosshairWidth: number
  autosave: boolean
  saveDelay: number
}
const key = 'brainana-target-settings'
export const defaults: Preferences = {
  schemaVersion: 1,
  colors: {...defaultSceneColors},
  theme: 'amber',
  textSize: 14,
  largeControls: false,
  helpTips: true,
  crosshairColor: '#ff3030',
  crosshairWidth: 1,
  autosave: true,
  saveDelay: 0.7,
}
export function normalize(input: unknown): Preferences {
  if (!input || typeof input !== 'object') throw new Error('Select a BrainanaTarget settings file.')
  const v = input as Partial<Preferences>
  if (v.schemaVersion !== 1) throw new Error('Unsupported settings version.')
  const p = { ...defaults, colors:{...defaultSceneColors} }
  for(const key of Object.keys(defaultSceneColors) as Array<keyof SceneColors>)if(/^#[0-9a-f]{6}$/i.test(v.colors?.[key]??''))p.colors[key]=v.colors![key]
  if(p.colors.avoidance==='#ef6c79')p.colors.avoidance=defaultSceneColors.avoidance
  if(p.colors.placementOpening==='#ff55cc')p.colors.placementOpening=defaultSceneColors.placementOpening
  if(p.colors.softAvoidance==='#46b4ff')p.colors.softAvoidance=defaultSceneColors.softAvoidance
  if (['amber', 'dark', 'light', 'contrast'].includes(v.theme ?? '')) p.theme = v.theme!
  for (const k of ['largeControls', 'helpTips', 'autosave'] as const)
    if (typeof v[k] === 'boolean') p[k] = v[k]!
  for (const [k, min, max] of [
    ['textSize', 12, 20],
    ['crosshairWidth', 0, 5],
    ['saveDelay', 0.5, 30],
  ] as const)
    if (typeof v[k] === 'number' && Number.isFinite(v[k])) p[k] = Math.max(min, Math.min(max, v[k]!))
  if (/^#[0-9a-f]{6}$/i.test(v.crosshairColor ?? '')) p.crosshairColor = v.crosshairColor!
  return p
}
export function readPreferences(): Preferences {
  try {
    return normalize(JSON.parse(localStorage.getItem(key) ?? 'null'))
  } catch {
    return { ...defaults }
  }
}
const palettes: Record<string, string[]> = {
  amber: [
    '#14120d',
    '#1c1913',
    '#241f17',
    '#ece6d8',
    '#a1957f',
    '#e6a13a',
    '#f4c877',
    '#241700',
    '#2e2818',
    '#3a3221',
  ],
  dark: [
    '#11151a',
    '#1b2128',
    '#242c35',
    '#edf2f7',
    '#a4b2c0',
    '#70b9ff',
    '#a2d3ff',
    '#081d30',
    '#303d4b',
    '#465463',
  ],
  light: [
    '#e8edf2',
    '#f7f9fb',
    '#ffffff',
    '#182432',
    '#526171',
    '#145c95',
    '#145c95',
    '#ffffff',
    '#dce7f1',
    '#a5b4c2',
  ],
  contrast: [
    '#000000',
    '#090909',
    '#151515',
    '#ffffff',
    '#dddddd',
    '#ffdf00',
    '#ffed80',
    '#000000',
    '#242424',
    '#999999',
  ],
}
export function applyAppearance(p: Preferences): void {
  const root = document.documentElement
  ;[
    'bg',
    'panel',
    'panel-2',
    'text',
    'muted',
    'accent',
    'accent-2',
    'accent-ink',
    'elev',
    'border-2',
  ].forEach((k, i) => root.style.setProperty('--' + k, palettes[p.theme][i]))
  root.style.setProperty('--border', palettes[p.theme][9])
  root.style.setProperty('--settings-font-size', p.textSize + 'px')
  root.dataset.largeControls = String(p.largeControls)
  root.dataset.helpTips = String(p.helpTips)
  root.style.colorScheme = p.theme === 'light' ? 'light' : 'dark'
}
export function settingsWindow(options: {
  get: () => Preferences
  change: (p: Preferences) => void
  resetLayout: () => void
}): { open: () => void } {
  const dialog = h('dialog', { class: 'target-settings', ariaLabel: 'BrainanaTarget settings' })
  let section = 'Appearance'
  const tabs = h('nav', { class: 'settings-tabs', ariaLabel: 'Settings sections' })
  const content = h('div', { class: 'settings-content' })
  const message = h('p', { role: 'status' })
  const update = (patch: Partial<Preferences>) => {
    const next = normalize({ ...options.get(), ...patch })
    try {
      localStorage.setItem(key, JSON.stringify(next))
      options.change(next)
      message.textContent = 'Settings saved.'
    } catch (error) {
      errorDialog(error)
    }
  }
  const render = () => {
    const p = options.get()
    const check = (label: string, k: 'largeControls' | 'helpTips' | 'autosave') => {
      const input = h('input', { type: 'checkbox' })
      input.checked = p[k]
      input.addEventListener('change', () => update({ [k]: input.checked }))
      return h('label', { class: 'field' }, [input, label])
    }
    const color = h('input', { type: 'color', value: p.crosshairColor, ariaLabel: 'Anatomy crosshair color' })
    color.addEventListener('input', () => update({ crosshairColor: color.value }))
    const all = h('div')
    all.append(
      h('h3', {}, ['Appearance']),
      selectField(
        'Theme',
        p.theme,
        Object.keys(palettes).map((value) => ({
          value,
          label: value === 'contrast' ? 'High contrast' : value[0].toUpperCase() + value.slice(1),
        })),
        (theme) => update({ theme }),
      ),
      numberField('Interface text size (px)', p.textSize, (textSize) => update({ textSize }), {
        min: 12,
        max: 20,
        step: 1,
      }),
      check('Larger buttons and input controls', 'largeControls'),
      check('Show explanatory hover tips', 'helpTips'),
      h('h3', {}, ['Anatomy display']),
      h('label', { class: 'field' }, ['Crosshair color', color]),
      numberField(
        'Crosshair width (0 hides crosshairs)',
        p.crosshairWidth,
        (crosshairWidth) => update({ crosshairWidth }),
        { min: 0, max: 5, step: 1 },
      ),
      note(
        'These settings affect anatomy crosshairs. Target and electrode geometry remain unchanged. 3D opacity and layer controls remain in the 3D view.',
      ),
      ...Object.entries(sceneColorLabels).map(([key,label])=>{
        const input=h('input',{type:'color',value:p.colors[key as keyof SceneColors],ariaLabel:label+' color'})
        input.addEventListener('input',()=>update({colors:{...options.get().colors,[key]:input.value}}))
        return h('label',{class:'field'},[label,input])
      }),
      note("Use the legend in 3D to distinguish possible placements, nearby skull openings, Soft avoidance conflicts and blocked grid holes. Opening-nearby coloring includes openings set to Ignore, so you can still see that one is present. Change the colors below. A Hard avoidance requirement is never relaxed. Individual targets, electrodes and image color maps have their own color controls."),
      h('h3', {}, ['Saving and workspace']),
      check('Autosave projects locally', 'autosave'),
      numberField(
        'Autosave delay after editing (seconds)',
        p.saveDelay,
        (saveDelay) => update({ saveDelay }),
        { min: 0.5, max: 30, step: 0.5 },
      ),
      note(
        'Reload starts a fresh project. Resume previous autosave is available on the start screen. Portable project files are saved using Save project.',
      ),
      button('Reset view', options.resetLayout),
    )
    const groups: Record<string, Element[]> = { Appearance: [], Display: [], Interaction: [], Saving: [] }
    let group = 'Appearance'
    for (const item of all.children) {
      if (item.tagName === 'H3')
        group =
          item.textContent === 'Anatomy display'
            ? 'Display'
            : item.textContent === 'Saving and workspace'
              ? 'Saving'
              : 'Appearance'
      if (item.textContent === 'Show explanatory hover tips') groups.Interaction.push(item)
      else groups[group].push(item)
    }
    content.replaceChildren(...groups[section])
    if (section === 'Interaction')
      content.prepend(
        h('h3', {}, ['Interaction']),
        note(
          'Drag view dividers to resize panels. Double-click a divider to reset it. Use ⌘/Ctrl+, for Settings and ⌘/Ctrl+S to save a project.',
        ),
      )
    for (const tab of tabs.querySelectorAll('button'))
      tab.setAttribute('aria-pressed', String(tab.textContent === section))
  }
  for (const name of ['Appearance', 'Display', 'Interaction', 'Saving'])
    tabs.append(
      button(name, () => {
        section = name
        render()
      }),
    )
  const close = button('×', () => dialog.close())
  close.setAttribute('aria-label', 'Close settings')
  dialog.append(
    h('header', { class: 'modal-head' }, [h('h2', {}, ['Settings']), close]),
    note('Preferences apply immediately and are separate from saved project geometry.'),
    tabs,
    content,
    message,
    h('div', { class: 'settings-actions' }, [
      button('Reset section', () => {
        const fields: Record<string, Array<keyof Preferences>> = {
          Appearance: ['theme', 'textSize', 'largeControls'],
          Display: ['crosshairColor', 'crosshairWidth', 'colors'],
          Interaction: ['helpTips'],
          Saving: ['autosave', 'saveDelay'],
        }
        update(Object.fromEntries(fields[section].map((k) => [k, defaults[k]])))
        render()
      }),
      button('Export settings', () =>
        download('BrainanaTarget-settings.json', JSON.stringify(options.get(), null, 2), 'application/json'),
      ),
      button('Import settings', () =>
        chooseFile(
          '.json',
          async (file) => {
            if (file.size > 100000) throw new Error('Settings file is too large.')
            update(normalize(JSON.parse(await file.text())))
            render()
          },
          errorDialog,
        ),
      ),
      button('Restore default settings', () => {
        update(defaults)
        render()
      }),
    ]),
  )
  document.body.append(dialog)
  const open = () => {
    render()
    message.textContent = ''
    if (!dialog.open) dialog.showModal()
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault()
      open()
    }
  })
  return { open }
}
