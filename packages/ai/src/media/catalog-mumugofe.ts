/**
 * Mumugofe 渠道使用 /v1/videos 提交，素材通过 JSON 字段传递。
 * 006 系列按型号固定清晰度：720P 为 4–15 秒，480P 为 5–30 秒，均按条计费。
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

export const MUMUGOFE_MODELS: readonly MediaModelSpec[] = [
  ...[
    {
      id: '006系列/sd2.5(满血30-10-10原生过人脸720P15秒)',
      min: 4,
      max: 15,
      tier: '720P',
      width: 1280,
      height: 720,
    },
    {
      id: '006系列/sd2.5(满血30-10-10原生过人脸/5-30秒/480P)',
      min: 5,
      max: 30,
      tier: '480P',
      width: 854,
      height: 480,
    },
  ].map(
    ({ id, min, max, tier, width, height }): MediaModelSpec => ({
      id,
      displayName: id,
      vendor: 'Mumugofe',
      kind: 'openai_videos',
      videoFormat: 'mumugofe',
      operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
      inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'json' },
      params: [
        {
          ...SECONDS,
          values: Array.from({ length: max - min + 1 }, (_, i) => String(i + min)),
          valueLabels: Object.fromEntries(
            Array.from({ length: max - min + 1 }, (_, i) => [i + min, `${i + min}秒`]),
          ),
          description: `${min}–${max} 秒整数，使用字符串`,
        },
        {
          ...SIZE,
          shapes: [
            { ratio: '16:9', tier, value: `${width}x${height}` },
            { ratio: '9:16', tier, value: `${height}x${width}` },
          ],
          default: `${width}x${height}`,
          description: `${tier} 横屏 ${width}x${height} 或竖屏 ${height}x${width}`,
        },
      ],
      price: { currency: 'CNY', cost: () => 7.5, usageOf: () => ({}) },
      catalogued: true,
    }),
  ),
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
