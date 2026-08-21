import { createMemoryFs } from './src/core/fs.ts'
import { diagnoseAndPlan } from './src/core/recover.ts'

const fs = createMemoryFs()
const home = '/h'
await fs.mkdir(home + '/profiles/web', { recursive: true })
await fs.writeText(home + '/profiles/web/package.json', JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base'] } }, name: 'web' }))
await fs.writeText(home + '/profiles/web/cordis.patch.yml', '[]\n')
const outcome = await diagnoseAndPlan({ home, profile: 'web', dshPath: '/fake', fs, allowLive: true })
console.log(JSON.stringify(outcome.diagnostics, null, 2))
