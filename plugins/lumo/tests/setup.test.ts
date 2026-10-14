import type { RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'lumo',
  component: 'Pane',
  requestId: 'lumo-setup',
  props: { title: 'Lumo Setup', isFocused: true, bodyColumns: 50 } as never,
} as const

test('the pane draws the logo on desktop and a text mark in the terminal', async $ => {
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desktop.find({ type: 'Svg' })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: 'Lumo' })).toBeDefined()
  await desktop.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ type: 'Text', text: /▶/ })).toBeDefined()
  await terminal.unmount()
})

test('while it checks, the pane offers a re-check and no install', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface })
    expect(await pane.find({ type: 'Text', text: /Checking this computer/ })).toBeDefined()
    expect(await pane.find({ key: 'check' })).toBeDefined()
    expect(await pane.find({ key: 'install' })).toBeUndefined()
    await pane.unmount()
  }
})

test('the band stays out of the way when nothing installs', async ($, on) => {
  // The engine's own band, standing beneath the plugin.
  on('ui.render', async ($, e) => {
    const { Box } = $.ui.resolve(e)
    return h(Box, { key: 'engine-band' }) as RenderElement
  })
  const band = await $.ui.mount({
    plugin: 'lumo',
    surface: 'desktop',
    component: 'AbovePrompt',
    props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 80 } as never,
  })
  expect(await band.find({ type: 'Text', text: 'Lumo' })).toBeUndefined()
  await band.unmount()
})

test('before the account is connected, the pane sends the user to /lumo:setup instead of installing', async ($, on) => {
  // This computer as the engine's doctor reports it: not connected, the speech model missing.
  const doctor = {
    ready: false,
    checks: [
      { name: 'Connected to your Lumo account', ok: false },
      { name: 'Speech model', ok: false },
    ],
  }
  on('fs.stat', async () => ({ value: { kind: 'file', size: 1, mtimeMs: 0, isLink: false } }))
  on('process.run', async () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify(doctor),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.ui.press({ plugin: 'lumo', key: 'check', requestId: 'lumo-setup' })
  for (let tries = 0; tries < 50 && !(await pane.find({ type: 'Text', text: /few things/ })); tries++) {
    await pane.redraw()
  }
  expect(await pane.find({ type: 'Text', text: /Connect your Lumo account first: run \/lumo:setup/ })).toBeDefined()
  expect(await pane.find({ text: /Install Lumo/ })).toBeUndefined()
  expect(await pane.find({ text: /Check again/ })).toBeDefined()
  await pane.unmount()
})
