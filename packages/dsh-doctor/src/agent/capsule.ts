import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { DoctorPaths } from './paths.ts'

export interface CapsuleManifest { schemaVersion: 1; createdAt: string; dshExecutable: string; dshVersion: string; doctorPackage: string; rescueHome: string; status: 'staging' | 'verified' | 'failed' }
export interface CapsuleOptions { paths: DoctorPaths; dshExecutable: string; doctorSpec: string; doctorPackageDir?: string; now?: () => string; run?: typeof run }

async function run(command: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 6 * 60_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolvePromise, reject) => { const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = ''; child.stdout.on('data', b => { stdout += b }); child.stderr.on('data', b => { stderr += b }); const timer = setTimeout(() => child.kill(), timeoutMs); child.once('error', reject); child.once('close', code => { clearTimeout(timer); resolvePromise({ code: code ?? 1, stdout, stderr }) }) })
}

export async function provisionCapsule(options: CapsuleOptions): Promise<CapsuleManifest> {
  const current = join(options.paths.capsule, 'current'), staging = join(options.paths.capsule, `staging-${process.pid}-${Date.now()}`), previous = join(options.paths.capsule, 'previous')
  await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true, mode: 0o700 })
  const rescueHome = join(staging, 'rescue-home'); const env = { ...process.env, DSH_HOME: rescueHome, DSH_TELEMETRY_DISABLED: '1' }
  const executor = options.run ?? run
  const version = await executor(options.dshExecutable, ['--version'], env)
  if (version.code !== 0) throw new Error(`doctor: cannot probe dsh: ${version.stderr}`)
  const doctorSpec = options.doctorPackageDir ? `link:${resolve(options.doctorPackageDir)}` : options.doctorSpec
  const install = await executor(options.dshExecutable, ['plugin', '--profile', 'web', 'add', doctorSpec], env)
  if (install.code !== 0) throw new Error(`doctor: rescue Doctor install failed: ${install.stderr}`)
  const dump = await executor(options.dshExecutable, ['--profile', 'web', '--dump-config'], env)
  if (dump.code !== 0 || !dump.stdout.includes('doctor')) throw new Error(`doctor: rescue profile verification failed: ${dump.stderr}`)
  const manifest: CapsuleManifest = { schemaVersion: 1, createdAt: (options.now ?? (() => new Date().toISOString()))(), dshExecutable: resolve(options.dshExecutable), dshVersion: version.stdout.trim(), doctorPackage: doctorSpec, rescueHome, status: 'verified' }
  await writeFile(join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  await rm(previous, { recursive: true, force: true }); try { await cp(current, previous, { recursive: true }) } catch {}
  await rm(current, { recursive: true, force: true }); await cp(staging, current, { recursive: true }); await rm(staging, { recursive: true, force: true })
  manifest.rescueHome = join(current, 'rescue-home'); await writeFile(join(current, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 })
  return manifest
}
export async function capsuleFingerprint(paths: DoctorPaths): Promise<string> { return createHash('sha256').update(await readFile(join(paths.capsule, 'current', 'manifest.json'))).digest('hex') }
