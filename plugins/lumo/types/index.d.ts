export type LumoCheck = { name: string; ok: boolean }

export type LumoPhase = 'checking' | 'missing' | 'installing' | 'ready' | 'failed'

export type LumoSetup = {
  phase: LumoPhase
  checks: LumoCheck[]
  /** The step the installer is on, as it names it ("Speech model"). */
  step: string | null
  /** The step's download, 0 to 100, when it reports one. */
  percent: number | null
  /** The engine's last line worth showing. */
  note: string | null
  isDemo: boolean
}

export type LumoStageId = 'study' | 'plan' | 'build' | 'look' | 'render' | 'sound' | 'finish'

/** The film being made in this session, as the Lumo Film pane shows it. */
export type LumoFilm = {
  active: boolean
  done: boolean
  failed: string | null
  /** The film's folder, from lumo_new_film. */
  dir: string | null
  brief: string | null
  kind: 'footage' | 'launch' | null
  /** The furthest stage reached. */
  stage: LumoStageId
  /** A tool of the current stage is running. */
  busy: boolean
  note: string | null
  startedAt: number | null
  finishedAt: number | null
  /** The clock, ticked every second while the film is being made. */
  now: number | null
  /** The latest frames, a small JPEG as base64. */
  preview: string | null
  previewLabel: string | null
  /** How many times the frames were checked (lumo_stills). */
  passes: number
}

declare module 'claude-code' {
  interface PluginState {
    lumo: { setup: LumoSetup; film: LumoFilm }
  }
}
