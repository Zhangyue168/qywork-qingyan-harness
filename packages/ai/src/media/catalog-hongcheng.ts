/** hongcheng 纵横线路：固定 720p，5–30 秒，参考素材使用上传后的公网地址。 */
import type { MediaModelSpec } from './catalog.ts'

export const HONGCHENG_MODELS: readonly MediaModelSpec[] = [
  {
    id: 'TTseadanco2.5-720',
    displayName: 'Seedance 2.5 · 纵横 · 720P',
    vendor: 'hongcheng',
    kind: 'openai_videos',
    videoFormat: 'hongcheng',
    operations: ['text_to_video', 'reference_to_video', 'video_to_video'],
    inputs: { maxImages: 30, maxVideos: 10, maxAudios: 10, transport: 'json' },
    params: [
      {
        name: 'seconds',
        label: '时长',
        type: 'enum',
        values: Array.from({ length: 26 }, (_, i) => String(i + 5)),
        valueLabels: Object.fromEntries(
          Array.from({ length: 26 }, (_, i) => [i + 5, `${i + 5}秒`]),
        ),
        default: '5',
        description: '5–30 秒整数，使用字符串',
      },
      {
        name: 'aspect_ratio',
        label: '画幅',
        type: 'string',
        shapes: ['16:9', '9:16', '1:1'].map((ratio) => ({ ratio, tier: '720P', value: ratio })),
        default: '16:9',
        description: '720P 横屏、竖屏或方形',
      },
      {
        name: 'resolution',
        label: '分辨率',
        type: 'enum',
        values: ['720p'],
        default: '720p',
        description: '固定 720p',
      },
    ],
    mention: { image: '@图片{n}', video: '@视频{n}', audio: '@音频{n}' },
    price: {
      currency: 'CNY',
      cost: (usage) => (usage.seconds === undefined ? null : usage.seconds * 0.42),
      usageOf: (params) => ({ seconds: Number(params.seconds) }),
    },
    catalogued: true,
  },
]
