/** Mumugofe 从已配置模型、参数校验到实际 HTTP 请求与任务恢复的回归测试。 */
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test'
import type { MediaCall } from '@qywork/agent'
import { findMediaModel, lookupMediaModel, mediaCatalog, mediaKindsOf } from '@qywork/ai'
import type { MediaInputRole, MediaSpend } from '@qywork/core'
import { listMediaModels, type QyConfig } from './config.ts'
import { makeMediaPort } from './media.ts'
import { buildTailNotes } from './prompt.ts'

const MODEL = '满血sd2.5(30-10-10原生过人脸/720P)'
const VIDEO_30S = 'video-sd25-30s'
const HIGH_QUALITY = '高质量sd2.5/(全参原生过真人速度快720P)'
const UPSCALED = '全能sd2.5(满血内置过脸30图超分1080P)'
const EXCLUSIVE = '专享sd2.5(30图10音/4-30秒/720p)'
const FULL_PARAMS = '高质量sd2.5(满血全参/720P/按次)'
const PROMPT = '雨后咖啡馆，一位成年女性坐下阅读。\n镜头缓慢后退，人物望向窗外微笑。'
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1])
const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0])
const TASK = 'task_mumugofe_test'
/** 2026-10-10 实测任务接口的拒绝原因原文；同一任务的 `/videos/{id}` 只返回通用失败信息。 */
const REJECTED =
  "版权保护拒绝（画面）：换掉参考素材或改提示词再试（跟时长无关）\n上游原话：For copyright protection, I can't show you the generated video. Use other references or edit the prompt and try again."
interface Seen {
  method: string
  path: string
  auth: string | null
  contentType: string | null
  body?: unknown
  form?: Awaited<ReturnType<Request['formData']>>
  rawForm?: string
}
let server: ReturnType<typeof Bun.serve>
let seen: Seen[]
let status: 'completed' | 'failed'
let contentStatus: number
let taskStatuses: string[]

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const multipart =
        req.method === 'POST' && req.headers.get('content-type')?.startsWith('multipart/form-data')
      const rawForm = multipart ? await req.clone().text() : undefined
      const form = multipart ? await req.formData() : undefined
      seen.push({
        method: req.method,
        path,
        auth: req.headers.get('authorization'),
        contentType: req.headers.get('content-type'),
        ...(form ? { form } : req.method === 'POST' ? { body: await req.json() } : {}),
        ...(rawForm === undefined ? {} : { rawForm }),
      })
      if (req.method === 'POST' && path === '/v1/videos')
        return Response.json({ id: TASK, status: 'queued', object: 'video' })
      if (req.method === 'GET' && path === `/v1/videos/${TASK}`)
        return Response.json({
          id: TASK,
          object: 'video',
          model: MODEL,
          status,
          ...(status === 'failed'
            ? {
                error: {
                  message: 'The video generation task failed.',
                  code: 'video_generation_failed',
                },
              }
            : {}),
          // 实测终态没有 seconds、usage 或扣费金额，不能用请求值伪造计量。
        })
      if (req.method === 'GET' && path === `/v1/video/generations/${TASK}`)
        return Response.json({
          code: 'success',
          message: '',
          data: {
            task_id: TASK,
            status: taskStatuses.shift() ?? (status === 'completed' ? 'SUCCESS' : 'FAILURE'),
            fail_reason: status === 'failed' ? REJECTED : '',
            progress: '100%',
          },
        })
      if (req.method === 'GET' && path === `/v1/videos/${TASK}/content`)
        return new Response(contentStatus === 200 ? MP4 : 'forbidden', {
          status: contentStatus,
          headers: { 'content-type': 'video/mp4' },
        })
      return new Response('unexpected route', { status: 400 })
    },
  })
})
afterAll(() => server.stop(true))
beforeEach(() => {
  seen = []
  status = 'completed'
  contentStatus = 200
  taskStatuses = []
})

const config = (model = MODEL): QyConfig => ({
  providers: {
    mumugofe: {
      kind: 'openai_chat_completions',
      apiKey: 'test-only-key',
      baseUrl: `http://127.0.0.1:${server.port}/v1`,
      models: {},
      media: { [model]: { kind: 'openai_videos' } },
    },
  },
  mediaDefaults: { video: { provider: 'mumugofe', model } },
})
const call = (over: Partial<MediaCall> = {}): MediaCall => ({
  type: 'video',
  prompt: PROMPT,
  inputs: [],
  params: {},
  ...over,
})
const signal = () => new AbortController().signal

test('渠道型号在模型库和 Agent 参数表中使用自己的协议与能力', () => {
  const spec = findMediaModel(MODEL)!
  expect(spec.vendor).toBe('Mumugofe')
  expect(spec.catalogued).toBe(true)
  expect(mediaKindsOf(spec)).toEqual(['openai_videos'])
  expect(spec.operations).toEqual(['text_to_video', 'reference_to_video', 'video_to_video'])
  expect(spec.inputs.maxImages).toBe(30)
  expect(spec.inputs.maxVideos).toBe(10)
  expect(spec.inputs.maxAudios).toBe(10)
  expect(spec.price).toBeUndefined()
  expect(lookupMediaModel(MODEL, 'ark_videos').catalogued).toBe(false)
  const text = buildTailNotes({
    workspaceRoot: '/w',
    platform: 'win32',
    mode: 'auto',
    mediaModels: listMediaModels(config()),
  })
    .map((n) => n.content)
    .join('\n')
  expect(text).toContain(MODEL)
  expect(text).toContain('seconds：30')
  expect(text).toContain('1280x720')
  expect(text).toContain('720x1280')
  expect(text).toContain('参考视频最多 10 个')
  expect(text).toContain('参考音频最多 10 段')
  expect(text).not.toContain('temperature')
  expect(text).not.toContain('generate_audio')
})

test.each([{}, { seconds: '30', size: '1280x720' }])(
  '默认值和显式参数均提交实测请求，保存任务后鉴权查询下载：%j',
  async (params) => {
    const spends: MediaSpend[] = []
    const port = makeMediaPort(config(), (spend) => spends.push(spend))
    const tasks: unknown[] = []
    const result = await port.generate(
      call({
        params,
        onTask: async (task) => {
          expect(seen.map((s) => s.method)).toEqual(['POST'])
          tasks.push(task)
        },
      }),
      signal(),
    )
    expect(result).toMatchObject({
      ok: true,
      provider: 'mumugofe',
      model: MODEL,
      files: [{ bytes: MP4, mime: 'video/mp4' }],
    })
    expect(tasks).toEqual([{ taskId: TASK, provider: 'mumugofe', model: MODEL }])
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'POST /v1/videos',
      `GET /v1/video/generations/${TASK}`,
      `GET /v1/videos/${TASK}/content`,
    ])
    expect(seen.every((s) => s.auth === 'Bearer test-only-key')).toBe(true)
    expect(seen[0]?.contentType).toContain('application/json')
    expect(seen[0]?.body).toEqual({
      model: MODEL,
      prompt: PROMPT,
      seconds: '30',
      size: '1280x720',
    })
    expect(spends).toHaveLength(1)
    expect(spends[0]).toMatchObject({ quantity: null, cost: 0 })
  },
)

test.each([1, 30])('参考图原样按顺序进入 images，支持竖屏，张数=%i', async (count) => {
  const inputs = Array.from({ length: count }, (_, i) => ({
    role: 'reference' as const,
    bytes: new Uint8Array([...PNG, i]),
    mime: 'image/png',
    path: `/reference-${i}.png`,
  }))
  expect(
    await makeMediaPort(config()).generate(
      call({ inputs, params: { size: '720x1280' } }),
      signal(),
    ),
  ).toMatchObject({ ok: true })
  expect(seen[0]?.body).toEqual({
    model: MODEL,
    prompt: PROMPT,
    seconds: '30',
    size: '720x1280',
    images: inputs.map((i) => `data:image/png;base64,${Buffer.from(i.bytes).toString('base64')}`),
  })
})

test('超过渠道声明的 30 张参考图时在提交前拒绝', async () => {
  const inputs = Array.from({ length: 31 }, () => ({
    role: 'reference' as const,
    bytes: PNG,
    mime: 'image/png',
    path: '/reference.png',
  }))
  expect(await makeMediaPort(config()).generate(call({ inputs }), signal())).toMatchObject({
    ok: false,
    executed: false,
  })
  expect(seen).toEqual([])
})

test.each([
  { seconds: '10' },
  { seconds: 30 },
  { size: '1920x1080' },
  { temperature: 0.7 },
  { duration: 30 },
  { generate_audio: true },
])('未适配的参数在发送前被拒绝：%j', async (params) => {
  expect(await makeMediaPort(config()).generate(call({ params }), signal())).toMatchObject({
    ok: false,
    executed: false,
  })
  expect(seen).toEqual([])
})

test.each<MediaInputRole>(['first_frame', 'last_frame'])(
  '未完成适配的素材不能被静默丢弃：%s',
  async (role) => {
    const result = await makeMediaPort(config()).generate(
      call({ inputs: [{ role, bytes: MP4, mime: 'video/mp4', path: '/reference.mp4' }] }),
      signal(),
    )
    expect(result).toMatchObject({ ok: false, executed: false })
    expect(seen).toEqual([])
  },
)

test('下载失败保留任务号，恢复只查询下载，不重复提交', async () => {
  contentStatus = 403
  const port = makeMediaPort(config())
  expect(await port.generate(call(), signal())).toMatchObject({
    ok: false,
    pendingTaskId: TASK,
  })
  seen = []
  contentStatus = 200
  expect(await port.generate(call({ resumeTaskId: TASK }), signal())).toMatchObject({ ok: true })
  expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
    `GET /v1/video/generations/${TASK}`,
    `GET /v1/videos/${TASK}/content`,
  ])
})

test('远端明确失败时返回任务接口中的拒绝原因，不下载或重新生成', async () => {
  status = 'failed'
  const result = await makeMediaPort(config()).generate(call(), signal())
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error('expected failure')
  expect(result.message).toContain(`远端任务失败：${REJECTED}`)
  expect(result.pendingTaskId).toBeUndefined()
  expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
    'POST /v1/videos',
    `GET /v1/video/generations/${TASK}`,
  ])
})

test('下架专享版保留旧配置规格，不继承满血版固定时长', () => {
  const spec = lookupMediaModel(EXCLUSIVE, 'openai_videos')
  expect(spec).toMatchObject({
    vendor: 'Mumugofe',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video'],
    inputs: { maxImages: 30, maxVideos: 0, maxAudios: 10 },
  })
  expect(spec.price).toBeUndefined()
  expect(mediaKindsOf(spec)).toEqual(['openai_videos'])
  const text = buildTailNotes({
    workspaceRoot: '/w',
    platform: 'win32',
    mode: 'auto',
    mediaModels: listMediaModels(config(EXCLUSIVE)),
  })
    .map((n) => n.content)
    .join('\n')
  expect(text).toContain('参考音频最多 10 段')
  expect(text).toContain('4–30 秒整数，使用字符串')
  expect(findMediaModel(MODEL)!.inputs.maxAudios).toBe(10)
})

test.each([undefined, '4', '17', '30'])(
  '专享版默认 5 秒和 4–30 秒边界原样发送字符串：%s',
  async (seconds) => {
    const params = seconds === undefined ? {} : { seconds, size: '720x1280' }
    const spends: MediaSpend[] = []
    const result = await makeMediaPort(config(EXCLUSIVE), (s) => spends.push(s)).generate(
      call({ params }),
      signal(),
    )
    expect(result).toMatchObject({ ok: true, model: EXCLUSIVE })
    expect(seen[0]?.body).toEqual({
      model: EXCLUSIVE,
      prompt: PROMPT,
      seconds: seconds ?? '5',
      size: seconds === undefined ? '1280x720' : '720x1280',
    })
    expect(spends[0]).toMatchObject({ quantity: null, cost: 0 })
  },
)

test('图片和 MP3 交错输入时按类别保持顺序，音频别名统一成 audio/mpeg', async () => {
  const inputs = [
    { role: 'audio' as const, bytes: MP3, mime: 'audio/mp3', path: '/voice-1.mp3' },
    { role: 'reference' as const, bytes: PNG, mime: 'image/png', path: '/image-1.png' },
    {
      role: 'audio' as const,
      bytes: new Uint8Array([...MP3, 2]),
      mime: 'audio/mpeg',
      path: '/voice-2.mp3',
    },
    {
      role: 'reference' as const,
      bytes: new Uint8Array([...PNG, 2]),
      mime: 'image/png',
      path: '/image-2.png',
    },
  ]
  expect(await makeMediaPort(config(EXCLUSIVE)).generate(call({ inputs }), signal())).toMatchObject(
    {
      ok: true,
    },
  )
  expect(seen[0]?.body).toEqual({
    model: EXCLUSIVE,
    prompt: PROMPT,
    seconds: '5',
    size: '1280x720',
    images: [inputs[1], inputs[3]].map(
      (i) => `data:image/png;base64,${Buffer.from(i!.bytes).toString('base64')}`,
    ),
    audios: [inputs[0], inputs[2]].map(
      (i) => `data:audio/mpeg;base64,${Buffer.from(i!.bytes).toString('base64')}`,
    ),
  })
})

test.each([EXCLUSIVE])('%s 允许单独音频参考，最多 10 段，不伪造 images 字段', async (model) => {
  const inputs = Array.from({ length: 10 }, (_, i) => ({
    role: 'audio' as const,
    bytes: new Uint8Array([...MP3, i]),
    mime: 'audio/mpeg',
    path: `/voice-${i}.mp3`,
  }))
  expect(await makeMediaPort(config(model)).generate(call({ inputs }), signal())).toMatchObject({
    ok: true,
  })
  expect(seen[0]?.body).toEqual({
    model,
    prompt: PROMPT,
    seconds: '5',
    size: '1280x720',
    audios: inputs.map((i) => `data:audio/mpeg;base64,${Buffer.from(i.bytes).toString('base64')}`),
  })
})

test.each([
  ['reference', 31],
  ['audio', 11],
] as const)('专享版素材数量越界时不提交：%s=%i', async (role, count) => {
  const inputs = Array.from({ length: count }, () => ({
    role,
    bytes: role === 'audio' ? MP3 : PNG,
    mime: role === 'audio' ? 'audio/mpeg' : 'image/png',
    path: '/reference',
  }))
  expect(await makeMediaPort(config(EXCLUSIVE)).generate(call({ inputs }), signal())).toMatchObject(
    {
      ok: false,
      executed: false,
    },
  )
  expect(seen).toEqual([])
})

test.each([
  { seconds: '3' },
  { seconds: '31' },
  { seconds: '4.5' },
  { seconds: 4 },
  { size: '1920x1080' },
  { face: true },
  { fps: 60 },
  { temperature: 0.7 },
])('专享版拒绝越界时长和未开放字段：%j', async (params) => {
  expect(await makeMediaPort(config(EXCLUSIVE)).generate(call({ params }), signal())).toMatchObject(
    {
      ok: false,
      executed: false,
    },
  )
  expect(seen).toEqual([])
})

test.each<MediaInputRole>(['first_frame', 'last_frame', 'video'])(
  '专享版未声明的素材类型在提交前拒绝：%s',
  async (role) => {
    expect(
      await makeMediaPort(config(EXCLUSIVE)).generate(
        call({ inputs: [{ role, bytes: MP4, mime: 'video/mp4', path: '/ref.mp4' }] }),
        signal(),
      ),
    ).toMatchObject({ ok: false, executed: false })
    expect(seen).toEqual([])
  },
)

test.each(['audio/wav', 'audio/mp4', 'audio/mpeg'])(
  '专享版拒绝非 MP3 内容，不因 MIME 标签而改写格式：%s',
  async (mime) => {
    const result = await makeMediaPort(config(EXCLUSIVE)).generate(
      call({ inputs: [{ role: 'audio', bytes: MP4, mime, path: '/voice.mp3' }] }),
      signal(),
    )
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toContain('仅支持 MP3')
    expect(result.message).toContain('未提交生成')
    expect(seen).toEqual([])
  },
)

test('下架高质量版保留旧配置的图、视频、音频规格', () => {
  const spec = lookupMediaModel(FULL_PARAMS, 'openai_videos')
  expect(spec).toMatchObject({
    vendor: 'Mumugofe',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10 },
  })
  expect(spec.price).toBeUndefined()
  expect(mediaKindsOf(spec)).toEqual(['openai_videos'])
  const text = buildTailNotes({
    workspaceRoot: '/w',
    platform: 'win32',
    mode: 'auto',
    mediaModels: listMediaModels(config(FULL_PARAMS)),
  })
    .map((n) => n.content)
    .join('\n')
  expect(text).toContain('参考图最多 30 张')
  expect(text).toContain('参考视频最多 10 个')
  expect(text).toContain('参考音频最多 10 段')
  expect(lookupMediaModel(EXCLUSIVE, 'openai_videos').inputs.maxVideos).toBe(0)
  expect(findMediaModel(MODEL)!.params.find((p) => p.name === 'seconds')?.values).toEqual(['30'])
})

test.each([undefined, '30'])('满血全参版按实际接口固定 30 秒，保持字符串：%s', async (seconds) => {
  const result = await makeMediaPort(config(FULL_PARAMS)).generate(
    call({ params: seconds === undefined ? {} : { seconds, size: '720x1280' } }),
    signal(),
  )
  expect(result).toMatchObject({ ok: true, model: FULL_PARAMS })
  expect(seen[0]?.body).toEqual({
    model: FULL_PARAMS,
    prompt: PROMPT,
    seconds: seconds ?? '30',
    size: seconds === undefined ? '1280x720' : '720x1280',
  })
})

const fullInput = (role: 'reference' | 'video' | 'audio', i = 0) => ({
  role,
  bytes: new Uint8Array([...(role === 'reference' ? PNG : role === 'video' ? MP4 : MP3), i]),
  mime: role === 'reference' ? 'image/png' : role === 'video' ? 'video/mp4' : 'audio/mpeg',
  path: `/reference-${role}-${i}`,
})

test('模型库收录当前型号，下架型号保留旧任务取回规格', () => {
  expect(
    mediaCatalog()
      .filter((m) => m.vendor === 'Mumugofe')
      .map((m) => m.id),
  ).toEqual([UPSCALED, MODEL, VIDEO_30S])
  expect(findMediaModel(HIGH_QUALITY)).toBeUndefined()
  expect(lookupMediaModel(HIGH_QUALITY, 'openai_videos').videoFormat).toBeUndefined()
  for (const id of [EXCLUSIVE, FULL_PARAMS]) {
    expect(findMediaModel(id)).toBeUndefined()
    expect(lookupMediaModel(id, 'openai_videos')).toMatchObject({
      catalogued: false,
      videoFormat: 'mumugofe',
    })
    expect(lookupMediaModel(id, 'ark_videos').videoFormat).toBeUndefined()
  }
})

test.each([EXCLUSIVE, FULL_PARAMS, MODEL, VIDEO_30S, UPSCALED])(
  '当前与下架型号取回仅查询下载原任务：%s',
  async (model) => {
    expect(
      await makeMediaPort(config(model)).generate(call({ resumeTaskId: TASK }), signal()),
    ).toMatchObject({ ok: true, model })
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      `GET /v1/video/generations/${TASK}`,
      `GET /v1/videos/${TASK}/content`,
    ])
  },
)

test('满血版混合图、视频、音频按类别保序提交 JSON，素材不丢失', async () => {
  const inputs = [
    fullInput('video', 1),
    fullInput('audio', 1),
    fullInput('reference', 1),
    fullInput('video', 2),
    fullInput('reference', 2),
    fullInput('audio', 2),
  ]
  expect(await makeMediaPort(config()).generate(call({ inputs }), signal())).toMatchObject({
    ok: true,
  })
  const field = (role: string) =>
    inputs
      .filter((i) => i.role === role)
      .map((i) => `data:${i.mime};base64,${Buffer.from(i.bytes).toString('base64')}`)
  expect(seen[0]?.contentType).toContain('application/json')
  expect(seen[0]?.body).toEqual({
    model: MODEL,
    prompt: PROMPT,
    seconds: '30',
    size: '1280x720',
    images: field('reference'),
    videos: field('video'),
    audios: field('audio'),
  })
})

test.each([
  [30, 10, 10, true],
  [31, 10, 10, false],
  [30, 11, 10, false],
  [30, 10, 11, false],
] as const)('满血版参考素材边界：%i 图、%i 视频、%i 音频', async (images, videos, audios, ok) => {
  const inputs = [
    ...Array.from({ length: images }, (_, i) => fullInput('reference', i)),
    ...Array.from({ length: videos }, (_, i) => fullInput('video', i)),
    ...Array.from({ length: audios }, (_, i) => fullInput('audio', i)),
  ]
  expect(await makeMediaPort(config()).generate(call({ inputs }), signal())).toMatchObject(
    ok ? { ok: true } : { ok: false, executed: false },
  )
  expect(seen.some((s) => s.method === 'POST')).toBe(ok)
})

test.each([{}, { seconds: '30', size: '720x1280' }])(
  'video-sd25-30s 文生视频使用固定 30 秒：%j',
  async (params) => {
    expect(
      await makeMediaPort(config(VIDEO_30S)).generate(call({ params }), signal()),
    ).toMatchObject({ ok: true })
    expect(seen[0]?.body).toEqual({
      model: VIDEO_30S,
      prompt: PROMPT,
      seconds: '30',
      size: params.size ?? '1280x720',
    })
    expect(seen[0]?.contentType).toContain('application/json')
  },
)

test('1080P 超分版在模型库与 Agent 参数中保持独立尺寸', () => {
  const spec = findMediaModel(UPSCALED)!
  expect(spec).toMatchObject({
    displayName: '全能 SD2.5 · 1080P 超分 · 30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    catalogued: true,
    operations: ['text_to_video', 'reference_to_video'],
    inputs: { maxImages: 30, maxVideos: 0, maxAudios: 0, transport: 'json' },
  })
  expect(spec.price).toBeUndefined()
  expect(lookupMediaModel(UPSCALED, 'ark_videos').catalogued).toBe(false)
  const text = buildTailNotes({
    workspaceRoot: '/w',
    platform: 'win32',
    mode: 'auto',
    mediaModels: listMediaModels(config(UPSCALED)),
  })
    .map((n) => n.content)
    .join('\n')
  expect(text).toContain(UPSCALED)
  expect(text).toContain('seconds：30')
  expect(text).toContain('1920x1080')
  expect(text).toContain('1080x1920')
  expect(text).toContain('参考图最多 30 张')
  expect(text).not.toContain('1280x720')
  expect(text).not.toContain('参考音频最多')
  expect(text).not.toContain('参考视频最多')
})

test.each([{}, { seconds: '30', size: '1080x1920' }])(
  '1080P 超分版发送固定 30 秒及对应横竖屏，保存任务后查询下载：%j',
  async (params) => {
    const tasks: unknown[] = []
    const spends: MediaSpend[] = []
    expect(
      await makeMediaPort(config(UPSCALED), (spend) => spends.push(spend)).generate(
        call({
          params,
          onTask: async (task) => {
            expect(seen.map((s) => s.method)).toEqual(['POST'])
            tasks.push(task)
          },
        }),
        signal(),
      ),
    ).toMatchObject({ ok: true, model: UPSCALED, files: [{ bytes: MP4, mime: 'video/mp4' }] })
    expect(tasks).toEqual([{ taskId: TASK, provider: 'mumugofe', model: UPSCALED }])
    expect(seen[0]?.body).toEqual({
      model: UPSCALED,
      prompt: PROMPT,
      seconds: '30',
      size: params.size ?? '1920x1080',
    })
    expect(seen[0]?.contentType).toContain('application/json')
    expect(seen.every((s) => s.auth === 'Bearer test-only-key')).toBe(true)
    expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      'POST /v1/videos',
      `GET /v1/video/generations/${TASK}`,
      `GET /v1/videos/${TASK}/content`,
    ])
    expect(spends).toHaveLength(1)
    expect(spends[0]).toMatchObject({ quantity: null, cost: 0 })
  },
)

test.each([
  { seconds: '5' },
  { seconds: 30 },
  { size: '1280x720' },
  { size: '720x1280' },
  { size: '1080p' },
  { face: true },
  { temperature: 0.7 },
])('1080P 超分版拒绝其他时长、720P 尺寸及未开放参数：%j', async (params) => {
  expect(await makeMediaPort(config(UPSCALED)).generate(call({ params }), signal())).toMatchObject({
    ok: false,
    executed: false,
  })
  expect(seen).toEqual([])
})

test.each([1, 30])('1080P 超分版参考图按顺序发送 PNG data URI：%i 张', async (count) => {
  const inputs = Array.from({ length: count }, (_, i) => fullInput('reference', i))
  expect(
    await makeMediaPort(config(UPSCALED)).generate(
      call({ inputs, params: { size: '1080x1920' } }),
      signal(),
    ),
  ).toMatchObject({ ok: true })
  expect(seen[0]?.body).toEqual({
    model: UPSCALED,
    prompt: PROMPT,
    seconds: '30',
    size: '1080x1920',
    images: inputs.map((i) => `data:image/png;base64,${Buffer.from(i.bytes).toString('base64')}`),
  })
})

test('1080P 超分版超过 30 张参考图时不提交', async () => {
  const inputs = Array.from({ length: 31 }, (_, i) => fullInput('reference', i))
  expect(await makeMediaPort(config(UPSCALED)).generate(call({ inputs }), signal())).toMatchObject({
    ok: false,
    executed: false,
  })
  expect(seen).toEqual([])
})

test.each<MediaInputRole>(['video', 'audio', 'first_frame', 'last_frame'])(
  '1080P 超分版不提交未开放的参考素材：%s',
  async (role) => {
    expect(
      await makeMediaPort(config(UPSCALED)).generate(
        call({ inputs: [{ ...fullInput(role === 'audio' ? 'audio' : 'reference'), role }] }),
        signal(),
      ),
    ).toMatchObject({ ok: false, executed: false })
    expect(seen).toEqual([])
  },
)

test.each([1, 30])(
  'video-sd25-30s 多图与音频混合：%i 个 input_reference 文件与 JSON audios',
  async (images) => {
    const refs = Array.from({ length: images }, (_, i) => fullInput('reference', i))
    const audios = Array.from({ length: 10 }, (_, i) => fullInput('audio', i))
    const inputs = [audios[0]!, ...refs, ...audios.slice(1)]
    let saved = false
    expect(
      await makeMediaPort(config(VIDEO_30S)).generate(
        call({
          inputs,
          params: { size: '720x1280' },
          onTask: async () => {
            expect(seen.map((s) => s.method)).toEqual(['POST'])
            saved = true
          },
        }),
        signal(),
      ),
    ).toMatchObject({ ok: true })
    expect(saved).toBe(true)
    expect(seen[0]?.contentType).toContain('multipart/form-data; boundary=')
    const form = seen[0]!.form!
    expect(form.get('model')).toBe(VIDEO_30S)
    // multipart 表单按标准将字段换行规范化为 CRLF。
    expect(form.get('prompt')).toBe(PROMPT.replace(/\n/g, '\r\n'))
    expect(form.get('seconds')).toBe('30')
    expect(form.get('size')).toBe('720x1280')
    expect(form.has('images')).toBe(false)
    expect(form.has('videos')).toBe(false)
    const files = form.getAll('input_reference') as File[]
    expect(files).toHaveLength(images)
    // Bun 的 formData 解码器会按扩展名重建 type；检查实际发送的 Content-Type。
    expect(seen[0]?.rawForm?.match(/Content-Type: image\/png/g)).toHaveLength(images)
    for (const [i, file] of files.entries()) {
      expect(new Uint8Array(await file.arrayBuffer())).toEqual(refs[i]!.bytes)
    }
    expect(JSON.parse(String(form.get('audios')))).toEqual(
      audios.map((i) => `data:audio/mpeg;base64,${Buffer.from(i.bytes).toString('base64')}`),
    )
    expect(seen.every((s) => s.auth === 'Bearer test-only-key')).toBe(true)
  },
)

test('video-sd25-30s 单独 MP3 参考使用 JSON audios', async () => {
  const input = { ...fullInput('audio'), mime: 'audio/mp3' }
  expect(
    await makeMediaPort(config(VIDEO_30S)).generate(call({ inputs: [input] }), signal()),
  ).toMatchObject({ ok: true })
  expect(seen[0]?.body).toEqual({
    model: VIDEO_30S,
    prompt: PROMPT,
    seconds: '30',
    size: '1280x720',
    audios: [`data:audio/mpeg;base64,${Buffer.from(input.bytes).toString('base64')}`],
  })
})

test.each([{ seconds: '5' }, { seconds: 30 }, { size: '1920x1080' }, { temperature: 0.7 }])(
  'video-sd25-30s 非法参数在提交前拒绝：%j',
  async (params) => {
    expect(
      await makeMediaPort(config(VIDEO_30S)).generate(call({ params }), signal()),
    ).toMatchObject({ ok: false, executed: false })
    expect(seen).toEqual([])
  },
)

test.each([
  ['reference', 31],
  ['audio', 11],
  ['video', 1],
] as const)('video-sd25-30s 拒绝越界素材及参考视频：%s=%i', async (role, count) => {
  const inputs = Array.from({ length: count }, (_, i) => fullInput(role, i))
  expect(await makeMediaPort(config(VIDEO_30S)).generate(call({ inputs }), signal())).toMatchObject(
    { ok: false, executed: false },
  )
  expect(seen).toEqual([])
})

test.each([MODEL, VIDEO_30S])(
  '当前型号拒绝伪装 MP3 的音频，图片也不提前提交：%s',
  async (model) => {
    const inputs = [fullInput('reference'), { ...fullInput('audio'), bytes: MP4 }]
    const result = await makeMediaPort(config(model)).generate(call({ inputs }), signal())
    expect(result).toMatchObject({ ok: false })
    if (result.ok) throw new Error('expected failure')
    expect(result.message).toContain('仅支持 MP3')
    expect(seen).toEqual([])
  },
)

test('满血全参版混合素材分别进入 images、videos、audios 并保持各自顺序', async () => {
  const inputs = [
    fullInput('video', 1),
    fullInput('audio', 1),
    fullInput('reference', 1),
    fullInput('video', 2),
    fullInput('reference', 2),
    fullInput('audio', 2),
  ]
  expect(
    await makeMediaPort(config(FULL_PARAMS)).generate(call({ inputs }), signal()),
  ).toMatchObject({ ok: true })
  const field = (role: string) =>
    inputs
      .filter((i) => i.role === role)
      .map((i) => `data:${i.mime};base64,${Buffer.from(i.bytes).toString('base64')}`)
  expect(seen[0]?.body).toEqual({
    model: FULL_PARAMS,
    prompt: PROMPT,
    seconds: '30',
    size: '1280x720',
    images: field('reference'),
    videos: field('video'),
    audios: field('audio'),
  })
  expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
    'POST /v1/videos',
    `GET /v1/video/generations/${TASK}`,
    `GET /v1/videos/${TASK}/content`,
  ])
})

test('满血全参版允许单独视频参考，图片和音频字段不伪造', async () => {
  const input = fullInput('video')
  expect(
    await makeMediaPort(config(FULL_PARAMS)).generate(call({ inputs: [input] }), signal()),
  ).toMatchObject({ ok: true })
  expect(seen[0]?.body).toEqual({
    model: FULL_PARAMS,
    prompt: PROMPT,
    seconds: '30',
    size: '1280x720',
    videos: [`data:video/mp4;base64,${Buffer.from(input.bytes).toString('base64')}`],
  })
})

test.each([
  [30, 10, 10, true],
  [31, 10, 10, false],
  [30, 11, 10, false],
  [30, 10, 11, false],
] as const)(
  '满血全参版各类素材独立校验数量：%i 图、%i 视频、%i 音频',
  async (images, videos, audios, ok) => {
    const inputs = [
      ...Array.from({ length: images }, (_, i) => fullInput('reference', i)),
      ...Array.from({ length: videos }, (_, i) => fullInput('video', i)),
      ...Array.from({ length: audios }, (_, i) => fullInput('audio', i)),
    ]
    expect(
      await makeMediaPort(config(FULL_PARAMS)).generate(call({ inputs }), signal()),
    ).toMatchObject(ok ? { ok: true } : { ok: false, executed: false })
    expect(seen.some((s) => s.method === 'POST')).toBe(ok)
  },
)

test.each([
  { seconds: '3' },
  { seconds: '31' },
  { seconds: '4.5' },
  { seconds: 10 },
  { seconds: '4' },
  { seconds: '10' },
  { seconds: '15' },
  { size: '1920x1080' },
  { face: true },
  { fps: 60 },
  { temperature: 0.7 },
])('满血全参版不把名称中的全参解释为任意参数：%j', async (params) => {
  expect(
    await makeMediaPort(config(FULL_PARAMS)).generate(call({ params }), signal()),
  ).toMatchObject({ ok: false, executed: false })
  expect(seen).toEqual([])
})

test('满血全参版非 MP3 音频与视频混用时仍在提交前拒绝', async () => {
  const result = await makeMediaPort(config(FULL_PARAMS)).generate(
    call({
      inputs: [
        fullInput('video'),
        { role: 'audio', bytes: MP4, mime: 'audio/mpeg', path: '/fake.mp3' },
      ],
    }),
    signal(),
  )
  expect(result).toMatchObject({ ok: false })
  if (result.ok) throw new Error('expected failure')
  expect(result.message).toContain('仅支持 MP3')
  expect(seen).toEqual([])
})

test.each([false, true])(
  'NOT_START 继续等待原任务，不提前进入待取回：resume=%s',
  async (resume) => {
    taskStatuses = ['NOT_START']
    const phases: string[] = []
    const result = await makeMediaPort(config(FULL_PARAMS)).generate(
      call({
        ...(resume ? { resumeTaskId: TASK } : {}),
        onStatus: (s) => phases.push(s),
      }),
      signal(),
    )
    expect(result).toMatchObject({ ok: true, model: FULL_PARAMS })
    expect(phases).toEqual(['queued'])
    expect(seen.filter((s) => s.method === 'POST')).toHaveLength(resume ? 0 : 1)
    expect(seen.filter((s) => s.path === `/v1/video/generations/${TASK}`)).toHaveLength(2)
    expect(seen.at(-1)?.path).toBe(`/v1/videos/${TASK}/content`)
  },
  10000,
)
