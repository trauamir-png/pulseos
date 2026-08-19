/** Extracts the numeric video id from a standard TikTok video URL, e.g. https://www.tiktok.com/@user/video/1234567890123456789. Returns null for shortened (vm.tiktok.com) or otherwise non-standard links -- those still store fine, they just can't get an inline dashboard preview. */
export function extractTikTokVideoId(url: string): string | null {
  const match = url.match(/\/video\/(\d+)/);
  return match ? match[1] : null;
}
