/** hongcheng：覆盖模型目录、运行时校验、原始素材上传、视频提交、计量与任务取回。 */
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { findMediaModel, lookupMediaModel, mediaCatalog, quoteMedia } from '@qywork/ai'
import type { MediaSpend } from '@qywork/core'
import type { QyConfig } from './config.ts'
import { makeMediaPort } from './media.ts'

const MODEL = 'TTseadanco2.5-720'
const MODELS = [
  { id: MODEL, min: 5, defaultSeconds: '5', rate: 0.42, resolution: '720p' },
  { id: 'TTsedanco2.5-480', min: 5, defaultSeconds: '5', rate: 0.312, resolution: '480p' },
]
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])
const WAV = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])
const inputs = [
  { role: 'reference' as const, bytes: PNG, mime: 'image/png', path: '/image.png' },
  { role: 'video' as const, bytes: MP4, mime: 'video/mp4', path: '/video.mp4' },
  { role: 'audio' as const, bytes: WAV, mime: 'audio/wav', path: '/audio.wav' },
]
interface Seen {
  path: string
  method: string
  auth: string | null
  mime: string | null
  xhr: string | null
  bytes?: Uint8Array
  body?: Record<string, unknown>
}
let server: ReturnType<typeof Bun.serve>
let seen: Seen[]
let uploadStatus: number
let uploadBody: Record<string, unknown> | undefined
let poll: Record<string, unknown>
let contentStatus: number
beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const entry: Seen = {
        path,
        method: req.method,
        auth: req.headers.get('authorization'),
        mime: req.headers.get('content-type'),
        xhr: req.headers.get('x-requested-with'),
      }
      seen.push(entry)
      if (path === '/refhost/upload') {
        entry.bytes = new Uint8Array(await req.arrayBuffer())
        return Response.json(uploadBody ?? { url: `https://assets.example/${seen.length}` }, {
          status: uploadStatus,
        })
      }
      if (req.method === 'POST' && path === '/v1/videos') {
        entry.body = (await req.json()) as Record<string, unknown>
        return Response.json({ id: 'task_hongcheng', status: 'queued' })
      }
      if (path === '/v1/videos/task_hongcheng/content')
        return new Response(contentStatus === 200 ? MP4 : 'unavailable', {
          status: contentStatus,
          headers: { 'content-type': 'video/mp4' },
        })
      if (path === '/v1/videos/task_hongcheng') return Response.json(poll)
      return new Response('unexpected route', { status: 400 })
    },
  })
})
afterAll(() => server.stop(true))
beforeEach(() => {
  seen = []
  uploadStatus = 200
  uploadBody = undefined
  poll = { status: 'completed', seconds: '5' }
  contentStatus = 200
})
const config = (suffix = '', model = MODEL): QyConfig => ({
  providers: {
    hongcheng: {
      kind: 'openai_chat_completions',
      apiKey: 'test-only-key',
      baseUrl: `http://127.0.0.1:${server.port}${suffix}`,
      models: {},
      media: { [model]: { kind: 'openai_videos' } },
    },
  },
  mediaDefaults: { video: { provider: 'hongcheng', model } },
})
const call = () => ({
  type: 'video' as const,
  prompt: '@Image1 @Video1 @Audio1',
  inputs: [],
  params: {},
})
const signal = () => new AbortController().signal

test('hongcheng 目录仅保留 TT 系列，移除失效型号规格', () => {
  expect(
    mediaCatalog()
      .filter((model) => model.vendor === 'hongcheng')
      .map((model) => model.id),
  ).toEqual(MODELS.map((model) => model.id))
  for (const id of ['seedance-2.5（YX）', 'seedance2.5-yx-count', 'wf-sd2.5-v2']) {
    expect(findMediaModel(id)).toBeUndefined()
    expect(lookupMediaModel(id, 'openai_videos').videoFormat).toBeUndefined()
  }
})

test.each(MODELS)('型号不接受其他分辨率，拒绝发生在上传之前：$id', async ({ id, resolution }) => {
  const result = await makeMediaPort(config('', id)).generate(
    { ...call(), inputs, params: { resolution: resolution === '720p' ? '480p' : '720p' } },
    signal(),
  )
  expect(result).toMatchObject({ ok: false, executed: false })
  expect(seen).toEqual([])
})

test.each(MODELS)('渠道模型以 ID 显示并登记独立能力，其他协议不继承规格：$id', ({ id }) => {
  expect(findMediaModel(id)).toMatchObject({
    displayName: id,
    vendor: 'hongcheng',
    videoFormat: 'hongcheng',
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10 },
    mention: { image: '@Image{n}', video: '@Video{n}', audio: '@Audio{n}' },
  })
  expect(lookupMediaModel(id, 'ark_videos').catalogued).toBe(false)
})

test.each(MODELS)(
  '报价按渠道计费单位计算，省略时长使用模型默认值：$id',
  ({ id, min, defaultSeconds, rate }) => {
    const spec = findMediaModel(id)!
    for (const seconds of [undefined, String(min), '10', '30']) {
      const quote = quoteMedia(spec, seconds ? { seconds } : {}, { images: 1, videos: 0 })
      expect(quote?.currency).toBe('CNY')
      expect(quote?.cost).toBeCloseTo(Number(seconds ?? defaultSeconds) * rate, 10)
    }
  },
)

test.each(MODELS)(
  '默认参数提交准确模型 ID 与分辨率，按响应秒数记账：$id',
  async ({ id, defaultSeconds, rate, resolution }) => {
    const spends: MediaSpend[] = []
    const result = await makeMediaPort(config('', id), (spend) => spends.push(spend)).generate(
      call(),
      signal(),
    )
    expect(result).toMatchObject({ ok: true, files: [{ bytes: MP4, mime: 'video/mp4' }] })
    expect(seen[0]?.body).toEqual({
      model: id,
      prompt: call().prompt,
      seconds: defaultSeconds,
      resolution,
      aspect_ratio: '16:9',
      ratio: '16:9',
    })
    expect(spends[0]).toMatchObject({ quantity: 5, currency: 'CNY' })
    expect(spends[0]?.cost).toBeCloseTo(5 * rate, 10)
  },
)

test.each(MODELS)('时长下限可提交，低于下限或超过上限时不上传：$id', async ({ id, min }) => {
  const port = makeMediaPort(config('', id))
  for (const seconds of [String(min - 1), '31']) {
    expect(await port.generate({ ...call(), inputs, params: { seconds } }, signal())).toMatchObject(
      {
        ok: false,
        executed: false,
      },
    )
  }
  expect(seen).toEqual([])
  expect((await port.generate({ ...call(), params: { seconds: String(min) } }, signal())).ok).toBe(
    true,
  )
  expect(seen[0]?.body?.seconds).toBe(String(min))
})

test.each(['', '/v1'])('默认参数提交并按接口回报秒数计量，地址后缀=%s', async (suffix) => {
  const spends: MediaSpend[] = []
  const result = await makeMediaPort(config(suffix), (spend) => spends.push(spend)).generate(
    call(),
    signal(),
  )
  expect(result).toMatchObject({ ok: true, files: [{ bytes: MP4, mime: 'video/mp4' }] })
  expect(seen[0]?.body).toEqual({
    model: MODEL,
    prompt: call().prompt,
    seconds: '5',
    resolution: '720p',
    aspect_ratio: '16:9',
    ratio: '16:9',
  })
  expect(spends[0]).toMatchObject({ quantity: 5, cost: 2.1, currency: 'CNY' })
  expect(seen.every((entry) => entry.auth === 'Bearer test-only-key')).toBe(true)
})

test.each(MODELS)(
  '三类素材按原始 MIME 和字节上传，URL 按同类顺序提交：$id',
  async ({ id, resolution }) => {
    const references = [inputs[0]!, inputs[1]!, inputs[0]!, inputs[2]!]
    const tasks: unknown[] = []
    const result = await makeMediaPort(config('/v1', id)).generate(
      {
        ...call(),
        inputs: references,
        params: { seconds: '30', aspect_ratio: '9:16' },
        onSubmit: () =>
          expect(seen.map((entry) => entry.path)).toEqual(Array(4).fill('/refhost/upload')),
        onTask: (task) => {
          tasks.push(task)
        },
      },
      signal(),
    )
    expect(result.ok).toBe(true)
    expect(seen.slice(0, 4).map((entry) => ({ bytes: entry.bytes, mime: entry.mime }))).toEqual(
      references.map((input) => ({ bytes: input.bytes, mime: input.mime })),
    )
    expect(seen.slice(0, 4).every((entry) => entry.xhr === 'XMLHttpRequest')).toBe(true)
    expect(seen[4]?.body).toEqual({
      model: id,
      prompt: call().prompt,
      seconds: '30',
      resolution,
      aspect_ratio: '9:16',
      ratio: '9:16',
      reference_images: ['https://assets.example/1', 'https://assets.example/3'],
      reference_videos: ['https://assets.example/2'],
      reference_audios: ['https://assets.example/4'],
    })
    expect(tasks).toEqual([{ provider: 'hongcheng', model: id, taskId: 'task_hongcheng' }])
  },
)

test.each([
  { seconds: 5 },
  { seconds: '4' },
  { seconds: '31' },
  { resolution: '1080p' },
  { aspect_ratio: '21:9' },
  { duration: 5 },
])('不支持的参数在上传和提交前拒绝：%j', async (params) => {
  expect(
    await makeMediaPort(config()).generate({ ...call(), inputs, params }, signal()),
  ).toMatchObject({ ok: false, executed: false })
  expect(seen).toEqual([])
})

test.each([
  [0, 31],
  [1, 11],
  [2, 11],
] as const)('超出素材数量上限时拒绝：类别=%i 数量=%i', async (index, count) => {
  expect(
    await makeMediaPort(config()).generate(
      { ...call(), inputs: Array(count).fill(inputs[index]) },
      signal(),
    ),
  ).toMatchObject({ ok: false, executed: false })
  expect(seen).toEqual([])
})

test.each([
  { error: 'missing URL' },
  { url: 'invalid-url' },
  { url: 'data:image/png;base64,YQ==' },
  { url: 'http://assets.example/a.png' },
])('无效上传结果不触发生成：%j', async (body) => {
  uploadBody = body
  const result = await makeMediaPort(config()).generate({ ...call(), inputs }, signal())
  expect(result).toMatchObject({ ok: false, diagnostic: { stage: 'upload', outcome: 'rejected' } })
  expect(seen.map((entry) => entry.path)).toEqual(['/refhost/upload'])
})

test('上传鉴权失败明确未提交，允许随后重新尝试', async () => {
  uploadStatus = 401
  uploadBody = { error: { message: 'invalid token' } }
  const port = makeMediaPort(config())
  expect(await port.generate({ ...call(), inputs }, signal())).toMatchObject({
    ok: false,
    diagnostic: { stage: 'upload', outcome: 'rejected' },
  })
  uploadStatus = 200
  uploadBody = undefined
  expect((await port.generate({ ...call(), inputs }, signal())).ok).toBe(true)
})

test.each(MODELS)('任务取回不重复上传或提交，缺失秒数时不推算费用：$id', async ({ id }) => {
  poll = { status: 'completed' }
  const spends: MediaSpend[] = []
  expect(
    (
      await makeMediaPort(config('', id), (spend) => spends.push(spend)).generate(
        { ...call(), inputs, resumeTaskId: 'task_hongcheng' },
        signal(),
      )
    ).ok,
  ).toBe(true)
  expect(seen.map((entry) => `${entry.method} ${entry.path}`)).toEqual([
    'GET /v1/videos/task_hongcheng',
    'GET /v1/videos/task_hongcheng/content',
  ])
  expect(spends[0]).toMatchObject({ quantity: null, cost: 0 })
})

test('远端拒绝保留错误原文，下载失败保留原任务号', async () => {
  poll = { status: 'failed', error: { code: 'upstream_rejected', message: '参考素材无法读取' } }
  const failed = await makeMediaPort(config()).generate(call(), signal())
  expect(failed).toMatchObject({ ok: false, message: expect.stringContaining('参考素材无法读取') })
  expect(failed).not.toHaveProperty('pendingTaskId')
  poll = { status: 'completed', seconds: '5' }
  contentStatus = 403
  expect(
    await makeMediaPort(config()).generate({ ...call(), resumeTaskId: 'task_hongcheng' }, signal()),
  ).toMatchObject({ ok: false, pendingTaskId: 'task_hongcheng' })
})
