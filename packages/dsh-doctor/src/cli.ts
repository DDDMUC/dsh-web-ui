import { readFile } from 'node:fs/promises'
import { DOCTOR_PROTOCOL_VERSION } from './core/protocol.ts'
import { managedLaunch } from './agent/launch.ts'
import { DoctorSupervisor, runSupervisor } from './agent/supervisor.ts'
import { doctorPaths } from './agent/paths.ts'
import { callSupervisor } from './agent/ipc.ts'
import { servicePlan, writeServiceFiles, removeServiceFiles, runCommand } from './agent/service.ts'
import { provisionCapsule } from './agent/capsule.ts'

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const paths = doctorPaths(); const command = argv[0] ?? 'help'
  if (command === 'supervisor') { await runSupervisor(); return 0 }
  if (command === 'launch') { const token = (await readFile(paths.token, 'utf8')).trim(); return managedLaunch({ argv: argv.slice(1), endpoint: paths.socket, token }) }
  if (command === 'status') { const token = (await readFile(paths.token, 'utf8')).trim(); console.log(JSON.stringify(await callSupervisor(paths.socket, token, { protocol: DOCTOR_PROTOCOL_VERSION, type: 'status' }), null, 2)); return 0 }
  if (command === 'provision') { const dsh = process.env.DSH_DOCTOR_REAL_DSH || 'dsh'; const manifest = await provisionCapsule({ paths, dshExecutable: dsh, doctorSpec: process.env.DSH_DOCTOR_PACKAGE || '@linxin666/dsh-doctor@0.2.7', doctorPackageDir: process.env.DSH_DOCTOR_PACKAGE_DIR }); console.log(JSON.stringify(manifest, null, 2)); return 0 }
  if (command === 'service-plan' || command === 'service-install' || command === 'service-uninstall') { const plan = servicePlan({ platform: process.platform, label: 'com.dsh.doctor', executable: process.execPath, args: [process.argv[1]!, 'supervisor'], doctorHome: paths.root }); if (command === 'service-plan') console.log(JSON.stringify(plan, null, 2)); else if (command === 'service-install') { await writeServiceFiles(plan); await runCommand(plan.install) } else { await runCommand(plan.uninstall).catch(() => undefined); await removeServiceFiles(plan) } return 0 }
  console.log('Usage: dsh-doctor <supervisor|launch|status|provision|service-plan|service-install|service-uninstall> [dsh args...]')
  return command === 'help' || command === '--help' || command === '-h' ? 0 : 2
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) main().then(code => { process.exitCode = code }, error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })

export { DoctorSupervisor }
