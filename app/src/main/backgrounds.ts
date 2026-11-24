import { randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { extname, join, resolve, sep } from 'node:path'
import { PHASES, type BackgroundSet, type Phase } from '@shared/types'
import { writeJson } from './store'

export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif']

const BUILT_INS = [
  { id: 'builtin-logo', name: 'Toastmasters – Logo', folder: 'logo' },
  { id: 'builtin-wordmark', name: 'Toastmasters – Wordmark', folder: 'wordmark' }
]

const EMPTY_FILES: Record<Phase, string> = { neutral: '', green: '', yellow: '', red: '' }

/**
 * Background sets live in `<userData>/backgrounds/<setId>/`. Uploaded images are
 * copied there, so OBS never points at a file the user might later move or delete.
 */
export class BackgroundLibrary {
  readonly root: string
  private readonly indexFile: string
  private custom: BackgroundSet[]

  constructor(userData: string, private readonly defaultSetsDir: string) {
    this.root = join(userData, 'backgrounds')
    mkdirSync(this.root, { recursive: true })
    this.indexFile = join(this.root, 'sets.json')
    this.custom = this.readIndex()
    this.installBuiltIns()
  }

  list(): BackgroundSet[] {
    return [...this.builtIns(), ...this.custom]
  }

  get(id: string): BackgroundSet | undefined {
    return this.list().find((s) => s.id === id)
  }

  isComplete(set: BackgroundSet): boolean {
    return PHASES.every((p) => set.files[p] && existsSync(set.files[p]))
  }

  create(name: string): BackgroundSet {
    const set: BackgroundSet = { id: randomUUID(), name: name.trim() || 'My backgrounds', builtIn: false, files: { ...EMPTY_FILES } }
    mkdirSync(join(this.root, set.id), { recursive: true })
    this.custom.push(set)
    this.save()
    return set
  }

  rename(id: string, name: string): void {
    const set = this.mustGetCustom(id)
    set.name = name.trim() || set.name
    this.save()
  }

  delete(id: string): void {
    this.mustGetCustom(id)
    rmSync(join(this.root, id), { recursive: true, force: true })
    this.custom = this.custom.filter((s) => s.id !== id)
    this.save()
  }

  /** Copies `source` into the set's folder for the given phase. */
  setImage(id: string, phase: Phase, source: string): BackgroundSet {
    const set = this.mustGetCustom(id)
    const ext = extname(source).slice(1).toLowerCase()
    if (!IMAGE_EXTENSIONS.includes(ext)) {
      throw new Error(`Unsupported image type ".${ext}". Use ${IMAGE_EXTENSIONS.join(', ')}.`)
    }
    if (!existsSync(source)) throw new Error(`File not found: ${source}`)
    // A new file name on every upload makes OBS reload the image instead of using its cache.
    const dest = join(this.root, id, `${phase}-${Date.now()}.${ext}`)
    copyFileSync(source, dest)
    const old = set.files[phase]
    set.files[phase] = dest
    this.save()
    if (old && old !== dest && this.isInside(old)) rmSync(old, { force: true })
    return set
  }

  /** True when `path` is inside the backgrounds folder (used by the preview protocol). */
  isInside(path: string): boolean {
    return resolve(path).startsWith(this.root + sep)
  }

  private builtIns(): BackgroundSet[] {
    return BUILT_INS.map((b) => ({
      id: b.id,
      name: b.name,
      builtIn: true,
      files: Object.fromEntries(PHASES.map((p) => [p, join(this.root, b.id, `${p}.jpg`)])) as Record<Phase, string>
    }))
  }

  private installBuiltIns(): void {
    for (const b of BUILT_INS) {
      const dir = join(this.root, b.id)
      mkdirSync(dir, { recursive: true })
      for (const p of PHASES) {
        const dest = join(dir, `${p}.jpg`)
        const src = join(this.defaultSetsDir, b.folder, `${p}.jpg`)
        if (!existsSync(dest) && existsSync(src)) copyFileSync(src, dest)
      }
    }
  }

  private mustGetCustom(id: string): BackgroundSet {
    const set = this.custom.find((s) => s.id === id)
    if (!set) throw new Error(this.get(id) ? 'Built-in sets cannot be changed. Create your own set instead.' : 'Set not found')
    return set
  }

  private readIndex(): BackgroundSet[] {
    try {
      const sets = JSON.parse(readFileSync(this.indexFile, 'utf8')) as BackgroundSet[]
      return sets.map((s) => ({ ...s, builtIn: false, files: { ...EMPTY_FILES, ...s.files } }))
    } catch {
      return []
    }
  }

  private save(): void {
    writeJson(this.indexFile, this.custom)
  }
}
