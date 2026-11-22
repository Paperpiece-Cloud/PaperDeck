'use strict';

const crypto = require('node:crypto');

const TIMEOUT = 7000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const { timeout = TIMEOUT, ...fetchOptions } = options;
  const timer = setTimeout(() => controller.abort(), Number(timeout) || TIMEOUT);
  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PaperDeck/1.0',
        ...(fetchOptions.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeSearch(text) {
  return String(text || '')
    .replace(/\(.*?\)|\[.*?\]|（.*?）|【.*?】/g, ' ')
    .replace(/\s*(feat\.?|ft\.?|with)\s+.*$/i, '')
    .replace(/\s*-\s*(remaster(ed)?|live|version|edit|mix).*$/i, '')
    .replace(/[“”"'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectMime(buffer) {
  if (!buffer || buffer.length < 4) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  return 'image/jpeg';
}

class ArtworkService {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
  }

  keyFor(track) {
    return `${normalizeSearch(track.artist)}|${normalizeSearch(track.title)}|${normalizeSearch(track.album)}`.toLowerCase();
  }

  async getFallback(track) {
    if (!track || (!track.title && !track.artist)) return null;
    const key = this.keyFor(track);
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = this.fetchFallback(track).finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    const result = await promise;
    if (result) {
      if (this.cache.size > 24) this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, result);
    }
    return result;
  }

  async fetchFallback(track) {
    const title = normalizeSearch(track.title);
    const artist = normalizeSearch(track.artist);
    if (!title) return null;
    const query = `${artist} ${title}`.trim();

    const fromItunes = await this.fromItunes(query, title, artist);
    if (fromItunes) return fromItunes;
    const fromQQ = await this.fromQQ(query, title, artist);
    if (fromQQ) return fromQQ;
    return this.fromNetease(query, title, artist);
  }

  async fromItunes(query, title, artist) {
    try {
      const response = await fetchWithTimeout(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=8&country=CN`,
      );
      if (!response.ok) return null;
      const data = await response.json();
      const results = data.results || [];
      const targetTitle = title.toLowerCase();
      const targetArtist = artist.toLowerCase();
      const result = results.find((item) => {
        const t = String(item.trackName || '').toLowerCase();
        const a = String(item.artistName || '').toLowerCase();
        return t.includes(targetTitle) || targetTitle.includes(t) || (targetTitle && a.includes(targetArtist));
      }) || results[0];
      if (!result) return null;
      const url = String(result.artworkUrl100 || result.artworkUrl60 || '').replace(/\/\d+x\d+bb\./, '/600x600bb.');
      if (!url) return null;
      const image = await this.downloadImage(url);
      return image ? { ...image, source: 'iTunes' } : null;
    } catch {
      return null;
    }
  }

  async fromNetease(query, title, artist) {
    try {
      const url = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=8`;
      const response = await fetchWithTimeout(url, {
        headers: {
          Referer: 'https://music.163.com/',
          Cookie: 'os=pc; appver=2.9.7',
        },
      });
      if (!response.ok) return null;
      const data = await response.json();
      const songs = data?.result?.songs || [];
      const targetTitle = title.toLowerCase();
      const result = songs.find((song) => String(song.name || '').toLowerCase().includes(targetTitle)) || songs[0];
      const cover = result?.album?.picUrl || result?.artists?.[0]?.img1v1Url;
      if (!cover) return null;
      const image = await this.downloadImage(cover);
      return image ? { ...image, source: '网易云音乐' } : null;
    } catch {
      return null;
    }
  }

  async fromQQ(query, title, artist) {
    try {
      const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=${Date.now()}&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=8&w=${encodeURIComponent(query)}&format=json`;
      const response = await fetchWithTimeout(url, {
        headers: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
      });
      if (!response.ok) return null;
      const text = await response.text();
      const data = JSON.parse(text.replace(/^[^{]*\(/, '').replace(/\);?\s*$/, ''));
      const songs = data?.data?.song?.list || [];
      const targetTitle = title.toLowerCase();
      const result = songs.find((song) => String(song.title || song.name || '').toLowerCase().includes(targetTitle)) || songs[0];
      const albumMid = result?.album?.mid;
      if (!albumMid) return null;
      const image = await this.downloadImage(`https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg`);
      return image ? { ...image, source: 'QQ 音乐' } : null;
    } catch {
      return null;
    }
  }

  async downloadImage(url) {
    try {
      const response = await fetchWithTimeout(url);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return null;
      const mime = response.headers.get('content-type')?.split(';')[0] || detectMime(buffer);
      return {
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        hash: crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 12),
      };
    } catch {
      return null;
    }
  }
}

module.exports = { ArtworkService, detectMime, normalizeSearch, fetchWithTimeout };
