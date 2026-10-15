import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { LumoCheck, LumoSetup } from '../types'
import { registerFilm } from './film'

const PANE = 'lumo-setup'
const TITLE = 'Lumo Setup'

const START: LumoSetup = {
  phase: 'checking',
  checks: [],
  step: null,
  percent: null,
  note: null,
  isDemo: false,
}

const setup = atom({ plugin: 'lumo', key: 'setup' } as const, START)

// The demo replays a first install on a computer that already has Lumo,
// so the pane and the band can be seen without downloading 3 GB again.
const DEMO_STEPS: { name: string; mib: number | null }[] = [
  { name: 'Renderer', mib: null },
  { name: 'Chromium', mib: 99 },
  { name: 'Python tools', mib: null },
  { name: 'Face model', mib: null },
  { name: 'Speech model', mib: 1600 },
  { name: 'Sound and FX library', mib: 300 },
]

/** The check an installer step belongs to: "Speech model (about 1.6 GB)" is "Speech model". */
const checkFor = (step: string, checks: LumoCheck[]) =>
  checks.find(check => step.toLowerCase().startsWith(check.name.toLowerCase()))

const markDone = (checks: LumoCheck[], step: string | null) =>
  step === null
    ? checks
    : checks.map(check => (checkFor(step, [check]) ? { ...check, ok: true } : check))

const bar = (percent: number, width: number) => {
  const full = Math.round((percent / 100) * width)
  return '█'.repeat(full) + '░'.repeat(width - full)
}

// brand/lumo-logo.svg, with a faint edge so the dark tile reads on a dark pane.
const LOGO =
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 32 32">' +
  '<rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="#0A0A0A" stroke="#FFFFFF" stroke-opacity=".18"/>' +
  '<rect x="6.7" y="5.2" width="8.4" height="21.1" rx="2" fill="#FFFFFF"/>' +
  '<rect x="6.7" y="17.9" width="18.7" height="8.4" rx="2" fill="#FFFFFF"/>' +
  '<path d="M16.4 19.9 L20.1 22.1 L16.4 24.3 Z" fill="#0A0A0A" stroke="#0A0A0A" stroke-width=".6" stroke-linejoin="round"/>' +
  '</svg>'

/** A rounded progress track, neutral enough for the light and the dark theme. */
const progressSvg = (fraction: number, color: string) => {
  const w = 280
  const fill = Math.max(0, Math.min(1, fraction)) * w
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="6" viewBox="0 0 ${w} 6">` +
    `<rect width="${w}" height="6" rx="3" fill="#888888" fill-opacity=".22"/>` +
    (fill > 0 ? `<rect width="${Math.max(6, fill)}" height="6" rx="3" fill="${color}"/>` : '') +
    '</svg>'
  )
}

/** What each piece weighs, so a first install says where the 3 GB go. */
const SIZES: Record<string, string> = {
  Chromium: '100 MB',
  'Speech model': '1.6 GB',
  'Sound and FX library': '300 MB',
  'Python tools': '450 MB',
}

const HEADLINE: Record<LumoSetup['phase'], string> = {
  checking: 'Checking this computer…',
  missing: 'A few things to install · about 3 GB, a few minutes',
  installing: 'Installing Lumo…',
  ready: 'Ready to make videos',
  failed: 'Setup stopped',
}

let engine: string | null = null
let isBusy = false

/** The engine this plugin ships, next to these hooks. */
async function findEngine($: EngineInterface) {
  if (engine) return engine
  const path = `${$.plugin.root}/engine/lumo-engine.mjs`
  const found = await $.fs.stat(path).catch(() => undefined)
  engine = found?.kind === 'file' ? path : null
  return engine
}

function showStatus($: EngineInterface, state: LumoSetup) {
  if (state.phase === 'ready') $.ui.status('Lumo ✓ ready')
  else if (state.phase === 'installing')
    $.ui.status(`Lumo · ${state.step ?? 'installing'}${state.percent === null ? '' : ` ${state.percent}%`}`)
  else if (state.phase === 'missing') $.ui.status('Lumo · setup needed')
  else if (state.phase === 'failed') $.ui.status('Lumo · setup failed')
  else $.ui.status(undefined)
}

const set = async ($: EngineInterface, change: (state: LumoSetup) => LumoSetup) => {
  const next = await update($, setup, change)
  showStatus($, next)
  return next
}

async function check($: EngineInterface) {
  const path = await findEngine($)
  if (!path) {
    await set($, state => ({ ...state, phase: 'failed', note: "Lumo's engine is missing from the plugin. Reinstall the Lumo plugin." }))
    return
  }
  await set($, state => ({ ...state, phase: 'checking', note: null }))
  const doctor = await $.process.run(['node', path, 'doctor'], { timeoutMs: 60_000 })
  try {
    const report = JSON.parse(doctor.stdout) as { ready: boolean; checks: LumoCheck[] }
    await set($, state => ({
      ...state,
      phase: report.ready ? 'ready' : 'missing',
      checks: report.checks.map(({ name, ok }) => ({ name, ok })),
      step: null,
      percent: null,
    }))
  } catch {
    await set($, state => ({ ...state, phase: 'failed', note: 'Lumo could not check this computer.' }))
  }
}

async function install($: EngineInterface) {
  const path = await findEngine($)
  if (!path || isBusy) return
  isBusy = true
  await set($, state => ({ ...state, phase: 'installing', isDemo: false, step: null, percent: null }))
  let pending = ''
  const child = $.process.spawn({ argv: ['node', path, 'setup'] })
  try {
    for await (const { text } of child) {
      pending += text
      const lines = pending.split(/\r|\n/)
      pending = lines.pop() ?? ''
      for (const line of lines) {
        const step = line.match(/^▸\s*(.+)$/)
        const percent = line.match(/(\d{1,3})% of/)
        if (step) {
          await set($, state => ({
            ...state,
            checks: markDone(state.checks, state.step),
            step: (step[1] ?? "").trim(),
            percent: null,
          }))
        } else if (percent) {
          await set($, state => ({ ...state, percent: Number(percent[1]) }))
        }
      }
    }
  } finally {
    isBusy = false
  }
  await check($)
  const after = await read($, setup)
  $.ui.toast(after.phase === 'ready' ? 'Lumo is ready ✓' : 'Lumo setup did not finish')
}

async function demo($: EngineInterface) {
  if (isBusy) return
  isBusy = true
  try {
    await set($, state => ({
      ...state,
      phase: 'installing',
      isDemo: true,
      checks: state.checks.map(one =>
        DEMO_STEPS.some(step => step.name === one.name) ? { ...one, ok: false } : one,
      ),
    }))
    for (const step of DEMO_STEPS) {
      await set($, state => ({ ...state, step: step.name, percent: step.mib === null ? null : 0 }))
      if (step.mib === null) {
        await $.clock.sleep(1200)
      } else {
        for (let percent = 0; percent <= 100; percent += step.mib > 1000 ? 4 : 10) {
          await set($, state => ({ ...state, percent }))
          await $.clock.sleep(250)
        }
      }
      await set($, state => ({ ...state, checks: markDone(state.checks, step.name) }))
    }
    await set($, state => ({ ...state, phase: 'ready', step: null, percent: null, isDemo: false }))
    $.ui.toast('Lumo is ready ✓')
  } finally {
    isBusy = false
  }
}

export const register: Register = on => {
  registerFilm(on)
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'lumo-setup',
      description: 'Lumo setup: open the checklist (install, check, demo)',
    })
    void check($).then(async () => {
      const state = await read($, setup)
      if (state.phase === 'missing') await $.ui.open({ id: PANE, title: TITLE })
    })

    return started
  })

  on('command.run', { command: 'lumo-setup' }, async ($, e) => {
    await $.ui.open({ id: PANE, title: TITLE })
    const action = e.args.trim()
    if (action === 'install') {
      void install($)
      return { text: 'Installing Lumo: progress in the Lumo Setup pane.' }
    }
    if (action === 'demo') {
      void demo($)
      return { text: 'Replaying a first install in the Lumo Setup pane (nothing is downloaded).' }
    }
    void check($)
    return { text: 'Lumo Setup pane opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const Svg = e.surface !== 'terminal' && 'Svg' in ui ? ui.Svg : undefined
    const state = await read($, setup)
    const total = state.checks.length
    const done = state.checks.filter(one => one.ok).length
    const width = Math.max(10, Math.min(32, (e.viewport?.columns ?? 50) - 16))
    const current = state.step ? checkFor(state.step, state.checks) : undefined
    const isInstalling = state.phase === 'installing'
    // The installer downloads with the account's license, so the account comes first, in the chat.
    const needsAccount = state.checks.some(one => !one.ok && /account|subscription/i.test(one.name))
    const headline =
      state.phase === 'failed' && state.note
        ? state.note
        : `${HEADLINE[state.phase]}${isInstalling && state.isDemo ? ' (demo)' : ''}`

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box key="header" flexDirection="row" gap={1} alignItems="center">
          {Svg ? (
            <Svg key="logo" source={LOGO} alt="Lumo" width={40} height={40} />
          ) : (
            <Text key="logo" inverse bold>{' ▶ '}</Text>
          )}
          <Box flexDirection="column">
            <Text key="name" bold>Lumo</Text>
            <Text key="headline" color={state.phase === 'ready' ? 'success' : state.phase === 'failed' ? 'error' : 'subtle'}>
              {headline}
            </Text>
          </Box>
        </Box>

        {total > 0 && (
          <Box key="overall" flexDirection="column">
            <Box flexDirection="row" justifyContent="space-between">
              <Text dimColor>Setup</Text>
              <Text key="count" dimColor>{`${done} of ${total} ready`}</Text>
            </Box>
            {Svg ? (
              <Svg key="overall-bar" source={progressSvg(done / total, done === total ? '#3FB950' : '#8B8B8B')} alt={`${done} of ${total}`} />
            ) : (
              <Text color={done === total ? 'success' : 'inactive'}>{bar((done / total) * 100, width)}</Text>
            )}
          </Box>
        )}

        {total > 0 && (
          <Box key="checks" flexDirection="column" borderStyle="round" borderColor="promptBorder" paddingX={1}>
            {state.checks.map(one => {
              const isNow = isInstalling && current?.name === one.name
              const size = SIZES[one.name]
              return (
                <Box key={one.name} flexDirection="column" paddingY={isNow ? 1 : 0}>
                  <Box flexDirection="row" justifyContent="space-between">
                    <Text color={one.ok ? 'success' : isNow ? 'claude' : 'inactive'} bold={isNow}>
                      {`${one.ok ? '✓' : isNow ? '◐' : '○'}  ${one.name}`}
                    </Text>
                    {size && !one.ok && <Text dimColor>{size}</Text>}
                  </Box>
                  {isNow && state.percent !== null && (
                    <Box flexDirection="row" gap={1} alignItems="center" paddingLeft={3}>
                      {Svg ? (
                        <Svg key="step-bar" source={progressSvg(state.percent / 100, '#D97757')} alt={`${state.percent}%`} width={200} />
                      ) : (
                        <Text color="claude">{bar(state.percent, width)}</Text>
                      )}
                      <Text key="step-percent" color="claude">{`${state.percent}%`}</Text>
                    </Box>
                  )}
                </Box>
              )
            })}
            {isInstalling && state.step && !current && (
              <Text color="claude">{`◐  ${state.step}`}</Text>
            )}
          </Box>
        )}

        <Box key="actions" flexDirection="row" gap={1}>
          {state.phase === 'missing' && !needsAccount && (
            <Button key="install" variant="primary" onPress={() => void install($)}>
              Install Lumo
            </Button>
          )}
          {state.phase === 'ready' && (
            <Button key="demo" onPress={() => void demo($)}>
              Replay install (demo)
            </Button>
          )}
          {!isInstalling && (
            <Button key="check" onPress={() => void check($)}>
              Check again
            </Button>
          )}
        </Box>

        {state.phase === 'missing' && needsAccount && (
          <Text key="account">Connect your Lumo account first: run /lumo:setup in the chat.</Text>
        )}

        {state.phase === 'ready' && (
          <Text key="hint" dimColor>Ask Claude for a video: edit your footage, or a launch film for a product.</Text>
        )}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const state = await read($, setup)
    if (state.phase !== 'installing' || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1}>
        <Text color="claude" bold>
          Lumo
        </Text>
        <Text>{state.step ?? 'Starting…'}</Text>
        {state.percent !== null && (
          <Text key="band-percent" color="claude">{`${bar(state.percent, 20)} ${state.percent}%`}</Text>
        )}
      </Box>
    )
  })
}
