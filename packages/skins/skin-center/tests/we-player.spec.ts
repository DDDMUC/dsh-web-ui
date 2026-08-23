/**
 * Source-level guards for the WE scene player runtime (src/we-player-source.ts).
 * The player is a self-contained HTML string, so these tests pin the
 * reflection contract that pkg-extract's manifest feeds: the water line and
 * the reflection quad must follow scene data, not hard-coded constants (#742).
 * @module @linxin666/dsh-client-ui-skin-center/tests/we-player
 */

import { describe, expect, it } from 'vitest'

import { WE_SCENE_PLAYER_HTML } from '../src/we-player-source.ts'

describe('WE scene player reflection pass (#742)', () => {
  it('drives the water line and sample window from uniforms, not constants', () => {
    expect(WE_SCENE_PLAYER_HTML).toContain('uniform float u_waterLine;')
    expect(WE_SCENE_PLAYER_HTML).toContain('uniform vec2 u_reflectRange;')
    expect(WE_SCENE_PLAYER_HTML).toContain('uniform vec4 u_rect;')
    expect(WE_SCENE_PLAYER_HTML).not.toContain('v_uv.y < 0.65')
    expect(WE_SCENE_PLAYER_HTML).not.toContain('0.42 + puddleDepth * 0.38')
  })

  it('recovers explicitly after theme changes and reloads after context restoration', () => {
    expect(WE_SCENE_PLAYER_HTML).toContain("canvas.addEventListener('webglcontextlost'")
    expect(WE_SCENE_PLAYER_HTML).toContain("canvas.addEventListener('webglcontextrestored'")
    expect(WE_SCENE_PLAYER_HTML).toContain("msg.type === 'dsh-recover-renderer'")
    expect(WE_SCENE_PLAYER_HTML).toContain("type: 'dsh-scene-needs-reload'")
  })

  it('uses the 3D-only renderer only when the scene contains actual models', () => {
    expect(WE_SCENE_PLAYER_HTML).toContain('sceneData.is3D && sceneData.models && sceneData.models.length > 0')
    expect(WE_SCENE_PLAYER_HTML).not.toContain('if (sceneData.is3D) {')
  })

  it('composites serialized front-to-back image layers in reverse draw order', () => {
    expect(WE_SCENE_PLAYER_HTML).toContain('const renderLayers = sceneData.layers.slice().reverse();')
    expect(WE_SCENE_PLAYER_HTML).toContain('for (const layer of renderLayers)')
    expect(WE_SCENE_PLAYER_HTML).not.toContain('for (const layer of sceneData.layers)')
  })

  it('draws the reflection quad at the layer rect instead of forcing fullscreen', () => {
    expect(WE_SCENE_PLAYER_HTML).not.toContain('mat4Transform2D(sceneW / 2, sceneH / 2, sceneW, sceneH, 0)')
    expect(WE_SCENE_PLAYER_HTML).toContain("gl.getUniformLocation(progReflection, 'u_waterLine')")
    // Legacy manifests without a water line keep the historical default.
    expect(WE_SCENE_PLAYER_HTML).toContain("typeof layer.waterLine === 'number' ? layer.waterLine : 0.65")
  })
})
