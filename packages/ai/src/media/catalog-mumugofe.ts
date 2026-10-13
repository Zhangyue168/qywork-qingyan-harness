/**
 * Mumugofe 渠道：满血版于 2026-10-10 实测 /v1/videos 提交、查询、下载与视频解码。
 * 满血版按渠道模型页开放 30 图、10 视频、10 音频，复用已验证的 JSON 素材字段。
 * 006 系列按 2026-10-13 渠道目录使用 JSON；720P 为 4–15 秒，480P 为 4–30 秒。
 * sd-25-30/10/1-1 按 2026-10-13 渠道目录使用 multipart 参考图，开放 15/30 秒及 30 图、10 视频、10 音频。
 * 保留渠道原始编号，不继承官方 Seedance 的素材格式或价格。
 */
import type { MediaModelSpec, MediaParamSpec } from './catalog.ts'

const SIZE: MediaParamSpec = {
  name: 'size',
  label: '尺寸',
  type: 'string',
  shapes: [
    { ratio: '16:9', tier: '720P', value: '1280x720' },
    { ratio: '9:16', tier: '720P', value: '720x1280' },
  ],
  default: '1280x720',
  description: '720P 横屏 1280x720 或竖屏 720x1280',
}

const SECONDS: MediaParamSpec = {
  name: 'seconds',
  label: '时长',
  type: 'enum',
  values: Array.from({ length: 27 }, (_, i) => String(i + 4)),
  valueLabels: Object.fromEntries(Array.from({ length: 27 }, (_, i) => [i + 4, `${i + 4}秒`])),
  default: '5',
  description: '4–30 秒整数，使用字符串',
}

const FIXED_SECONDS: MediaParamSpec = {
  name: 'seconds',
  label: '时长',
  type: 'enum',
  values: ['30'],
  valueLabels: { '30': '30秒' },
  default: '30',
  description: '固定 30 秒，使用字符串 "30"',
}

const FULL_REFERENCE_SECONDS: MediaParamSpec = {
  name: 'seconds',
  label: '时长',
  type: 'enum',
  values: ['15', '30'],
  valueLabels: { '15': '15秒', '30': '30秒' },
  default: '30',
  description: '15 或 30 秒，使用字符串',
}

const SERIES_006_SECONDS: MediaParamSpec = {
  ...SECONDS,
  description: '字符串整数时长：720P 为 4–15 秒，480P 为 4–30 秒',
  rules: [
    {
      when: { params: { size: ['1280x720', '720x1280'] } },
      values: Array.from({ length: 12 }, (_, i) => String(i + 4)),
    },
  ],
}

const SERIES_006_SIZE: MediaParamSpec = {
  ...SIZE,
  shapes: [
    ...SIZE.shapes!,
    { ratio: '16:9', tier: '480P', value: '854x480' },
    { ratio: '9:16', tier: '480P', value: '480x854' },
  ],
  description: '720P：1280x720 或 720x1280；480P：854x480 或 480x854',
}

export const MUMUGOFE_MODELS: readonly MediaModelSpec[] = [
  {
    id: 'sd-25-30/10/1-1',
    displayName: 'Seedance 2.5 · 满参 · 720P · 15/30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'multipart' },
    params: [FULL_REFERENCE_SECONDS, SIZE],
    catalogued: true,
  },
  {
    id: '满血sd2.5(30-10-10原生过人脸/720P)',
    displayName: '满血 SD2.5 · 720P · 30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'json' },
    params: [FIXED_SECONDS, SIZE],
    catalogued: true,
  },
  {
    id: '006系列/sd2.5(满血30-10-10原生过人脸720P15秒/480P30秒)',
    displayName: '006 系列 SD2.5 · 满参 · 720P/480P',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'json' },
    params: [SERIES_006_SECONDS, SERIES_006_SIZE],
    catalogued: true,
  },
]

/** 已从内置模型库下架；旧配置和已提交任务仍按原协议解析，避免取回改走通用端点。 */
export const MUMUGOFE_RETIRED_MODELS: readonly MediaModelSpec[] = [
  {
    id: '专享sd2.5(30图10音/4-30秒/720p)',
    displayName: '专享 SD2.5 · 720P · 4–30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video'],
    inputs: { maxImages: 30, maxVideos: 0, maxAudios: 10, transport: 'json' },
    params: [SECONDS, SIZE],
    catalogued: false,
  },
  {
    id: '高质量sd2.5(满血全参/720P/按次)',
    displayName: '高质量 SD2.5 · 满血全参 · 720P',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'json' },
    // 2026-10-12 实际接口以 HTTP 400 拒绝 15 秒并要求固定 30 秒，覆盖公开目录的 4–30 秒声明。
    params: [FIXED_SECONDS, SIZE],
    catalogued: false,
  },
]
