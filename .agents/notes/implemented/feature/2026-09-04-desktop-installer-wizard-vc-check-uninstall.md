# Agent Note: desktop installer wizard, VC++ check, and uninstaller data cleanup prompt

Status: implemented

## Problem

1. The Windows NSIS installer was configured for silent one-click install without custom path selection (`oneClick: true`, `allowToChangeInstallationDirectory: false`), preventing users from choosing an alternative installation drive (e.g., D:).
2. Clean Windows installations lacking Visual C++ Redistributable 2015–2022 crashed on startup because the bundled Node.js executable requires `vcruntime140.dll` / `msvcp140.dll`. There was no pre-installation detection or startup warning guiding users to install the prerequisite.
3. The uninstaller silently removed the application binary folder without offering users the option to clean or retain their personal conversation data and credentials in `$PROFILE\.dsh` and `%APPDATA%\dsh-desktop`.

## Decision

1. **Custom Installation Wizard**:
   - Updated `desktop/electron-builder.yml` with `oneClick: false`, `allowToChangeInstallationDirectory: true`, `allowElevation: true`, and `createDesktopShortcut: always`.
   - Enabled bilingual installer UI (`zh_CN`, `en_US`).
2. **VC++ Runtime Detection**:
   - Added NSIS `customInit` macro in `desktop/build/installer.nsh` to check `HKLM\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64` and `System32\vcruntime140.dll`. When missing, prompts the user and launches the official download link (`https://aka.ms/vs/17/release/vc_redist.x64.exe`).
   - Added runtime helper `checkVcRuntime` in `desktop/src/runtime.cjs` and integrated it into `desktop/src/main.cjs` `boot()` to warn and offer download for portable/zip distributions as well.
3. **Uninstaller Data Cleanup Prompt**:
   - Added NSIS `customUnInstall` macro in `desktop/build/installer.nsh` to prompt the user with a Yes/No dialog:
     - Selecting Yes thoroughly cleans `$PROFILE\.dsh` and `%APPDATA%\dsh-desktop`.
     - Selecting No preserves personal conversation and key data.

## Testing

- Unit tests (`node --test "tests/*.test.mjs"` in `desktop/`): added unit test for `checkVcRuntime` verifying platform handling and presence/absence of `vcruntime140.dll`. All 14 tests pass.
- Verified NSIS syntax and packaging script structure.
- Rebuilt and hot-deployed `app.asar` locally.

## Consequences

- Users gain full control over installation location.
- Fresh Windows machines lacking VC++ runtimes receive clear detection and one-click download guidance.
- Users can choose whether to preserve or completely remove personal data upon uninstallation.
