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

declare module 'claude-code' {
  interface PluginState {
    lumo: { setup: LumoSetup }
  }
}
