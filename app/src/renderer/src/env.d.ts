import type { TimerApi } from '@shared/types'

declare global {
  interface Window {
    api: TimerApi
  }
}
