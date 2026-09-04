import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RESERVED_PORTS,
  DESKTOP_PORT_BASE,
  DESKTOP_PORT_SPAN,
  resolveRuntimePaths,
  resolveDshHome,
  childEnv,
  profileAction,
  applyProfileSeed,
  parseShasums,
  parseTokenUrlLine,
  findHostPort,
  isPortFree,
  SEED_MARKER,
} = require('../src/runtime.cjs');

function listenOn(port) {
  const server = net.createServer();
  return new Promise((resolvePromise) => {
    server.listen(port, '127.0.0.1', () => resolvePromise(server));
  });
}

test('resolveRuntimePaths picks the platform node binary', () => {
  const mac = resolveRuntimePaths('/res', 'darwin', 'arm64');
  assert.equal(mac.nodeBin, path.join('/res', 'runtime', 'node', 'bin', 'node'));
  const win = resolveRuntimePaths('C:\\res', 'win32', 'x64');
  assert.equal(win.nodeBin, path.join('C:\\res', 'runtime', 'node', 'node.exe'));
  assert.ok(mac.hostBin.endsWith(path.join('@deepseek-ai', 'dsh', 'lib', 'bin.js')));
});

test('resolveRuntimePaths keeps the per-platform dir unpackaged (electron-builder os spelling)', () => {
  const dev = resolveRuntimePaths('/res', 'darwin', 'arm64', false);
  assert.equal(dev.nodeBin, path.join('/res', 'runtime', 'node-mac-arm64', 'bin', 'node'));
  const devWin = resolveRuntimePaths('/res', 'win32', 'x64', false);
  assert.equal(devWin.nodeBin, path.join('/res', 'runtime', 'node-win-x64', 'node.exe'));
});

test('resolveDshHome follows the host lookup order', () => {
  assert.equal(resolveDshHome({}, '/home/u'), path.join('/home/u', '.dsh'));
  assert.equal(resolveDshHome({ DSH_HOME: '' }, '/home/u'), path.join('/home/u', '.dsh'));
  assert.equal(resolveDshHome({ DSH_HOME: '~/custom' }, '/home/u'), path.join('/home/u', 'custom'));
  assert.equal(resolveDshHome({ DSH_HOME: '/data/dsh' }, '/home/u'), path.resolve('/data/dsh'));
});

test('childEnv normalizes PATH across platforms and case variants', () => {
  // On POSIX
  const posix = childEnv('/home/u/.dsh', '/opt/node', 'linux', {
    PATH: '/usr/bin:/bin',
    FOO: 'bar',
  });
  assert.equal(posix.DSH_HOME, '/home/u/.dsh');
  assert.equal(posix.PATH, '/opt/node/bin:/usr/bin:/bin');
  assert.equal(posix.FOO, 'bar');
  assert.equal(posix.ELECTRON_RUN_AS_NODE, undefined);

  // On Windows with lowercase/mixed-case Path
  const win = childEnv('C:\\Users\\u\\.dsh', 'C:\\runtime\\node', 'win32', {
    Path: 'C:\\Windows\\System32;C:\\Windows',
    FOO: 'baz',
  });
  assert.equal(win.DSH_HOME, 'C:\\Users\\u\\.dsh');
  assert.equal(win.PATH, 'C:\\runtime\\node;C:\\Windows\\System32;C:\\Windows');
  assert.equal(win.Path, undefined, 'Path case variant should be removed');
  assert.equal(win.path, undefined);
  assert.equal(win.FOO, 'baz');

  // On Windows with empty/missing PATH
  const winEmpty = childEnv('C:\\Users\\u\\.dsh', 'C:\\runtime\\node', 'win32', {});
  assert.equal(winEmpty.PATH, 'C:\\runtime\\node');
});

test('profileAction seeds missing, leaves user-managed, reseeds stale', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-profile-action-'));
  const profile = path.join(dir, 'web');
  assert.equal(profileAction(profile, 's1'), 'seed');

  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'package.json'), '{}');
  assert.equal(profileAction(profile, 's1'), 'leave', 'no marker means user-managed');

  fs.writeFileSync(path.join(profile, SEED_MARKER), JSON.stringify({ stamp: 's1' }));
  assert.equal(profileAction(profile, 's1'), 'leave', 'current stamp is up to date');
  assert.equal(profileAction(profile, 's2'), 'reseed', 'moved stamp triggers reseed');
});

test('applyProfileSeed keeps the user patch layer on reseed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-seed-'));
  const seed = path.join(dir, 'seed');
  const profile = path.join(dir, 'web');
  fs.mkdirSync(path.join(seed, 'node_modules', 'pkg'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'package.json'), '{"name":"dsh-profile-web"}');
  fs.writeFileSync(path.join(seed, 'cordis.patch.yml'), '[]\n');
  fs.writeFileSync(path.join(seed, 'node_modules', 'pkg', 'index.js'), 'v1');

  applyProfileSeed(seed, profile, 'seed', 's1', { appVersion: '0.1.0' });
  assert.equal(fs.readFileSync(path.join(profile, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'v1');

  // User edits the patch layer; the seed moves to a new node_modules payload.
  fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), '- insert: []\n');
  fs.writeFileSync(path.join(seed, 'node_modules', 'pkg', 'index.js'), 'v2');

  applyProfileSeed(seed, profile, 'reseed', 's2', { appVersion: '0.1.1' });
  assert.equal(fs.readFileSync(path.join(profile, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'v2');
  assert.equal(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'), '- insert: []\n', 'user patch survives');
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile, SEED_MARKER), 'utf8')).stamp, 's2');
});

test('parseShasums parses SHASUMS256.txt lines', () => {
  const text = 'a'.repeat(64) + '  node-v24.20.0-darwin-arm64.tar.gz\n' + 'b'.repeat(64) + '  node-v24.20.0-win-x64.zip\n';
  const map = parseShasums(text);
  assert.equal(map.get('node-v24.20.0-darwin-arm64.tar.gz'), 'a'.repeat(64));
  assert.equal(map.get('node-v24.20.0-win-x64.zip'), 'b'.repeat(64));
  assert.equal(map.size, 2);
});

test('parseTokenUrlLine extracts the host token URL', () => {
  assert.equal(
    parseTokenUrlLine('dsh web: http://127.0.0.1:34981/?token=abc-DEF_123'),
    'http://127.0.0.1:34981/?token=abc-DEF_123');
  assert.equal(parseTokenUrlLine('[desktop] boot failed'), undefined);
});

test('the reserved set is exactly the plain dsh web CLI defaults', () => {
  assert.deepEqual([...RESERVED_PORTS].sort((a, b) => a - b), [3080, 3081]);
  assert.equal(DESKTOP_PORT_BASE, 3082);
  assert.equal(DESKTOP_PORT_SPAN, 100);
});

test('isPortFree sees an open listener as occupied', async () => {
  const blocker = await listenOn(0);
  const port = blocker.address().port;
  try {
    assert.equal(await isPortFree(port), false);
    assert.notEqual(await findHostPort(), port);
  } finally {
    await new Promise((resolvePromise) => blocker.close(resolvePromise));
  }
});

test('findHostPort serves the dedicated range above the reserved pair', async () => {
  const port = await findHostPort();
  assert.ok(port >= DESKTOP_PORT_BASE && port < DESKTOP_PORT_BASE + DESKTOP_PORT_SPAN,
    `expected a port in the dedicated range, got ${port}`);
  assert.equal(await isPortFree(port), true, 'the returned port must be immediately bindable');
});

test('findHostPort skips an occupied dedicated port and never returns a reserved one', async () => {
  const first = await findHostPort();
  const blocker = await listenOn(first);
  try {
    const second = await findHostPort();
    assert.notEqual(second, first);
    assert.equal(RESERVED_PORTS.has(second), false);
  } finally {
    await new Promise((resolvePromise) => blocker.close(resolvePromise));
  }
});
