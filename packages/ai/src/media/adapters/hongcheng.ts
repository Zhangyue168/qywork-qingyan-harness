/** hongcheng 的素材上传与视频请求结构；任务生命周期由 OpenAIVideosAdapter 负责。 */
import { mediaParamValues } from '@qywork/core'
import type { MediaModelSpec } from '../catalog.ts'
import { sendJson } from '../http.ts'
import { MediaError, type MediaRequest } from '../types.ts'

export async function hongchengVideoPayload(
  req: MediaRequest,
  spec: MediaModelSpec,
  base: string,
  auth: Record<string, string>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const references: Record<string, string[]> = {}
  const fields = {
    reference: 'reference_images',
    video: 'reference_videos',
    audio: 'reference_audios',
  }
  for (const input of req.inputs) {
    if (!(input.role in fields)) throw new MediaError('该模型不支持首尾帧输入；未提交生成')
  }
  for (const input of req.inputs) {
    const field = fields[input.role as keyof typeof fields]
    const endpoint = new URL('/refhost/upload', base).href
    let uploaded = ''
    await sendJson(
      endpoint,
      {
        method: 'POST',
        headers: { ...auth, 'content-type': input.mime, 'x-requested-with': 'XMLHttpRequest' },
        body: new Blob([input.bytes]),
      },
      signal,
      {
        stage: 'upload',
        validate(body) {
          const value = body.url ?? body.ref_url
          if (typeof value !== 'string' || !value.trim()) return '上传接口未返回素材地址'
          if (!value.startsWith('https://') && !/^\/(?!\/)/.test(value))
            return '上传接口未返回有效的 HTTPS 素材地址'
          try {
            const url = new URL(value, endpoint)
            if (url.protocol !== 'https:' || url.username || url.password)
              return '上传接口未返回有效的 HTTPS 素材地址'
            uploaded = url.href
          } catch {
            return '上传接口未返回有效的 HTTPS 素材地址'
          }
        },
      },
    )
    references[field] ??= []
    references[field].push(uploaded)
  }
  const params = mediaParamValues(spec.params, req.params)
  return { ...params, ratio: params.aspect_ratio, ...references }
}
