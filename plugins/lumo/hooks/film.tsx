import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LumoFilm, LumoStageId } from '../types'

// The Lumo Film pane: while Claude makes a film, it shows what is happening, the latest frames it looked at,
// and how far along it is. It follows the lumo_* tool calls (and the director's writes of the plan and the
// scene), so it needs nothing from the engine beyond what those calls already return.

const PANE = 'lumo-film'
const TITLE = 'Lumo'

const STAGES: { id: LumoStageId; label: string; doing: string; percent: number }[] = [
  { id: 'study', label: 'Study the footage', doing: 'Studying the footage', percent: 8 },
  { id: 'plan', label: 'Write the storyboard', doing: 'Writing the storyboard', percent: 18 },
  { id: 'build', label: 'Build the scenes', doing: 'Building the scenes', percent: 34 },
  { id: 'look', label: 'Check the frames', doing: 'Checking the frames', percent: 52 },
  { id: 'render', label: 'Render', doing: 'Rendering the film', percent: 72 },
  { id: 'sound', label: 'Music and sound', doing: 'Mixing music and sound', percent: 86 },
  { id: 'finish', label: 'Finish', doing: 'Finishing', percent: 96 },
]
const order = (id: LumoStageId) => STAGES.findIndex(stage => stage.id === id)

const IDLE: LumoFilm = {
  active: false,
  done: false,
  failed: null,
  dir: null,
  brief: null,
  kind: null,
  stage: 'study',
  busy: false,
  note: null,
  startedAt: null,
  finishedAt: null,
  now: null,
  preview: null,
  previewLabel: null,
  passes: 0,
}

const film = atom({ plugin: 'lumo', key: 'film' } as const, IDLE)

/** The lumo tool a call names (`mcp__plugin_lumo_lumo__lumo_render` is `render`), or null. */
const lumoTool = (tool: string) => tool.match(/^mcp__.*lumo.*__lumo_([a-z_]+)$/)?.[1] ?? null
// lumo_open as this install names it, learned from the first lumo call seen.
let openTool: `mcp__${string}__${string}` | null = null

const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 32">' +
  '<rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="#0A0A0A" stroke="#FFFFFF" stroke-opacity=".18"/>' +
  '<rect x="6.7" y="5.2" width="8.4" height="21.1" rx="2" fill="#FFFFFF"/>' +
  '<rect x="6.7" y="17.9" width="18.7" height="8.4" rx="2" fill="#FFFFFF"/>' +
  '<path d="M16.4 19.9 L20.1 22.1 L16.4 24.3 Z" fill="#0A0A0A" stroke="#0A0A0A" stroke-width=".6" stroke-linejoin="round"/>' +
  '</svg>'

const W = 560
const H = 315
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** The preview card: the latest frames (or a calm placeholder), a label chip, and the progress bar under it. */
function cardSvg(state: LumoFilm) {
  const stage = STAGES[order(state.stage)]
  const percent = state.done ? 100 : stage?.percent ?? 0
  const accent = state.failed ? '#F85149' : state.done ? '#3FB950' : '#2F6BFF'
  const label = esc(state.previewLabel ?? (state.done ? 'Ready' : stage?.doing ?? ''))
  const picture = state.preview
    ? `<image href="data:image/jpeg;base64,${state.preview}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet" clip-path="url(#c)"/>`
    : `<g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="url(#ph)"/>` +
      `<circle cx="${W / 2}" cy="${H / 2 - 8}" r="22" fill="none" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="4"/>` +
      `<path d="M${W / 2} ${H / 2 - 30} a22 22 0 0 1 22 22" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/></g>`
  const chipW = 26 + label.length * 7.6
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 22}" viewBox="0 0 ${W} ${H + 22}">` +
    `<defs><clipPath id="c"><rect width="${W}" height="${H}" rx="16"/></clipPath>` +
    `<linearGradient id="ph" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1B1D22"/><stop offset="1" stop-color="#0E0F12"/></linearGradient>` +
    `<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" rx="16" fill="#0E0F12"/>` +
    picture +
    `<rect width="${W}" height="${H}" rx="16" fill="url(#fade)"/>` +
    `<rect width="${W}" height="${H}" rx="16" fill="none" stroke="#FFFFFF" stroke-opacity=".1"/>` +
    `<rect x="14" y="${H - 44}" width="${chipW}" height="30" rx="15" fill="#000" fill-opacity=".6"/>` +
    `<circle cx="30" cy="${H - 29}" r="4" fill="${accent}"/>` +
    `<text x="42" y="${H - 24}" font-family="-apple-system, Inter, sans-serif" font-size="13" font-weight="600" fill="#FFFFFF">${label}</text>` +
    `<rect x="0" y="${H + 12}" width="${W}" height="6" rx="3" fill="#888888" fill-opacity=".22"/>` +
    `<rect x="0" y="${H + 12}" width="${Math.max(6, (percent / 100) * W)}" height="6" rx="3" fill="${accent}"/>` +
    '</svg>'
  )
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** The time, from the engine's clock when it has one. */
const nowOf = ($: EngineInterface) => $.clock.now().catch(() => Date.now())

const set = ($: EngineInterface, change: (state: LumoFilm) => LumoFilm) => update($, film, change)

/** A small JPEG of `src` (base64) for the card, or null: ffmpeg first (Lumo installs it), then macOS sips. */
async function thumbnail($: EngineInterface, src: string, at?: number) {
  const out = `${src.replace(/\/[^/]*$/, '')}/.lumo-pane.jpg`
  for (const width of [560, 400]) {
    const seek = at === undefined ? [] : ['-ss', String(at)]
    const ff = await $.process
      .run(['ffmpeg', '-y', '-v', 'error', ...seek, '-i', src, '-frames:v', '1', '-vf', `scale=${width}:-2`, '-q:v', '7', out], { timeoutMs: 30_000 })
      .catch(() => null)
    if (!ff || ff.exitCode !== 0) {
      if (at !== undefined) return null
      const sips = await $.process.run(['sips', '-Z', String(width), '-s', 'format', 'jpeg', src, '--out', out], { timeoutMs: 30_000 }).catch(() => null)
      if (!sips || sips.exitCode !== 0) return null
    }
    const bytes = await $.fs.read(out, { as: 'bytes' }).catch(() => null)
    if (bytes && bytes.base64.length < 110_000) return bytes.base64
  }
  return null
}

async function showPreview($: EngineInterface, src: string, label: string, at?: number) {
  const base64 = await thumbnail($, src, at)
  if (base64) await set($, state => ({ ...state, preview: base64, previewLabel: label }))
}

let ticking = false
/** Keeps the elapsed time moving while a film is being made. */
async function tick($: EngineInterface) {
  if (ticking) return
  ticking = true
  try {
    for (;;) {
      const state = await read($, film)
      if (!state.active || state.done || state.failed) break
      const now = await nowOf($)
      await set($, s => ({ ...s, now }))
      $.ui.status(`Lumo · ${STAGES[order(state.stage)]?.doing ?? 'Working'} · ${clock(now - (state.startedAt ?? now))}`)
      await $.clock.sleep(1000)
    }
  } finally {
    ticking = false
  }
}

/** Moves to a stage (never back), with an optional note. */
const reach = ($: EngineInterface, stage: LumoStageId, note: string | null = null, busy = true) =>
  set($, state => ({
    ...state,
    stage: order(stage) > order(state.stage) ? stage : state.stage,
    note: note ?? STAGES[order(stage)]?.doing ?? null,
    busy,
    previewLabel: note ?? STAGES[order(stage)]?.doing ?? state.previewLabel,
  }))

const filmDir = (state: LumoFilm, arg: unknown) =>
  typeof arg === 'string' && arg.startsWith('/') ? arg : state.dir

/** What a call means for the pane before it runs. Never throws: the pane must not get in the film's way. */
async function before($: EngineInterface, tool: string, name: string | null, args: Record<string, unknown>) {
  // The director writing the plan or the scene.
  if (!name) {
    if (tool !== 'Write' && tool !== 'Edit') return
    const state = await read($, film)
    const path = String(args.file_path ?? '')
    if (!state.active || state.done || !state.dir || !path.startsWith(state.dir)) return
    if (path.endsWith('/out/plan.md')) await reach($, 'plan')
    else if (path.endsWith('/scene.html')) await reach($, 'build', state.passes ? `Fixing what review found · pass ${state.passes}` : null)
    return
  }
  openTool = tool.replace(/lumo_[a-z_]+$/, "lumo_open") as `mcp__${string}__${string}`
  if (name === 'new_film') {
    const now = await nowOf($)
    const launch = args.kind === 'launch'
    await set($, () => ({
      ...IDLE,
      active: true,
      brief: String(args.brief ?? ''),
      kind: launch ? 'launch' : 'footage',
      stage: launch ? 'plan' : 'study',
      busy: true,
      note: launch ? 'Setting up the film' : 'Studying the footage: transcript, face, silences',
      startedAt: now,
      now,
    }))
    await $.ui.open({ id: PANE, title: TITLE }).catch(() => undefined)
    void tick($).catch(() => undefined)
    return
  }
  const state = await read($, film)
  if (!state.active) return
  if (name === 'guide') await reach($, 'plan')
  else if (name === 'stills') {
    const pass = state.passes + 1
    await set($, s => ({ ...s, passes: pass }))
    await reach($, 'look', `Checking the frames · pass ${pass}`)
  } else if (name === 'render') await reach($, 'render', 'Rendering the film, frame by frame')
  else if (name === 'library' || name === 'fx') await reach($, 'sound', name === 'fx' ? 'Picking transitions and overlays' : 'Choosing music and sounds')
  else if (name === 'mix') await reach($, 'sound', 'Mixing music and sound')
  else if (name === 'finish') await reach($, 'finish', 'Finishing: poster, timeline, checks')
}

/** What a call's result shows: the frames it made, or the film being done. */
async function after($: EngineInterface, name: string, args: Record<string, unknown>, text: string, isError: boolean) {
  if (name === 'new_film') {
    const dir = text.match(/Film folder: (.+)/)?.[1]?.trim() ?? null
    await set($, state => ({ ...state, dir, busy: false, note: isError ? 'The film could not start' : 'Footage studied' }))
    if (dir && args.kind !== 'launch') await showPreview($, `${dir}/work/contact.jpg`, 'The whole take, at a glance')
    return
  }
  const state = await read($, film)
  if (!state.active) return
  const dir = filmDir(state, args.film)
  if (name === 'stills') {
    const file = text.match(/^(\S+\.jpg)/)?.[1]
    if (dir && file) await showPreview($, `${dir}/${file}`, `Frames checked · pass ${state.passes}`)
  } else if (name === 'render') {
    const duration = Number(args.duration) || 0
    await set($, s => ({ ...s, busy: false }))
    if (dir && !isError) await showPreview($, `${dir}/work/video.mp4`, 'Rendered', duration > 0 ? duration * 0.4 : 1)
  } else if (name === 'finish') {
    if (isError) {
      await set($, s => ({ ...s, busy: false, note: 'A check failed; Claude is fixing it' }))
      return
    }
    const now = await nowOf($)
    await set($, s => ({ ...s, done: true, busy: false, finishedAt: now, now, note: 'Your film is ready', previewLabel: 'Ready' }))
    if (dir) await showPreview($, `${dir}/out/poster.jpg`, 'Ready')
    try {
      $.ui.status('Lumo ✓ film ready')
      $.ui.toast('Your Lumo film is ready ✓')
    } catch {}
  }
}

/** A call's result as text: core's `text`, or the text blocks of an MCP result a hook answered with. */
function resultText(result: { text?: string; result?: unknown }) {
  if (typeof result.text === 'string') return result.text
  const content = (result.result as { content?: { type?: string; text?: string }[] } | undefined)?.content
  return Array.isArray(content) ? content.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n') : ''
}

export const registerFilm = (on: Parameters<Register>[0]) => {
  on('tool.call', async ($, e, next) => {
    const name = lumoTool(e.tool)
    const args = e as unknown as Record<string, unknown>
    await before($, e.tool, name, args).catch(() => undefined)
    const result = await next(e)
    if (name) await after($, name, args, resultText(result), result.isError === true).catch(() => undefined)
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
    const state = await read($, film)

    if (!state.active) {
      return (
        <Box flexDirection="column" gap={1} padding={1}>
          <Text bold>Lumo</Text>
          <Text dimColor>Ask Claude for a video. This pane shows it being made, step by step.</Text>
        </Box>
      )
    }

    const now = state.finishedAt ?? state.now ?? state.startedAt ?? 0
    const elapsed = clock(now - (state.startedAt ?? now))
    const at = order(state.stage)
    const headline = state.failed ? 'Stopped' : state.done ? 'Your film is ready' : state.busy ? STAGES[at]?.doing ?? 'Working' : state.note ?? 'Working'

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box key="header" flexDirection="row" gap={1} alignItems="center">
          {Svg ? <Svg key="logo" source={LOGO} alt="Lumo" width={40} height={40} /> : <Text key="logo" inverse bold>{' ▶ '}</Text>}
          <Box flexDirection="column" flexGrow={1}>
            <Text key="headline" bold color={state.done ? 'success' : state.failed ? 'error' : undefined}>{headline}</Text>
            <Text key="brief" dimColor>{(state.brief ?? '').slice(0, 90)}</Text>
          </Box>
          <Text key="time" dimColor>{elapsed}</Text>
        </Box>

        {Svg ? (
          <Svg key="card" source={cardSvg(state)} alt={state.previewLabel ?? headline} />
        ) : (
          <Text key="card" color="claude">{`${state.previewLabel ?? headline}  ${state.done ? 100 : STAGES[at]?.percent ?? 0}%`}</Text>
        )}

        <Box key="stages" flexDirection="column" borderStyle="round" borderColor="promptBorder" paddingX={1}>
          {STAGES.filter(stage => state.kind !== 'launch' || stage.id !== 'study').map(stage => {
            const i = order(stage.id)
            const isDone = state.done || i < at || (i === at && !state.busy && stage.id === 'study')
            const isNow = !state.done && i === at && !isDone
            return (
              <Box key={stage.id} flexDirection="row" justifyContent="space-between">
                <Text color={isDone ? 'success' : isNow ? 'claude' : 'inactive'} bold={isNow}>
                  {`${isDone ? '✓' : isNow ? '◐' : '○'}  ${stage.label}`}
                </Text>
                {isNow && stage.id === 'look' && state.passes > 1 && <Text dimColor>{`pass ${state.passes}`}</Text>}
              </Box>
            )
          })}
        </Box>

        {state.note && !state.done && <Text key="note" color="claude">{state.note}</Text>}

        {state.done && state.dir && (
          <Box key="actions" flexDirection="row" gap={1}>
            <Button
              key="open"
              variant="primary"
              onPress={() => {
                if (openTool) void $.tool.call({ tool: openTool, film: state.dir ?? '' }).catch(() => undefined)
              }}
            >
              Open the film
            </Button>
            <Button key="folder" onPress={() => void $.process.run(['open', state.dir ?? ''], { timeoutMs: 10_000 })}>
              Show in Finder
            </Button>
          </Box>
        )}
        {state.done && <Text key="hint" dimColor>Ask Claude for changes in the chat; this pane follows the new version.</Text>}
      </Box>
    )
  })

  // A one-line band above the prompt while a film is being made.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, film)
    if (!state.active || state.done || state.failed || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const now = state.now ?? state.startedAt ?? 0
    return (
      <Box flexDirection="row" gap={1}>
        <Text color="claude" bold>Lumo</Text>
        <Text>{state.note ?? STAGES[order(state.stage)]?.doing ?? 'Working'}</Text>
        <Text dimColor>{`${STAGES[order(state.stage)]?.percent ?? 0}% · ${clock(now - (state.startedAt ?? now))}`}</Text>
      </Box>
    )
  })
}
