import { describe, expect, it } from 'vitest'
import { servicePlan } from '../src/agent/service.ts'

const base = { label: 'com.dsh.doctor', executable: '/usr/local/bin/node', args: ['/usr/local/lib/cli.js', 'supervisor'], doctorHome: '/Users/u/.dsh-doctor' }

describe('service adapters', () => {
  it('renders a macOS LaunchAgent', () => {
    const plan = servicePlan({ ...base, platform: 'darwin' }, { HOME: '/Users/u' })
    expect(plan.files[0]!.path).toBe('/Users/u/Library/LaunchAgents/com.dsh.doctor.plist')
    expect(plan.files[0]!.content).toContain('<key>Label</key>')
    expect(plan.files[0]!.content).toContain('RunAtLoad')
    expect(plan.files[0]!.content).toContain('KeepAlive')
    expect(plan.install[0]).toBe('launchctl')
    expect(plan.install[1]).toBe('bootstrap')
  })

  it('escapes XML entities in LaunchAgent paths', () => {
    const plan = servicePlan({ ...base, executable: '/Users/Anders & Co/node', doctorHome: '/Users/Anders & Co/.dsh-doctor', platform: 'darwin' }, { HOME: '/Users/Anders & Co' })
    expect(plan.files[0]!.content).toContain('Anders &amp; Co')
  })

  it('renders a systemd user unit with restart policy', () => {
    const plan = servicePlan({ ...base, platform: 'linux' }, { XDG_CONFIG_HOME: '/home/u/.config' })
    expect(plan.files[0]!.path).toBe('/home/u/.config/systemd/user/com.dsh.doctor.service')
    expect(plan.files[0]!.content).toContain('[Service]')
    expect(plan.files[0]!.content).toContain('Restart=on-failure')
    expect(plan.files[0]!.content).toContain('NoNewPrivileges=true')
    expect(plan.install[0]).toBe('systemctl')
  })

  it('renders a per-user Windows scheduled task', () => {
    const plan = servicePlan({ ...base, platform: 'win32' }, { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' })
    expect(plan.files[0]!.path).toContain('DSH Doctor')
    expect(plan.files[0]!.content).toContain('@echo off')
    expect(plan.install[0]).toBe('schtasks')
    expect(plan.install[1]).toBe('/Create')
  })

  it('rejects unknown platforms', () => {
    expect(() => servicePlan({ ...base, platform: 'freebsd' as never })).toThrow(/unsupported service platform/)
  })
})
