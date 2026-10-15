import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'lumo',
  component: 'Pane',
  requestId: 'lumo-film',
  props: { title: 'Lumo', isFocused: true, bodyColumns: 60 } as never,
} as const

const tool = (name: string) => `mcp__plugin_lumo_lumo__lumo_${name}` as const

test('before any film, the pane says what it is for', async $ => {
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /shows it being made/ })).toBeDefined()
  await pane.unmount()
})

test('the pane follows a film from the footage to the finished cut', async ($, on) => {
  // The engine beneath: every lumo tool answers, thumbnails fail quietly (no ffmpeg here).
  on('tool.call', async (_$, e) => {
    const text = String(e.tool).endsWith('lumo_new_film')
      ? 'Film folder: /tmp/lumo-test-film\nfootage · 9:16'
      : String(e.tool).endsWith('lumo_stills')
        ? 'review/s1_sheet.jpg: 1, 2 s'
        : 'ok'
    return { result: { content: [{ type: 'text', text }] } } as never
  })
  on('process.run', async () => ({ value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))

  await $.tool.call({ tool: tool('new_film'), kind: 'footage', brief: 'Edit my clip into a punchy short', footage: '/tmp/clip.mp4' } as never)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /Edit my clip/ })).toBeDefined()
  // the preview card is the second drawing, after the logo
  expect(JSON.stringify(await pane.drawn()).match(/"type":"Svg"/g)?.length).toBe(2)

  await $.tool.call({ tool: tool('stills'), film: '/tmp/lumo-test-film', times: [1, 2] } as never)
  await pane.redraw()
  expect(await pane.find({ type: 'Text', text: /Check the frames/ })).toBeDefined()

  await $.tool.call({ tool: tool('finish'), film: '/tmp/lumo-test-film' } as never)
  await pane.redraw()
  expect(await pane.find({ type: 'Text', text: 'Your film is ready' })).toBeDefined()
  expect(await pane.find({ key: 'open' })).toBeDefined()
  await pane.unmount()

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ type: 'Text', text: /Ready/ })).toBeDefined()
  await terminal.unmount()
})
