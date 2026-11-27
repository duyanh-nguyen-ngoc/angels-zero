// ANGELS ZERO — YouTube / YouTube Music playlist player.
// Thin wrapper around the IFrame Player API. No Web Audio node is created here:
// music is a separate <iframe> element, so all jet / radio / VWS SFX stay intact.
// The game shell injects this controller into audio.js so every legacy BGM call
// site keeps working without throwing.

const STORE_KEY = 'angelsZero_ytPlaylist';
const DEFAULT_LIST = 'PLRBp0Fe2GpgnIh0AiYKh7o7HnYAej-5ph';   // NCS Copyright-Free Music
const PRESETS = [
  { label: 'NCS FLIGHT MIX', id: DEFAULT_LIST },
  { label: 'SYNTHWAVE RADIO', id: '4xDzrJKXOOY' },
  { label: 'ACES SOUNDTRACK MIX', id: 'qd5eXsXd6HE' }
];
const LEGACY_DEAD_IDS = new Set([
  'PLbpi6ZahtOH6BlwVjVwlksnJk_HtpcezE',
  'PLBmJl4Wgkfd9Hq2XGF8Y8bqf4vVnX8jPl',
  'PL0s8V4XQd8lH4YtQZb1J8p3dKq6nFg2Rt'
]);
const MAX_ERRORS = 3;

export function createYouTubeMusic(opts = {}) {
  const noBgm = !!opts.noBgm;
  const info = { ready: false, playing: false, title: '—', artist: '', status: 'OFF',
    playlist: '', video: '', auto: true, shuffle: false, volume: 100, ducked: false, errors: 0 };
  let player = null, apiLoading = false, changeCb = null, wantsPlay = false,
    duckTimer = null, errorStreak = 0, volume = 100, pending = null, currentSource = null;

  // ---------------------------------------------------------------- URL parsing
  function parse(str) {
    if (!str || typeof str !== 'string') return null;
    const s = str.trim();
    if (!s) return null;
    const listMatch = s.match(/[?&]list=([\w-]+)/);
    const videoMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:shorts|live|embed)\/|[?&]v=)([\w-]{11})/);
    if (listMatch) {
      const listId = listMatch[1];
      const videoId = videoMatch ? videoMatch[1] : '';
      if (/^RD(?!CLAK5uy_)/.test(listId) && videoId) {
        return { kind: 'video', id: videoId, fallbackList: listId };
      }
      return { kind: 'playlist', id: listId, fallbackVideo: videoId };
    }
    if (videoMatch) return { kind: 'video', id: videoMatch[1] };
    if (/^(PL[\w-]{10,}|OLAK5uy_[\w-]+|RDCLAK5uy_[\w-]+|UU[\w-]{10,}|LL[\w-]*)$/.test(s)) {
      return { kind: 'playlist', id: s };
    }
    if (/^[\w-]{11}$/.test(s)) return { kind: 'video', id: s };
    return null;
  }

  function applySource(p) {
    if (!p || !player || !info.ready) return;
    currentSource = p;
    try {
      if (p.kind === 'playlist') {
        player.loadPlaylist({ listType: 'playlist', list: p.id, index: 0 });
      } else {
        player.loadVideoById(p.id);
      }
      if (wantsPlay) player.playVideo();
    } catch (e) { info.status = 'YT ERROR'; emit(); }
  }

  // ---------------------------------------------------------------- API loading
  function apiReady() {
    if (!window.YT || !window.YT.Player) { info.status = 'API FAIL'; emit(); return; }
    const host = document.createElement('div');
    host.id = 'azYtPlayer';
    host.style.cssText = 'position:fixed;left:-2px;top:-2px;width:2px;height:2px;opacity:0.001;pointer-events:none;z-index:-1;';
    document.body.appendChild(host);
    const playerVars = { playsinline: 1, controls: 0, modestbranding: 1, rel: 0 };
    if (location.protocol === 'http:' || location.protocol === 'https:') {
      playerVars.origin = location.origin;
    }
    player = new window.YT.Player(host, {
      width: '2', height: '2',
      playerVars,
      events: {
        onReady: () => {
          info.ready = true; info.status = info.playing ? 'YT PLAY' : 'YT READY';
          try { player.setShuffle(info.shuffle ? true : false); } catch (e) { /* ignore */ }
          applyVolume();
          if (pending) {
            const p = pending;
            pending = null;
            applySource(p);
          } else if (wantsPlay) {
            play();
          }
          emit();
        },
        onStateChange: e => {
          const YTS = window.YT.PlayerState;
          info.playing = e.data === YTS.PLAYING;
          info.status = e.data === YTS.PLAYING ? 'YT PLAY'
            : e.data === YTS.PAUSED ? 'YT PAUSED'
              : e.data === YTS.BUFFERING ? 'YT BUFFER' : 'YT READY';
          if (info.playing) errorStreak = 0;
          if (player && player.getVideoData) {
            const vd = player.getVideoData();
            if (vd && vd.title) { info.title = vd.title; info.artist = vd.author || ''; }
          }
          emit();
        },
        onError: e => {
          if (currentSource && currentSource.kind === 'playlist' && currentSource.fallbackVideo) {
            const fallback = { kind: 'video', id: currentSource.fallbackVideo };
            currentSource.fallbackVideo = '';
            errorStreak = 0;
            info.playlist = '';
            info.video = fallback.id;
            applySource(fallback);
            emit();
            return;
          }
          info.errors++; errorStreak++;
          if (errorStreak >= MAX_ERRORS) {
            info.status = 'YT ERROR'; info.playing = false;
            if (opts.onToast) opts.onToast('YT EMBED BLOCKED — PASTE A NEW PLAYLIST');
            emit();
            return;
          }
          if (info.auto && player && player.nextVideo) {
            try { player.nextVideo(); } catch (err) { /* ignore */ }
          }
        }
      }
    });
  }
  function loadApi() {
    if (noBgm || player) return;
    if (window.YT && window.YT.Player) { apiReady(); return; }
    if (apiLoading) return;
    apiLoading = true;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const first = document.getElementsByTagName('script')[0];
    (first ? first.parentNode : document.head).insertBefore(tag, first);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); apiLoading = false; apiReady(); };
  }

  // ---------------------------------------------------------------- state / emit
  function emit() { if (changeCb) changeCb(snapshot()); }
  function snapshot() {
    return { title: info.title, scn: info.playing ? 'YT PLAY' : info.status,
      auto: info.auto, shuffle: info.shuffle, status: info.status,
      playing: info.playing, ready: info.ready, errors: info.errors,
      playlist: info.playlist, video: info.video, artist: info.artist };
  }
  function attachChange(cb) { changeCb = cb || null; if (changeCb) emit(); }
  function applyVolume() {
    if (!player || !player.setVolume) return;
    const v = Math.max(0, Math.min(100, Math.round(info.ducked ? volume * 0.6 : volume)));
    try { player.setVolume(v); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------- controls
  function play() {
    wantsPlay = true;
    if (!player) { loadApi(); info.status = 'YT LOADING'; emit(); return; }
    try { player.playVideo(); } catch (e) { info.status = 'YT ERROR'; emit(); }
  }
  function pause() { wantsPlay = false; if (player) try { player.pauseVideo(); } catch (e) { /* ignore */ } info.playing = false; info.status = 'YT PAUSED'; emit(); }
  function toggle() { if (info.playing) pause(); else play(); return info.playing; }
  function next() { if (!player) return; try { player.nextVideo ? player.nextVideo() : player.playVideo(); } catch (e) { /* ignore */ } }
  function prev() { if (!player) return; try { player.previousVideo ? player.previousVideo() : player.playVideo(); } catch (e) { /* ignore */ } }
  function setShuffle(on) { info.shuffle = !!on; if (player && player.setShuffle) try { player.setShuffle(info.shuffle); } catch (e) { /* ignore */ } emit(); }
  function setVolume(v) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    info.volume = volume;
    applyVolume(); emit();
  }
  function duck(on) {
    info.ducked = !!on;
    applyVolume();
    if (duckTimer) { clearTimeout(duckTimer); duckTimer = null; }
    if (info.ducked) duckTimer = setTimeout(() => duck(false), 1400);
  }
  function loadInput(str) {
    const p = parse(str);
    if (!p) { info.status = 'BAD URL'; emit(); return false; }
    info.playlist = p.kind === 'playlist' ? p.id : '';
    info.video = p.kind === 'video' ? p.id : '';
    info.title = p.kind === 'video' ? 'YouTube track ' + p.id : 'YouTube playlist';
    info.errors = 0; errorStreak = 0; wantsPlay = true;
    try { localStorage.setItem(STORE_KEY, str.trim()); } catch (e) { /* ignore */ }
    loadApi();
    if (!player || !info.ready) {
      pending = p;
      info.status = 'YT LOADING';
      emit();
      return true;
    }
    applySource(p);
    emit();
    return true;
  }
  function resetDefault() { loadInput(DEFAULT_LIST); }
  function restore() {
    let saved = '';
    try { saved = localStorage.getItem(STORE_KEY) || ''; } catch (e) { /* ignore */ }
    if (saved && !LEGACY_DEAD_IDS.has(saved.trim())) loadInput(saved);
    else resetDefault();
  }
  function setAuto(on) { info.auto = !!on; if (!info.auto) setShuffle(false); emit(); }
  function start() { loadApi(); restore(); }
  function status() { return snapshot(); }

  return { parse, presets: PRESETS, attachChange, play, pause, toggle, next, prev,
    setShuffle, setVolume, duck, loadInput, resetDefault, restore, setAuto, start, status,
    get info() { return info; }, get ready() { return info.ready; } };
}
