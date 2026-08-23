/**
 * Host half of the in-GUI skin center: mounts the `/api/skin-center/*` routes
 * the browser half uses for the skin catalog, the active selection and
 * one-click apply / restore-official (v2, issue #506). Skins are pure asset
 * directories served through the safety pipeline; switching is a client-side
 * atomic swap and never touches `cordis.patch.yml`. Try-on stays pure
 * browser work (see src/client/runtime/skin-controller.ts).
 * @module @linxin666/dsh-client-ui-skin-center
 */

import { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
// Type-only: pulls the dsh-host-webserver service seat (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { makeSkinCenterV2Routes } from './routes-v2.ts'
import { makeSkinIndexRows, makeSkinIndexTap } from './tap-index-adapter.ts'
import { defaultActiveStatePath, readActiveSelection, seedDefaultActiveSkin } from './active-state.ts'
import { migrateBackgroundFromSettings } from './background-migration.ts'
import { migrateLegacySelection } from './legacy-bridge.ts'
import { SKIN_BACKGROUND_DEFAULTS, type SkinBackgroundConfig } from './core/background.ts'
import { findSkin, loadSkinCatalog } from './skin-repo.ts'
import { makeWeRoutes } from './we-routes.ts'
import { defaultWallpapersStoreDir } from './we-library.ts'
import { resolveHarnessHome } from './harness-home.ts'
import { mountOnce } from './mount-once.ts'
import {
  CUSTOM_THEME_DEFAULTS,
  CUSTOM_THEME_VERSION,
  SKIN_CUSTOM_THEME_NS,
  type CustomThemeConfig,
} from './core/custom-theme.ts'

export { makeSkinCenterV2Routes, SKIN_CENTER_V2_PREFIX } from './routes-v2.ts'