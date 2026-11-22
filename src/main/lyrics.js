'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { fetchWithTimeout, normalizeSearch } = require('./artwork');

const LRC_TIME = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TIME = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toSeconds(minutes, seconds, fraction) {
  let sub = 0;
  if (fraction !== undefined) {
    if (fraction.length === 1) sub = Number(fraction) / 10;
    else if (fraction.length === 2) sub = Number(fraction) / 100;
    else sub = Number(fraction) / 1000;
  }
  return Number(minutes) * 60 + Number(seconds) + sub;
}

function normalizeTitle(value) {
  return normalizeSearch(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  if (!value) return '';
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ({
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    }[name.toLowerCase()] ?? match));
}

function parseLrc(raw) {
  if (!raw) return [];
  const cleaned = String(raw).replace(/^\uFEFF/, '').replace(/\r/g, '');
  const lines = [];
  for (const sourceLine of cleaned.split('\n')) {
    const timestamps = [];
    let match;
    LRC_TIME.lastIndex = 0;
    while ((match = LRC_TIME.exec(sourceLine)) !== null) {
      timestamps.push(toSeconds(match[1], match[2], match[3]));
    }
    let content = sourceLine.replace(LRC_TIME, '');
    const words = [];
    WORD_TIME.lastIndex = 0;
    const wordMatches = [...content.matchAll(WORD_TIME)];
    if (wordMatches.length >= 2) {
      for (let index = 0; index < wordMatches.length; index += 1) {
        const current = wordMatches[index];
        const start = current.index + current[0].length;
        const end = index + 1 < wordMatches.length ? wordMatches[index + 1].index : content.length;
        const text = content.slice(start, end).trim();
        if (!text) continue;
        words.push({
          time: toSeconds(current[1], current[2], current[3]),
          text,
        });
      }
      content = content.replace(WORD_TIME, '');
    }
    const text = content.trim();
    if (!text || !timestamps.length) continue;
    for (const time of timestamps) {
      lines.push({ time, text, ...(words.length ? { words: words.map((word) => ({ ...word })) } : {}) });
    }
  }
  const unique = new Map();
  for (const line of lines) {
    const key = `${line.time.toFixed(2)}|${line.text}`;
    if (!unique.has(key)) unique.set(key, line);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

function parseYrc(raw) {
  if (!raw) return [];
  const lines = [];
  for (const sourceLine of String(raw).replace(/\r/g, '').split('\n')) {
    const lineMatch = /^\[(\d+),(\d+)\](.*)$/.exec(sourceLine.trim());
    if (!lineMatch) continue;
    const lineStart = Number(lineMatch[1]) / 1000;
    const content = lineMatch[3];
    const segments = [...content.matchAll(/\((\d+),(\d+),([^)]*)\)/g)];
    if (!segments.length) continue;
    const words = [];
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      // YRC stores the word text after the timing tuple:
      // [lineStart,lineDuration](wordStart,wordDuration,flag)word...
      const textStart = segment.index + segment[0].length;
      const textEnd = index + 1 < segments.length ? segments[index + 1].index : content.length;
      const text = decodeHtml(content.slice(textStart, textEnd));
      if (!text) continue;
      words.push({ time: Number(segment[1]) / 1000, text });
    }
    if (!words.length) continue;
    lines.push({ time: lineStart, text: words.map((word) => word.text).join(''), words });
  }
  return lines;
}

function mergeTranslation(lines, translationRaw) {
  const translations = parseLrc(translationRaw);
  if (!translations.length) return false;
  for (const line of lines) {
    let best = null;
    let bestDelta = Infinity;
    for (const translation of translations) {
      const delta = Math.abs(translation.time - line.time);
      if (delta < bestDelta && delta <= 0.8) {
        best = translation;
        bestDelta = delta;
      }
    }
    if (best && best.text && best.text !== line.text) line.translation = best.text;
  }
  return lines.some((line) => line.translation);
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.82;
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (!aTokens.size || !bTokens.size) return 0;
  let overlap = 0;
  for (const token of aTokens) if (bTokens.has(token)) overlap += 1;
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function candidateScore(candidate, target) {
  const title = normalizeTitle(candidate.title);
  const artist = normalizeTitle(candidate.artist);
  const targetTitle = normalizeTitle(target.title);
  const targetArtist = normalizeTitle(target.artist);
  const titleScore = similarity(title, targetTitle);
  const artistScore = similarity(artist, targetArtist);
  // A fuzzy artist or duration match must never be enough to attach unrelated
  // lyrics to a song. Requiring a meaningful title match avoids embarrassing
  // mismatches (for example obscure tracks resolving to a different song).
  if (titleScore < 0.45) return 0;
  let durationScore = 0.5;
  if (candidate.durationSec && target.durationSec) {
    const diff = Math.abs(candidate.durationSec - target.durationSec);
    durationScore = diff <= 2 ? 1 : diff <= 6 ? 0.8 : diff <= 12 ? 0.55 : diff <= 25 ? 0.2 : 0;
  }
  return titleScore * 0.64 + artistScore * 0.24 + durationScore * 0.12;
}

function pickCandidate(candidates, target) {
  let best = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    const score = candidateScore(candidate, target);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (bestScore < 0.42) return null;
  return { ...best, matchScore: bestScore };
}

function noLyricsResult(providers) {
  return {
    synced: false,
    lines: [],
    plainLines: [],
    source: '',
    providers,
    instrumental: false,
    fetchedAt: Date.now(),
  };
}

class LyricsService {
  constructor() {
    this.cache = new Map();
    this.inflight = new Map();
    this.cacheFile = path.join(app.getPath('userData'), 'lyrics-cache-v3.json');
    this.load();
    this.saveTimer = null;
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      for (const [key, value] of Object.entries(raw || {})) {
        if (value && Array.isArray(value.lines)) this.cache.set(key, value);
      }
    } catch {
      /* first run */
    }
  }

  saveSoon() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const entries = [...this.cache.entries()]
          .sort((a, b) => (b[1].fetchedAt || 0) - (a[1].fetchedAt || 0))
          .slice(0, 600);
        fs.mkdirSync(path.dirname(this.cacheFile), { recursive: true });
        fs.writeFileSync(this.cacheFile, JSON.stringify(Object.fromEntries(entries)), 'utf8');
      } catch {
        /* cache is optional */
      }
    }, 800);
  }

  cacheKey(track) {
    return `${normalizeTitle(track.title)}|${normalizeTitle(track.artist)}`.toLowerCase();
  }

  localLrcDirectories(customDir) {
    const dirs = new Set();
    if (customDir) dirs.add(customDir);
    const appData = process.env.APPDATA || '';
    const localAppData = process.env.LOCALAPPDATA || '';
    const userProfile = process.env.USERPROFILE || '';
    const candidates = [
      path.join(app.getPath('music'), 'Lyrics'),
      path.join(app.getPath('documents'), 'Lyrics'),
      appData && path.join(appData, 'Tencent', 'QQMusic'),
      localAppData && path.join(localAppData, 'Netease', 'CloudMusic'),
      appData && path.join(appData, 'KuGou'),
      localAppData && path.join(localAppData, 'KuGou'),
      localAppData && path.join(localAppData, 'Packages', 'AppleInc.AppleMusicWin_nzyj5cx40ttqa', 'LocalState'),
      userProfile && path.join(userProfile, 'Music'),
    ].filter(Boolean);
    for (const candidate of candidates) dirs.add(candidate);
    return [...dirs];
  }

  collectLrcFiles(dirs, customDir) {
    const now = Date.now();
    const cacheKey = `${customDir || ''}|${dirs.join('|')}`;
    if (this.localFileCache && this.localFileCache.key === cacheKey && now - this.localFileCache.at < 60000) {
      return this.localFileCache.files;
    }
    const files = [];
    const seen = new Set();
    const walk = (directory, depth, budget) => {
      if (!directory || depth > 4 || files.length >= 2200 || budget.remaining <= 0) return;
      let entries;
      try {
        entries = fs.readdirSync(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (budget.remaining <= 0 || files.length >= 2200) break;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'Cache') continue;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          if (depth < 4) walk(fullPath, depth + 1, budget);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.lrc')) {
          if (seen.has(fullPath)) continue;
          seen.add(fullPath);
          budget.remaining -= 1;
          files.push({ path: fullPath, name: entry.name, explicit: customDir && fullPath.startsWith(customDir) });
        }
      }
    };
    for (const dir of dirs) {
      walk(dir, 0, { remaining: customDir ? 400 : 180 });
      if (customDir && files.length) break;
    }
    this.localFileCache = { key: cacheKey, at: now, files };
    return files;
  }

  findLocalLyrics(track, customDir) {
    const targetTitle = normalizeTitle(track.title);
    const targetArtist = normalizeTitle(track.artist);
    if (!targetTitle) return null;
    const dirs = this.localLrcDirectories(customDir);
    const files = this.collectLrcFiles(dirs, customDir);
    if (!files.length) return null;
    const scored = [];
    for (const file of files) {
      const base = normalizeTitle(file.name.replace(/\.lrc$/i, ''));
      let score = 0;
      if (base && (base.includes(targetTitle) || targetTitle.includes(base))) score += 3;
      if (targetArtist && base.includes(targetArtist)) score += 1;
      if (file.explicit) score += 0.2;
      if (score > 0) scored.push({ ...file, score });
    }
    scored.sort((a, b) => b.score - a.score);
    for (const file of scored.slice(0, 12)) {
      try {
        const raw = fs.readFileSync(file.path, 'utf8');
        const lines = parseLrc(raw);
        if (!lines.length) continue;
        return this.buildResult('本地歌词', lines, raw, null);
      } catch {
        /* try next file */
      }
    }
    return null;
  }

  async addNeteaseTranslation(track, lines) {
    if (!lines?.length) return false;
    try {
      const query = `${track.title || ''} ${track.artist || ''}`.trim();
      if (!query) return false;
      const searchUrl = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=10`;
      const searchResponse = await fetchWithTimeout(searchUrl, {
        timeout: 2500,
        headers: { Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=2.9.7' },
      });
      if (!searchResponse.ok) return false;
      const search = await searchResponse.json();
      const songs = search?.result?.songs || [];
      const candidates = songs.map((song) => ({
        title: song.name,
        artist: (song.artists || []).map((artist) => artist.name).join('/'),
        durationSec: (song.duration || 0) / 1000,
        id: song.id,
      }));
      const best = pickCandidate(candidates, {
        title: track.title || '',
        artist: track.artist || '',
        durationSec: track.durationMs ? track.durationMs / 1000 : null,
      });
      if (!best?.id) return false;
      const lyricResponse = await fetchWithTimeout(
        `https://music.163.com/api/song/lyric?id=${best.id}&lv=1&tv=-1`,
        { timeout: 2500, headers: { Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=2.9.7' } },
      );
      if (!lyricResponse.ok) return false;
      const data = await lyricResponse.json();
      return mergeTranslation(lines, data?.tlyric?.lyric);
    } catch {
      return false;
    }
  }

  async lookup(track, options = {}) {
    const providers = (options.providers || ['lrclib', 'netease', 'qq', 'kugou'])
      .filter((provider) => ['lrclib', 'netease', 'qq', 'kugou'].includes(provider));
    const key = this.cacheKey(track);
    const cached = this.cache.get(key);
    if (!options.forceRefresh && cached && cached.lines?.length) {
      const result = { ...cached, cached: true };
      if (options.showTranslation && !result.hasTranslation && result.source !== '网易云音乐') {
        const translated = await this.addNeteaseTranslation(track, result.lines);
        if (translated) {
          result.hasTranslation = true;
          cached.hasTranslation = true;
        }
      }
      return result;
    }
    if (this.inflight.has(key)) return this.inflight.get(key);

    const promise = this.resolve(track, providers, key, options)
      .then(async (result) => {
        if (options.showTranslation && result.lines?.length && !result.hasTranslation && result.source !== '网易云音乐') {
          const translated = await this.addNeteaseTranslation(track, result.lines);
          if (translated) {
            result.hasTranslation = true;
            const cachedResult = this.cache.get(key);
            if (cachedResult) cachedResult.hasTranslation = true;
          }
        }
        return result;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  async resolve(track, providers, key, options = {}) {
    const target = {
      title: track.title || '',
      artist: track.artist || '',
      durationSec: track.durationMs ? track.durationMs / 1000 : null,
    };
    if (!target.title) return noLyricsResult(providers);

    if (options.preferLocalLyrics) {
      const local = this.findLocalLyrics(track, options.localLyricsDir || '');
      if (local) {
        const payload = { ...local, key, providers: ['local'], fetchedAt: Date.now() };
        this.cache.set(key, payload);
        this.saveSoon();
        return payload;
      }
    }

    let plainFallback = null;
    const attempted = [];
    for (const provider of providers) {
      attempted.push(provider);
      try {
        const result = await this[`from_${provider}`](target);
        if (!result || !result.lines?.length) continue;
        if (result.synced) {
          const payload = { ...result, key, providers: attempted, fetchedAt: Date.now() };
          this.cache.set(key, payload);
          this.saveSoon();
          return payload;
        }
        if (!plainFallback) plainFallback = result;
      } catch {
        /* try next provider */
      }
    }
    if (plainFallback) {
      const payload = { ...plainFallback, key, providers: attempted, fetchedAt: Date.now() };
      this.cache.set(key, payload);
      this.saveSoon();
      return payload;
    }
    return noLyricsResult(providers);
  }

  async from_lrclib(target) {
    const base = 'https://lrclib.net/api';
    const directParams = new URLSearchParams({
      track_name: target.title,
      artist_name: target.artist,
      album_name: '',
    });
    if (target.durationSec) directParams.set('duration', String(Math.round(target.durationSec)));
    let response = await fetchWithTimeout(`${base}/get?${directParams.toString()}`);
    if (response.ok) {
      const data = await response.json();
      const lines = parseLrc(data.syncedLyrics);
      if (lines.length) return this.buildResult('LRCLIB', lines, data.syncedLyrics, data.plainLyrics);
      if (data.plainLyrics) return this.plainResult('LRCLIB', data.plainLyrics);
    }

    const searchParams = new URLSearchParams({ track_name: target.title, artist_name: target.artist });
    response = await fetchWithTimeout(`${base}/search?${searchParams.toString()}`);
    if (!response.ok) return null;
    const list = await response.json();
    const candidates = (Array.isArray(list) ? list : [])
      .filter((item) => item.syncedLyrics || item.plainLyrics)
      .map((item) => ({
        title: item.trackName,
        artist: item.artistName,
        durationSec: item.duration,
        data: item,
      }));
    const best = pickCandidate(candidates, target);
    if (!best) return null;
    if (best.data.syncedLyrics) {
      const lines = parseLrc(best.data.syncedLyrics);
      if (lines.length) return this.buildResult('LRCLIB', lines, best.data.syncedLyrics, best.data.plainLyrics);
    }
    return this.plainResult('LRCLIB', best.data.plainLyrics);
  }

  async from_netease(target) {
    const query = `${target.title} ${target.artist}`.trim();
    const searchUrl = `https://music.163.com/api/search/get/web?csrf_token=&s=${encodeURIComponent(query)}&type=1&offset=0&total=true&limit=10`;
    const searchResponse = await fetchWithTimeout(searchUrl, {
      headers: { Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=2.9.7' },
    });
    if (!searchResponse.ok) return null;
    const search = await searchResponse.json();
    const songs = search?.result?.songs || [];
    const candidates = songs.map((song) => ({
      title: song.name,
      artist: (song.artists || []).map((artist) => artist.name).join('/'),
      durationSec: (song.duration || 0) / 1000,
      id: song.id,
    }));
    const best = pickCandidate(candidates, target);
    if (!best) return null;
    const lyricUrl = `https://music.163.com/api/song/lyric?id=${best.id}&lv=1&kv=1&tv=-1&yv=1&ytv=1&yrc=1`;
    const lyricResponse = await fetchWithTimeout(lyricUrl, {
      headers: { Referer: 'https://music.163.com/', Cookie: 'os=pc; appver=2.9.7' },
    });
    if (!lyricResponse.ok) return null;
    const lyricData = await lyricResponse.json();
    const rawYrc = lyricData?.yrc?.lyric;
    const yrcLines = parseYrc(rawYrc);
    if (yrcLines.length) {
      mergeTranslation(yrcLines, lyricData?.tlyric?.lyric);
      return this.buildResult('网易云音乐', yrcLines, rawYrc, null);
    }
    const raw = lyricData?.lrc?.lyric;
    const lines = parseLrc(raw);
    if (!lines.length) return null;
    mergeTranslation(lines, lyricData?.tlyric?.lyric);
    return this.buildResult('网易云音乐', lines, raw, null);
  }

  async from_qq(target) {
    const query = `${target.title} ${target.artist}`.trim();
    const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?ct=24&qqmusic_ver=1298&new_json=1&remoteplace=txt.yqq.song&searchid=${Date.now()}&t=0&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=10&w=${encodeURIComponent(query)}&format=json`;
    const response = await fetchWithTimeout(url, {
      headers: { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com' },
    });
    if (!response.ok) return null;
    const text = await response.text();
    const data = JSON.parse(text.replace(/^[^{]*\(/, '').replace(/\);?\s*$/, ''));
    const songs = data?.data?.song?.list || [];
    const candidates = songs.map((song) => ({
      title: song.title || song.name,
      artist: (song.singer || []).map((singer) => singer.name).join('/'),
      durationSec: song.interval,
      mid: song.mid,
    }));
    const best = pickCandidate(candidates, target);
    if (!best) return null;
    const lyricUrl = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${best.mid}&format=json&nobase64=1&g_tk=5381`;
    const lyricResponse = await fetchWithTimeout(lyricUrl, {
      headers: {
        Referer: 'https://y.qq.com/portal/player.html',
        Origin: 'https://y.qq.com',
      },
    });
    if (!lyricResponse.ok) return null;
    const rawText = await lyricResponse.text();
    const json = JSON.parse(rawText.replace(/^[^{]*\(/, '').replace(/\);?\s*$/, ''));
    const raw = decodeHtml(json.lyric || '');
    const lines = parseLrc(raw);
    if (!lines.length) return null;
    if (json.trans) mergeTranslation(lines, decodeHtml(json.trans));
    return this.buildResult('QQ 音乐', lines, raw, null);
  }

  async from_kugou(target) {
    const query = `${target.title} ${target.artist}`.trim();
    const searchUrl = `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(query)}&page=1&pagesize=10&showtype=1`;
    const response = await fetchWithTimeout(searchUrl, { headers: { Referer: 'https://www.kugou.com/' } });
    if (!response.ok) return null;
    const data = await response.json();
    const songs = data?.data?.info || [];
    const candidates = songs.map((song) => {
      const filename = song.filename || '';
      const parts = filename.split(' - ');
      const artist = parts.length > 1 ? parts.shift() : song.singername || '';
      const title = parts.length ? parts.join(' - ') : song.songname || filename;
      return {
        title,
        artist,
        durationSec: song.duration,
        hash: song.hash,
        durationMs: song.duration,
      };
    });
    const best = pickCandidate(candidates, target);
    if (!best) return null;
    const lyricSearch = `https://krcs.kugou.com/search?ver=1&man=yes&client=mobi&keyword=${encodeURIComponent(`${best.title} ${best.artist}`)}&duration=${Math.round((best.durationSec || 0) * 1000)}&hash=${best.hash}`;
    const lyricSearchResponse = await fetchWithTimeout(lyricSearch, {
      headers: { Referer: 'https://www.kugou.com/' },
    });
    if (!lyricSearchResponse.ok) return null;
    const lyricSearchData = await lyricSearchResponse.json();
    const lyricCandidates = lyricSearchData?.candidates || [];
    if (!lyricCandidates.length) return null;
    const lyricCandidate = lyricCandidates[0];
    const downloadUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricCandidate.id}&accesskey=${lyricCandidate.accesskey}&fmt=lrc&charset=utf8`;
    const lyricResponse = await fetchWithTimeout(downloadUrl, {
      headers: { Referer: 'https://www.kugou.com/' },
    });
    if (!lyricResponse.ok) return null;
    const lyricData = await lyricResponse.json();
    if (!lyricData?.content) return null;
    const raw = Buffer.from(lyricData.content, 'base64').toString('utf8');
    const lines = parseLrc(raw);
    if (!lines.length) return null;
    return this.buildResult('酷狗音乐', lines, raw, null);
  }

  buildResult(source, lines, raw, plain) {
    const combined = lines.map((line) => line.text).join(' ');
    const instrumental = /纯音乐|没有填词|instrumental|please enjoy/i.test(combined);
    return {
      synced: true,
      lines,
      plainLines: [],
      source,
      raw,
      plain,
      instrumental,
      hasTranslation: lines.some((line) => line.translation),
    };
  }

  plainResult(source, plain) {
    const plainLines = String(plain || '')
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 120);
    if (!plainLines.length) return null;
    return {
      synced: false,
      lines: [],
      plainLines,
      source,
      plain,
      instrumental: false,
      hasTranslation: false,
    };
  }
}

module.exports = {
  LyricsService,
  parseLrc,
  parseYrc,
  mergeTranslation,
  normalizeTitle,
  pickCandidate,
  candidateScore,
};
