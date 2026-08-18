export interface MediaModel {
  id: string;
  name: string;
  premium: boolean;
}

export const IMAGE_MODELS: MediaModel[] = [
  { id: "standard", name: "Standard", premium: false },
  { id: "hd", name: "HD", premium: true },
  { id: "cinematic", name: "Cinematic", premium: true },
];

export const VIDEO_MODELS: MediaModel[] = [
  { id: "video-lite", name: "Lite", premium: false },
  { id: "video-hd", name: "HD", premium: true },
  { id: "video-cinematic", name: "Cinematic", premium: true },
];
