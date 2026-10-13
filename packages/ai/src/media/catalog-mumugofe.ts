/**
 * Mumugofe 渠道：满血版于 2026-10-10 实测 /v1/videos 提交、查询、下载与视频解码。
 * 满血版按渠道模型页开放 30 图、10 视频、10 音频，复用已验证的 JSON 素材字段。
 * video-sd25-30s 按 2026-10-12 渠道目录与插件 0.2.9 使用 multipart 参考图、固定 30 秒。
 * 1080P 超分版按 2026-10-13 渠道目录接入 JSON、固定 30 秒与 30 图，不支持视频或音频参考。
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

const UPSCALED_SIZE: MediaParamSpec = {
  name: 'size',
  label: '尺寸',
  type: 'string',
  shapes: [
    { ratio: '16:9', tier: '1080P', value: '1920x1080' },
    { ratio: '9:16', tier: '1080P', value: '1080x1920' },
  ],
  default: '1920x1080',
  description: '1080P 超分横屏 1920x1080 或竖屏 1080x1920',
}

export const MUMUGOFE_MODELS: readonly MediaModelSpec[] = [
  {
    id: '全能sd2.5(满血内置过脸30图超分1080P)',
    displayName: '全能 SD2.5 · 1080P 超分 · 30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video'],
    inputs: { maxImages: 30, maxVideos: 0, maxAudios: 0, transport: 'json' },
    params: [FIXED_SECONDS, UPSCALED_SIZE],
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
    id: 'video-sd25-30s',
    displayName: '全能视频 2.5 · 720P · 30秒',
    vendor: 'Mumugofe',
    kind: 'openai_videos',
    videoFormat: 'mumugofe',
    operations: ['text_to_video', 'reference_to_video'],
    inputs: { maxImages: 30, maxVideos: 0, maxAudios: 10, transport: 'multipart' },
    params: [FIXED_SECONDS, SIZE],
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
