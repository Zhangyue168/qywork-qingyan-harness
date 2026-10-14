/** hongcheng：覆盖模型目录、运行时校验、原始素材上传、视频提交、计量与任务取回。 */
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import { findMediaModel, lookupMediaModel, quoteMedia } from '@qywork/ai'
import type { MediaSpend } from '@qywork/core'
import type { QyConfig } from './config.ts'
import { makeMediaPort } from './media.ts'

const MODEL = 'TTseadanco2.5-720'
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
const config = (suffix = ''): QyConfig => ({
  providers: {
    hongcheng: {
      kind: 'openai_chat_completions',
      apiKey: 'test-only-key',
      baseUrl: `http://127.0.0.1:${server.port}${suffix}`,
      models: {},
      media: { [MODEL]: { kind: 'openai_videos' } },
    },
  },
  mediaDefaults: { video: { provider: 'hongcheng', model: MODEL } },
})
const call = () => ({
  type: 'video' as const,
  prompt: '@图片1 @视频1 @音频1',
  inputs: [],
  params: {},
})
const signal = () => new AbortController().signal

test('纵横模型登记独立能力和价格，其他协议不继承渠道规格', () => {
  expect(findMediaModel(MODEL)).toMatchObject({
    vendor: 'hongcheng',
    videoFormat: 'hongcheng',
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10 },
    mention: { image: '@图片{n}', video: '@视频{n}', audio: '@音频{n}' },
  })
  expect(lookupMediaModel(MODEL, 'ark_videos').catalogued).toBe(false)
})

test('生成前按所选时长和每秒 0.42 元报价，省略时长时使用默认 5 秒', () => {
  const spec = findMediaModel(MODEL)!
  for (const [params, cost] of [
    [{}, 2.1],
    [{ seconds: '10' }, 4.2],
    [{ seconds: '30' }, 12.6],
  ] as const) {
    expect(quoteMedia(spec, params, { images: 1, videos: 0 })).toEqual({ cost, currency: 'CNY' })
  }
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

test('三类素材按原始 MIME 和字节上传，URL 按同类顺序提交', async () => {
  const references = [inputs[0]!, inputs[1]!, inputs[0]!, inputs[2]!]
  const tasks: unknown[] = []
  const result = await makeMediaPort(config('/v1')).generate(
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
    model: MODEL,
    prompt: call().prompt,
    seconds: '30',
    resolution: '720p',
    aspect_ratio: '9:16',
    ratio: '9:16',
    reference_images: ['https://assets.example/1', 'https://assets.example/3'],
    reference_videos: ['https://assets.example/2'],
    reference_audios: ['https://assets.example/4'],
  })
  expect(tasks).toEqual([{ provider: 'hongcheng', model: MODEL, taskId: 'task_hongcheng' }])
})

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

test('任务取回不重复上传或提交，缺失秒数不以请求时长计费', async () => {
  poll = { status: 'completed' }
  const spends: MediaSpend[] = []
  expect(
    (
      await makeMediaPort(config(), (spend) => spends.push(spend)).generate(
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
