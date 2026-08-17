/**
 * PLACEHOLDER — replaced by the real PKG/TEX decoder (parallel task).
 * Keeps the host bundle buildable while the decoder lands.
 * @module @linxin666/dsh-client-ui-skin-center/pkg-extract
 */

/** Decoded main-image payload of a scene package. */
export interface SceneMainImage {
  width: number
  height: number
  png: Buffer
  texturePath: string
}

/** Placeholder: always fails until the real decoder lands. */
export function extractSceneMainImage(_data: Uint8Array): SceneMainImage {
  throw new Error('pkg-extract: decoder not available yet')
}
