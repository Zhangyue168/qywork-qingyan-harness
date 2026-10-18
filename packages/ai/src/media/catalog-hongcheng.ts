/** hongcheng 视频模型：分辨率与参考视频上限由型号固定，素材使用上传后的公网地址。 */
import type { MediaModelSpec, MediaPrice } from './catalog.ts'

const perSecond = (rate: number): MediaPrice => ({
  currency: 'CNY',
  cost: (usage) => (usage.seconds === undefined ? null : usage.seconds * rate),
  usageOf: (params) => ({ seconds: Number(params.seconds) }),
})

export const HONGCHENG_MODELS: readonly MediaModelSpec[] = [
  { id: 'TTseadanco2.5-720', resolution: '720p', maxVideos: 10, price: perSecond(0.42) },
  { id: 'TTsedanco2.5-480', resolution: '480p', maxVideos: 10, price: perSecond(0.312) },
  { id: 'GGseadanco2.5/720', resolution: '720p', maxVideos: 10, price: perSecond(0.54) },
  { id: 'GGsedanco2.5/480', resolution: '480p', maxVideos: 0, price: perSecond(0.42) },
].map(
  ({ id, resolution, maxVideos, price }): MediaModelSpec => ({
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
    inputs: { maxImages: 30, maxVideos, maxAudios: 10, transport: 'json' },
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
        shapes: ['16:9', '9:16', '1:1'].map((ratio) => ({ ratio, value: ratio })),
        default: '16:9',
        description: '横屏、竖屏或方形',
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
