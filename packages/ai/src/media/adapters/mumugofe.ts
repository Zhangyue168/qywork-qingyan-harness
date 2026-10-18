/** Mumugofe 的原图上传与回执校验；任务生命周期仍由 OpenAIVideosAdapter 负责。 */
import { createHash } from 'node:crypto'
import { sendJson } from '../http.ts'
import type { MediaInput } from '../types.ts'

export async function uploadMumugofeReference(
  input: MediaInput,
  base: string,
  auth: Record<string, string>,
  signal: AbortSignal,
): Promise<string> {
  const digest = createHash('sha256').update(input.bytes).digest('hex')
  let uploaded = ''
  await sendJson(
    `${base}/studio/assets/${digest}`,
    {
      method: 'PUT',
      headers: { ...auth, 'content-type': input.mime },
      body: new Blob([input.bytes]),
      redirect: 'error',
    },
    signal,
    {
      stage: 'upload',
      validate(body) {
        const asset = body.asset as { id?: unknown; sha256?: unknown; bytes?: unknown } | undefined
        const url = typeof body.url === 'string' ? URL.parse(body.url) : null
        if (
          !asset ||
          asset.sha256 !== digest ||
          asset.bytes !== input.bytes.length ||
          typeof asset.id !== 'string' ||
          !new RegExp(`^studioasset_[a-f0-9]{64}_${digest}$`).test(asset.id) ||
          !url ||
          !['https:', 'http:'].includes(url.protocol) ||
          url.origin !== new URL(base).origin ||
          url.username ||
          url.password ||
          url.hash ||
          url.pathname !== `/v1/studio/assets/${asset.id}/artifacts/source/content` ||
          !url.search
        )
          return '参考图上传后的文件或地址校验失败'
        uploaded = url.href
      },
    },
  )
  return uploaded
}
