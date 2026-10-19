/** hongcheng 视频模型：分辨率与参考视频上限由型号固定，素材使用上传后的公网地址。 */
import type { MediaModelSpec, MediaPrice } from './catalog.ts'

const perSecond = (rate: number): MediaPrice => ({
  currency: 'CNY',
  cost: (usage) => (usage.seconds === undefined ? null : usage.seconds * rate),
  usageOf: (params) => ({ seconds: Number(params.seconds) }),
})

export const HONGCHENG_MODELS: readonly MediaModelSpec[] = [
  { id: 'TTseadanco2.5-720', resolution: '720p', maxVideos: 10, price: perSecond(0.42) },
  { id: 'TTsedanco2.5-480', resolution: '480p', maxVideos: 10, price: perSecond(0.31) },
  { id: 'GGseadanco2.5/720', resolution: '720p', maxVideos: 10, price: perSecond(0.54) },
  { id: 'GGsedanco2.5/480', resolution: '480p', maxVideos: 0, price: perSecond(0.42) },
  {
    id: 'seedance-2.5（AA）',
    resolution: '720p',
    maxVideos: 10,
    minSeconds: 4,
    defaultSeconds: '30',
    price: perSecond(0.4),
  },
  {
    id: 'seedance2.5-aa-count',
    resolution: '720p',
    maxVideos: 10,
    minSeconds: 4,
    defaultSeconds: '30',
    price: { currency: 'CNY' as const, cost: () => 5.6, usageOf: () => ({}) },
  },
  {
    id: 'sd2.5-pp-1080p',
    resolution: '1080p',
    maxImages: 9,
    maxVideos: 0,
    maxAudios: 3,
    minSeconds: 4,
    defaultSeconds: '30',
    ratios: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
    price: { currency: 'CNY' as const, cost: () => 14.4, usageOf: () => ({}) },
  },
].map(
  ({
    id,
    resolution,
    maxImages = 30,
    maxVideos,
    maxAudios = 10,
    minSeconds = 5,
    defaultSeconds = '5',
    ratios = ['16:9', '9:16', '1:1'],
    price,
  }): MediaModelSpec => ({
    id,
    displayName: id,
    vendor: 'hongcheng',
    kind: 'openai_videos',
    videoFormat: 'hongcheng',
    operations: [
      'text_to_video',
      'reference_to_video',
      ...(maxVideos ? ['video_to_video' as const] : []),
    ],
    inputs: { maxImages, maxVideos, maxAudios, transport: 'json' },
    params: [
      {
        name: 'seconds',
        label: '时长',
        type: 'enum',
        values: Array.from({ length: 31 - minSeconds }, (_, i) => String(i + minSeconds)),
        valueLabels: Object.fromEntries(
          Array.from({ length: 31 - minSeconds }, (_, i) => [
            i + minSeconds,
            `${i + minSeconds}秒`,
          ]),
        ),
        default: defaultSeconds,
        description: `${minSeconds}–30 秒整数，使用字符串`,
      },
      {
        name: 'aspect_ratio',
        label: '画幅',
        type: 'string',
        shapes: ratios.map((ratio) => ({ ratio, value: ratio })),
        default: '16:9',
        description: `支持 ${ratios.join('、')}`,
      },
      {
        name: 'resolution',
        label: '分辨率',
        type: 'enum',
        values: [resolution],
        default: resolution,
        description: `固定 ${resolution}`,
      },
    ],
    mention: { image: '@Image{n}', video: '@Video{n}', audio: '@Audio{n}' },
    price,
    catalogued: true,
  }),
)
