export const api = window.api

/** Strips Electron's "Error invoking remote method 'api:x': Error: " prefix. */
export function errorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
}

export function imageUrl(path: string): string {
  return path ? `tmbg://img/?p=${encodeURIComponent(path)}` : ''
}

export function prettyHotkey(accel: string): string {
  const mac = navigator.platform.toLowerCase().includes('mac')
  return accel
    .replace(/CommandOrControl|CmdOrCtrl/g, mac ? '⌘' : 'Ctrl')
    .replace(/Shift/g, mac ? '⇧' : 'Shift')
    .replace(/Alt|Option/g, mac ? '⌥' : 'Alt')
    .replace(/\+/g, mac ? '' : '+')
}
