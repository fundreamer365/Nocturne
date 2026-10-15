(() => {
  'use strict';

  const DEFAULT_ACCENT = '#a18aff';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const intro        = $('intro');
  const enterBtn     = $('enterBtn');
  const introStatus  = $('introStatus');
  const sceneCanvas  = $('scene');
  const topbar       = $('topbar');
  const nowplaying   = $('nowplaying');
  const npArt        = $('npArt');
  const npTitle      = $('npTitle');
  const npArtist     = $('npArtist');
  const playlist     = $('playlist');
  const playlistList = $('playlistList');
  const playlistEmpty= $('playlistEmpty');
  const playlistClose= $('playlistClose');
  const player       = $('player');
  const progress     = $('progress');
  const progressFill = $('progressFill');
  const progressThumb= $('progressThumb');
  const timeCur      = $('timeCur');
  const timeDur      = $('timeDur');
  const playBtn      = $('playBtn');
  const playIcon     = $('playIcon');
  const pauseIcon    = $('pauseIcon');
  const prevBtn      = $('prevBtn');
  const nextBtn      = $('nextBtn');
  const shuffleBtn   = $('shuffleBtn');
  const repeatBtn    = $('repeatBtn');
  const listBtn      = $('listBtn');
  const collapseBtn  = $('collapseBtn');
  const expandBtn    = $('expandBtn');
  const muteBtn      = $('muteBtn');
  const volume       = $('volume');
  const volumeFill   = $('volumeFill');
  const volIconHigh  = $('volIconHigh');
  const volIconLow   = $('volIconLow');
  const volIconMute  = $('volIconMute');
  const toast        = $('toast');

  // ---------- Состояние ----------
  const state = {
    tracks: [],
    index: -1,
    shuffled: false,
    shuffleOrder: [],
    repeat: 'off',
    volume: 0.8,
    muted: false,
    accent: DEFAULT_ACCENT,
    entered: false,
    playing: false
  };

  // ---------- Аудио ----------
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.crossOrigin = 'anonymous';
  audio.volume = state.volume;

  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let analyserData = null;
  let audioGraphTried = false;

  function initAudioGraph() {
    if (audioGraphTried) return;
    audioGraphTried = true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      sourceNode = audioCtx.createMediaElementSource(audio);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.86;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (err) {
      console.warn('[Nocturne] Аудиограф недоступен:', err);
      audioCtx = null; analyser = null;
    }
  }

  function resumeAudioCtx() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  }

  // ---------- Утилиты ----------
  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function showToast(msg, ms = 4200) {
    toast.textContent = msg;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => { toast.hidden = true; }, 450);
    }, ms);
  }

  function safeAccent(color, fallback) {
    if (typeof color !== 'string') return fallback;
    const c = color.trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    return fallback;
  }

  function shade(hex, amt) {
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const num = parseInt(h, 16);
    let r = (num >> 16) & 255;
    let g = (num >> 8) & 255;
    let b = num & 255;
    r = Math.max(0, Math.min(255, Math.round(r + 255 * amt)));
    g = Math.max(0, Math.min(255, Math.round(g + 255 * amt)));
    b = Math.max(0, Math.min(255, Math.round(b + 255 * amt)));
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function applyAccent(accent) {
    const a = safeAccent(accent, DEFAULT_ACCENT);
    document.documentElement.style.setProperty('--accent', a);
    const darker = shade(a, -0.18) || a;
    document.documentElement.style.setProperty('--accent-2', darker);
  }

  // ---------- Загрузка плейлиста ----------
  async function loadPlaylist() {
    let data;
    try {
      const res = await fetch('./track.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.error('[Nocturne] Ошибка загрузки track.json:', err);
      throw new Error(
        'Не удалось загрузить track.json. Проверьте, что файл существует, содержит корректный JSON ' +
        'и сайт открыт через HTTP-сервер (не file://).'
      );
    }
    if (!Array.isArray(data)) throw new Error('track.json должен содержать массив треков.');

    const tracks = [];
    for (let i = 0; i < data.length; i++) {
      const raw = data[i] || {};
      if (!raw.file || typeof raw.file !== 'string') {
        console.warn('[Nocturne] Пропущен трек без "file":', raw);
        continue;
      }
      tracks.push({
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Untitled ${i + 1}`,
        artist: typeof raw.artist === 'string' ? raw.artist.trim() : '',
        file: raw.file.trim(),
        cover: typeof raw.cover === 'string' ? raw.cover.trim() : '',
        accent: safeAccent(raw.accent, '')
      });
    }
    return tracks;
  }

  // ---------- Плейлист UI ----------
  function renderPlaylist() {
    playlistList.innerHTML = '';
    if (!state.tracks.length) {
      playlistEmpty.hidden = false;
      return;
    }
    playlistEmpty.hidden = true;

    const frag = document.createDocumentFragment();
    state.tracks.forEach((t, i) => {
      const li = document.createElement('li');
      li.className = 'track';
      li.dataset.index = String(i);
      li.setAttribute('role', 'button');
      li.tabIndex = 0;

      const idx = document.createElement('span');
      idx.className = 'track__idx';
      idx.textContent = String(i + 1).padStart(2, '0');

      const bar = document.createElement('span');
      bar.className = 'track__bar';
      bar.innerHTML = '<i></i><i></i><i></i>';

      const meta = document.createElement('span');
      meta.className = 'track__meta';
      const title = document.createElement('span');
      title.className = 'track__title';
      title.textContent = t.title;
      meta.appendChild(title);
      if (t.artist) {
        const a = document.createElement('span');
        a.className = 'track__artist';
        a.textContent = t.artist;
        meta.appendChild(a);
      }

      li.appendChild(idx);
      li.appendChild(bar);
      li.appendChild(meta);
      frag.appendChild(li);
    });
    playlistList.appendChild(frag);
    highlightCurrent();
  }

  function highlightCurrent() {
    playlistList.querySelectorAll('.track').forEach((el) => {
      el.classList.toggle('is-current', Number(el.dataset.index) === state.index);
    });
  }

  function updateNowPlaying() {
    const t = state.tracks[state.index];
    if (!t) {
      npTitle.textContent = '—';
      npArtist.textContent = '—';
      setCover('');
      updateMediaSession();
      return;
    }
    npTitle.textContent = t.title;
    npArtist.textContent = t.artist || 'Unknown artist';
    document.title = `${t.title}${t.artist ? ' — ' + t.artist : ''} · Nocturne`;
    setCover(t.cover);
    updateMediaSession();
  }

  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !window.MediaMetadata) return;
    const t = state.tracks[state.index];
    if (!t) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title,
        artist: t.artist || 'Unknown artist',
        album: 'Nocturne',
        artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    } catch (e) { /* ignore */ }
  }

  function setCover(url) {
    const old = npArt.querySelector('img');
    if (old) old.remove();
    const placeholder = npArt.querySelector('.nowplaying__artPlaceholder');
    if (!url) {
      if (placeholder) placeholder.style.display = '';
      return;
    }
    const img = new Image();
    img.alt = '';
    img.decoding = 'async';
    img.loading = 'lazy';
    img.onload = () => {
      if (placeholder) placeholder.style.display = 'none';
      npArt.appendChild(img);
    };
    img.onerror = () => {
      if (placeholder) placeholder.style.display = '';
    };
    img.src = url;
  }

  // ---------- Воспроизведение ----------
  function setPlayingUI(playing) {
    state.playing = playing;
    playIcon.hidden = playing;
    pauseIcon.hidden = !playing;
  }

  function loadTrack(index, autoplay = true) {
    if (!state.tracks.length) return;
    if (index < 0) index = state.tracks.length - 1;
    if (index >= state.tracks.length) index = 0;
    state.index = index;

    const t = state.tracks[index];
    const accent = t.accent || DEFAULT_ACCENT;
    state.accent = accent;
    applyAccent(accent);
    if (scene && scene.setAccent) scene.setAccent(accent);

    audio.src = t.file;
    audio.load();
    updateNowPlaying();
    highlightCurrent();
    setPlayingUI(false);

    if (autoplay) playCurrent();
  }

  function playCurrent() {
    resumeAudioCtx();
    const p = audio.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setPlayingUI(true))
       .catch((err) => {
         console.warn('[Nocturne] play() отклонён:', err);
         setPlayingUI(false);
         showToast('Не удалось воспроизвести трек. Проверьте путь к файлу.');
       });
    }
  }

  function togglePlay() {
    if (state.index < 0) {
      if (state.tracks.length) loadTrack(0, true);
      return;
    }
    if (audio.paused) playCurrent();
    else audio.pause();
  }

  function nextTrack(auto = false) {
    if (!state.tracks.length) return;
    if (state.repeat === 'one' && auto) {
      audio.currentTime = 0;
      playCurrent();
      return;
    }
    let next;
    if (state.shuffled) {
      next = nextShuffled();
    } else {
      next = state.index + 1;
      if (next >= state.tracks.length) {
        if (state.repeat === 'all' || !auto) next = 0;
        else { setPlayingUI(false); return; }
      }
    }
    loadTrack(next, true);
  }

  function prevTrack() {
    if (!state.tracks.length) return;
    if (audio.currentTime > 3 && !audio.paused) {
      audio.currentTime = 0;
      return;
    }
    let prev;
    if (state.shuffled && state.shuffleOrder.length) {
      const pos = state.shuffleOrder.indexOf(state.index);
      prev = state.shuffleOrder[(pos - 1 + state.shuffleOrder.length) % state.shuffleOrder.length];
    } else {
      prev = state.index - 1;
      if (prev < 0) prev = state.tracks.length - 1;
    }
    loadTrack(prev, true);
  }

  function buildShuffleOrder() {
    const arr = state.tracks.map((_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (state.index >= 0) {
      const pos = arr.indexOf(state.index);
      if (pos > 0) {
        arr.splice(pos, 1);
        arr.unshift(state.index);
      }
    }
    state.shuffleOrder = arr;
  }

  function nextShuffled() {
    if (!state.shuffleOrder.length) buildShuffleOrder();
    const pos = state.shuffleOrder.indexOf(state.index);
    const nextPos = pos + 1;
    if (nextPos >= state.shuffleOrder.length) {
      if (state.repeat === 'all' || state.repeat === 'off') {
        buildShuffleOrder();
        return state.shuffleOrder[0];
      }
      return state.index;
    }
    return state.shuffleOrder[nextPos];
  }

  // ---------- Прогресс / громкость ----------
  function updateProgress() {
    const d = audio.duration;
    const c = audio.currentTime;
    if (isFinite(d) && d > 0) {
      const pct = Math.max(0, Math.min(100, (c / d) * 100));
      progressFill.style.width = pct + '%';
      progressThumb.style.left = pct + '%';
      progress.setAttribute('aria-valuenow', String(Math.round(pct)));
    } else {
      progressFill.style.width = '0%';
      progressThumb.style.left = '0%';
    }
    timeCur.textContent = fmtTime(c);
    timeDur.textContent = fmtTime(d);
  }

  function seekFromEvent(clientX) {
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = progress.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  function updateVolumeUI() {
    const v = state.muted ? 0 : state.volume;
    volumeFill.style.width = (v * 100) + '%';
    volume.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    volIconHigh.hidden = true;
    volIconLow.hidden = true;
    volIconMute.hidden = true;
    if (state.muted || state.volume === 0) volIconMute.hidden = false;
    else if (state.volume < 0.5) volIconLow.hidden = false;
    else volIconHigh.hidden = false;
    muteBtn.title = state.muted ? 'Включить звук (M)' : 'Выключить звук (M)';
  }

  function setVolumeFromEvent(clientX) {
    const rect = volume.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    state.volume = ratio;
    state.muted = ratio === 0;
    audio.volume = state.volume;
    audio.muted = state.muted;
    updateVolumeUI();
  }

  // ============================================================
  //                          SCENE
  // ============================================================
  let scene = null;

  function createScene() {
    if (window.__NOCTURNE_THREE_FAILED__ || typeof window.THREE === 'undefined') {
      throw new Error('Three.js не загрузился.');
    }
    const THREE = window.THREE;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x01020a, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace || undefined;

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
    camera.position.set(0, 0, 30);
    camera.lookAt(0, 0, 0);

    const world = new THREE.Scene();

    // ---------- Процедурные текстуры ----------

    // Круглый мягкий спрайт (для звёзд и частиц)
    function makeSoftCircleTexture(size = 128) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      g.addColorStop(0.0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.85)');
      g.addColorStop(0.55, 'rgba(200,215,255,0.25)');
      g.addColorStop(1.0, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace || undefined;
      return tex;
    }

    // Мягкое пятно для пыли/туманностей
    function makeNebulaTexture(size = 256) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      g.addColorStop(0.00, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.20, 'rgba(190,180,255,0.55)');
      g.addColorStop(0.45, 'rgba(120,110,220,0.28)');
      g.addColorStop(0.75, 'rgba(70,60,160,0.10)');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace || undefined;
      return tex;
    }

    // Тонкая вспышка/линза для ярких звёзд
    function makeFlareTexture(size = 256) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      g.addColorStop(0.00, 'rgba(255,255,255,1)');
      g.addColorStop(0.10, 'rgba(200,220,255,0.7)');
      g.addColorStop(0.35, 'rgba(140,170,255,0.18)');
      g.addColorStop(1.00, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // крест
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createLinearGradient(0, size/2, size, size/2);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, size/2 - 1, size, 2);
      const lg2 = ctx.createLinearGradient(size/2, 0, size/2, size);
      lg2.addColorStop(0, 'rgba(255,255,255,0)');
      lg2.addColorStop(0.5, 'rgba(255,255,255,0.35)');
      lg2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg2;
      ctx.fillRect(size/2 - 1, 0, 2, size);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace || undefined;
      return tex;
    }

    // Планетарная текстура (безшовная, процедурная)
    function makePlanetTexture(size = 1024) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size / 2;
      const ctx = c.getContext('2d');

      // базовый градиент
      const bg = ctx.createLinearGradient(0, 0, 0, c.height);
      bg.addColorStop(0, '#1d2a4a');
      bg.addColorStop(0.45, '#26355c');
      bg.addColorStop(0.55, '#2c3c63');
      bg.addColorStop(1, '#141b2e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, c.width, c.height);

      // континенты/пятна
      const blobs = 90;
      for (let i = 0; i < blobs; i++) {
        const x = Math.random() * c.width;
        const y = Math.random() * c.height;
        const r = 30 + Math.random() * 180;
        const alpha = 0.03 + Math.random() * 0.10;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        const tint = Math.random();
        let col;
        if (tint < 0.5) col = `rgba(90, 120, 200, ${alpha})`;
        else if (tint < 0.85) col = `rgba(60, 80, 140, ${alpha})`;
        else col = `rgba(160, 140, 220, ${alpha})`;
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // тонкие полосы (атмосферные)
      for (let i = 0; i < 30; i++) {
        const y = Math.random() * c.height;
        const h = 1 + Math.random() * 2.5;
        const alpha = 0.02 + Math.random() * 0.05;
        ctx.fillStyle = `rgba(180, 200, 255, ${alpha})`;
        ctx.fillRect(0, y, c.width, h);
      }

      // шум
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 16;
        d[i] = Math.max(0, Math.min(255, d[i] + n));
        d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
        d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
      }
      ctx.putImageData(img, 0, 0);

      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace || undefined;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
      return tex;
    }

    const softTex   = makeSoftCircleTexture(128);
    const nebulaTex = makeNebulaTexture(256);
    const flareTex  = makeFlareTexture(256);
    const planetTex = makePlanetTexture(1024);

    // ============================================================
    //                       ФОН (куб)
    // ============================================================
    // Далёкий градиент: сфера с шейдером, изнутри видно мягкое свечение
    const skyGeo = new THREE.SphereGeometry(1800, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop:    { value: new THREE.Color(0x030514) },
        uMid:    { value: new THREE.Color(0x070c22) },
        uBottom: { value: new THREE.Color(0x01010a) },
        uAccent: { value: new THREE.Color(0x6a4cff) },
        uTime:   { value: 0 },
        uLevel:  { value: 0 }
      },
      vertexShader: /* glsl */`
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uTop;
        uniform vec3 uMid;
        uniform vec3 uBottom;
        uniform vec3 uAccent;
        uniform float uTime;
        uniform float uLevel;
        varying vec3 vPos;

        // мягкий шум
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){
          vec2 i = floor(p); vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f*f*(3.0-2.0*f);
          return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
        }

        void main() {
          vec3 dir = normalize(vPos);
          float t = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

          // плавная вертикальная градация
          vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, t));
          col = mix(col, uTop, smoothstep(0.45, 1.0, t));

          // мягкое свечение у горизонта, реагирует на музыку
          float glow = exp(-pow((t - 0.42) * 6.0, 2.0));
          col += uAccent * glow * (0.05 + uLevel * 0.10);

          // едва заметный шум, чтобы не было бандинга
          float n = noise(dir.xy * 220.0 + uTime * 0.05) * 0.012;
          col += n;

          // виньетка от направления взгляда (немного темнее по краям)
          float edge = 1.0 - smoothstep(0.0, 1.4, length(dir.xy));
          col *= 0.85 + 0.15 * edge;

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.frustumCulled = false;
    world.add(sky);

    // ============================================================
    //                   ЗВЁЗДНЫЙ КУПОЛ
    // ============================================================
    // Три слоя звёзд с разными размерами и оттенками — даёт глубину.
    function createStarLayer({ count, radiusMin, radiusMax, size, color, twinkle, opacity = 1 }) {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const sizes = new Float32Array(count);
      const phases = new Float32Array(count);
      const speeds = new Float32Array(count);

      const base = new THREE.Color(color);
      const c = new THREE.Color();

      for (let i = 0; i < count; i++) {
        // равномерно по сфере
        const u = Math.random();
        const v = Math.random();
        const theta = 2 * Math.PI * u;
        const phi = Math.acos(2 * v - 1);
        const r = radiusMin + Math.random() * (radiusMax - radiusMin);
        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.cos(phi);
        const z = r * Math.sin(phi) * Math.sin(theta);

        positions[i*3+0] = x;
        positions[i*3+1] = y;
        positions[i*3+2] = z;

        // оттенки: холодно-голубые, белые, чуть тёплые
        const tint = Math.random();
        if (tint < 0.6) c.copy(base);
        else if (tint < 0.85) c.setRGB(1.0, 1.0, 1.0);
        else c.setRGB(1.0, 0.86, 0.72);

        // вариация яркости
        const bright = 0.55 + Math.random() * 0.55;
        colors[i*3+0] = c.r * bright;
        colors[i*3+1] = c.g * bright;
        colors[i*3+2] = c.b * bright;

        sizes[i] = size * (0.6 + Math.random() * 0.9);
        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.4 + Math.random() * 1.6;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
      geo.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

      const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTex: { value: softTex },
          uTime: { value: 0 },
          uLevel: { value: 0 },
          uOpacity: { value: opacity },
          uTwinkle: { value: twinkle },
          uPixelRatio: { value: renderer.getPixelRatio() }
        },
        vertexShader: /* glsl */`
          attribute float aSize;
          attribute float aPhase;
          attribute float aSpeed;
          uniform float uTime;
          uniform float uPixelRatio;
          uniform float uTwinkle;
          varying vec3 vColor;
          varying float vBright;
          void main() {
            vColor = color;
            float tw = 0.75 + uTwinkle * 0.25 * sin(uTime * aSpeed + aPhase);
            vBright = tw;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uPixelRatio * (300.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */`
          uniform sampler2D uTex;
          uniform float uOpacity;
          uniform float uLevel;
          varying vec3 vColor;
          varying float vBright;
          void main() {
            vec4 tex = texture2D(uTex, gl_PointCoord);
            // немного ярче на пиках баса — но без «дискотеки»
            float a = tex.a * uOpacity * vBright * (0.9 + uLevel * 0.4);
            if (a < 0.003) discard;
            gl_FragColor = vec4(vColor * (1.0 + uLevel * 0.3), a);
          }
        `
      });
      mat.vertexColors = true;

      const points = new THREE.Points(geo, mat);
      points.frustumCulled = false;
      return { points, mat, geo };
    }

    const starLayerFar  = createStarLayer({ count: 3800, radiusMin: 900, radiusMax: 1600, size: 1.1, color: 0xbdd0ff, twinkle: 0.4, opacity: 0.85 });
    const starLayerMid  = createStarLayer({ count: 1800, radiusMin: 500, radiusMax: 900,  size: 1.6, color: 0xdfe7ff, twinkle: 0.7, opacity: 0.9 });
    const starLayerNear = createStarLayer({ count:  500, radiusMin: 260, radiusMax: 480,  size: 2.4, color: 0xffffff, twinkle: 1.0, opacity: 1.0 });
    world.add(starLayerFar.points, starLayerMid.points, starLayerNear.points);

    // ============================================================
    //                   ЯРКИЕ ЗВЁЗДЫ (спрайты с линзой)
    // ============================================================
    const brightStars = [];
    const brightGroup = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.SpriteMaterial({
        map: flareTex,
        color: new THREE.Color().setHSL(0.58 + Math.random() * 0.08, 0.5, 0.85),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85
      });
      const sp = new THREE.Sprite(mat);
      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 900 + Math.random() * 600;
      sp.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      const s = 14 + Math.random() * 26;
      sp.scale.set(s, s, 1);
      sp.userData.baseScale = s;
      sp.userData.phase = Math.random() * Math.PI * 2;
      sp.userData.speed = 0.3 + Math.random() * 0.8;
      brightGroup.add(sp);
      brightStars.push(sp);
    }
    world.add(brightGroup);

    // ============================================================
    //                        ТУМАННОСТИ
    // ============================================================
    // Большие мягкие спрайты с аддитивным блендингом создают объёмные облака.
    const nebulaeGroup = new THREE.Group();
    const nebulaColors = [
      [0x6a4cff, 0.055], // фиолетовый
      [0x3f6bff, 0.045], // синий
      [0xa16bff, 0.05],  // пурпурный
      [0x2a7cff, 0.04],  // голубой
      [0xff6a9c, 0.02]   // чуть тёплого для акцента
    ];
    const nebulaSprites = [];
    for (let i = 0; i < 22; i++) {
      const [col, baseOpacity] = nebulaColors[i % nebulaColors.length];
      const mat = new THREE.SpriteMaterial({
        map: nebulaTex,
        color: col,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: baseOpacity
      });
      const sp = new THREE.Sprite(mat);
      const r = 380 + Math.random() * 700;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 1.4) - 0.7); // не строго по экватору
      sp.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi) * 0.6,
        r * Math.sin(phi) * Math.sin(theta)
      );
      const s = 260 + Math.random() * 420;
      sp.scale.set(s, s, 1);
      sp.userData = {
        baseOpacity,
        baseScale: s,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.02,
        drift: 0.02 + Math.random() * 0.05
      };
      nebulaeGroup.add(sp);
      nebulaSprites.push(sp);
    }
    world.add(nebulaeGroup);

    // ============================================================
    //                        ПЛАНЕТА
    // ============================================================
    const planetGroup = new THREE.Group();
    planetGroup.position.set(-160, -30, -420);

    const planetRadius = 90;
    const planetMat = new THREE.MeshStandardMaterial({
      map: planetTex,
      roughness: 0.95,
      metalness: 0.05,
      emissive: new THREE.Color(0x2a3a6a),
      emissiveIntensity: 0.15
    });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(planetRadius, 96, 64), planetMat);
    planet.rotation.z = 0.35;
    planet.rotation.x = 0.15;
    planetGroup.add(planet);

    // Атмосферное свечение — сфера чуть больше, шейдер с rim-эффектом
    const atmoMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(0x6ea8ff) },
        uIntensity: { value: 0.9 },
        uPower: { value: 2.2 }
      },
      vertexShader: /* glsl */`
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uIntensity;
        uniform float uPower;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        void main() {
          float rim = 1.0 - max(dot(vNormalW, vViewDir), 0.0);
          float f = pow(rim, uPower);
          gl_FragColor = vec4(uColor, f * uIntensity);
        }
      `
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(planetRadius * 1.06, 64, 48), atmoMat);
    planetGroup.add(atmosphere);

    // Кольцо с мягким градиентом по альфе через вершинный шейдер
    const ringInner = planetRadius * 1.6;
    const ringOuter = planetRadius * 2.6;
    const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 180, 1);
    // Нормализуем UV для радиального градиента
    {
      const pos = ringGeo.attributes.position;
      const uv = ringGeo.attributes.uv;
      const v3 = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v3.fromBufferAttribute(pos, i);
        const r = v3.length();
        const t = (r - ringInner) / (ringOuter - ringInner);
        uv.setXY(i, t, 0.5);
      }
    }
    const ringMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColorA: { value: new THREE.Color(0xa9b7ff) },
        uColorB: { value: new THREE.Color(0x6a8aff) },
        uOpacity: { value: 0.55 }
      },
      vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float t = vUv.x;
          // мягкие полосы внутри кольца
          float a = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.75, 1.0, t));
          // слабая внутренняя структура
          float stripes = 0.75 + 0.25 * sin(t * 40.0) * 0.5 + 0.25 * sin(t * 90.0) * 0.5;
          a *= stripes;
          vec3 col = mix(uColorA, uColorB, t);
          gl_FragColor = vec4(col, a * uOpacity);
        }
      `
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2 - 0.55;
    ring.rotation.z = 0.1;
    planetGroup.add(ring);

    // Свет, исходящий от планеты (для атмосферного подсвета звёзд рядом — визуально)
    const planetLight = new THREE.PointLight(0x6ea8ff, 0.9, 800, 2);
    planetLight.position.set(0, 0, 0);
    planetGroup.add(planetLight);

    world.add(planetGroup);

    // ============================================================
    //                   ГАЛАКТИЧЕСКИЙ ПОЯС
    // ============================================================
    // Плотная полоса мелких звёзд — имитация Млечного Пути.
    const milkyCount = 2500;
    const mp = new Float32Array(milkyCount * 3);
    const mc = new Float32Array(milkyCount * 3);
    const ms = new Float32Array(milkyCount);
    for (let i = 0; i < milkyCount; i++) {
      // распределяем вокруг наклонной плоскости
      const theta = Math.random() * Math.PI * 2;
      const r = 700 + Math.random() * 900;
      // толщина пояса
      const lat = (Math.random() - 0.5) * 0.22;
      const phi = Math.PI / 2 + lat + (Math.random() - 0.5) * 0.06;

      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.cos(phi);
      const z = r * Math.sin(phi) * Math.sin(theta);
      mp[i*3+0] = x;
      mp[i*3+1] = y;
      mp[i*3+2] = z;

      const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.05, 0.35, 0.75 + Math.random() * 0.2);
      const b = 0.4 + Math.random() * 0.5;
      mc[i*3+0] = c.r * b;
      mc[i*3+1] = c.g * b;
      mc[i*3+2] = c.b * b;

      ms[i] = 0.6 + Math.random() * 1.4;
    }
    const milkyGeo = new THREE.BufferGeometry();
    milkyGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
    milkyGeo.setAttribute('color', new THREE.BufferAttribute(mc, 3));
    milkyGeo.setAttribute('aSize', new THREE.BufferAttribute(ms, 1));
    const milkyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTex: { value: softTex },
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        uniform float uPixelRatio;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPixelRatio * (280.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          float a = t.a * 0.55;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vColor, a);
        }
      `
    });
    milkyMat.vertexColors = true;
    const milky = new THREE.Points(milkyGeo, milkyMat);
    milky.frustumCulled = false;
    milky.rotation.set(0.15, 0.5, -0.3);
    world.add(milky);

    // ============================================================
    //                   БЛИЖНЯЯ ПЫЛЬ
    // ============================================================
    // Небольшие частицы, медленно дрейфующие рядом с камерой.
    const dustCount = 700;
    const dPos = new Float32Array(dustCount * 3);
    const dSize = new Float32Array(dustCount);
    const dPhase = new Float32Array(dustCount);
    const dSpeed = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      dPos[i*3+0] = (Math.random() - 0.5) * 260;
      dPos[i*3+1] = (Math.random() - 0.5) * 160;
      dPos[i*3+2] = -200 + Math.random() * 220;
      dSize[i] = 0.35 + Math.random() * 1.0;
      dPhase[i] = Math.random() * Math.PI * 2;
      dSpeed[i] = 0.2 + Math.random() * 0.6;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    dustGeo.setAttribute('aPhase', new THREE.BufferAttribute(dPhase, 1));
    dustGeo.setAttribute('aSpeed', new THREE.BufferAttribute(dSpeed, 1));
    const dustMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTex: { value: softTex },
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uPixelRatio: { value: renderer.getPixelRatio() }
      },
      vertexShader: /* glsl */`
        attribute float aSize;
        attribute float aPhase;
        attribute float aSpeed;
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vB;
        void main() {
          vec3 p = position;
          p.x += sin(uTime * aSpeed + aPhase) * 0.6;
          p.y += cos(uTime * aSpeed * 0.9 + aPhase) * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = aSize * uPixelRatio * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vB = 0.5 + 0.5 * sin(uTime * aSpeed * 1.3 + aPhase);
        }
      `,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex;
        uniform float uLevel;
        varying float vB;
        void main() {
          vec4 t = texture2D(uTex, gl_PointCoord);
          float a = t.a * (0.18 + vB * 0.35) * (0.7 + uLevel * 0.5);
          if (a < 0.003) discard;
          gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), a);
        }
      `
    });
    const dust = new THREE.Points(dustGeo, dustMat);
    dust.frustumCulled = false;
    world.add(dust);

    // ============================================================
    //                МЯГКИЕ МАЯКИ (медленный дрейф)
    // ============================================================
    // Немного движения в сцене — очень плавное, чтобы не отвлекать.
    const driftGroup = new THREE.Group();
    world.add(driftGroup);

    // ============================================================
    //                     ВВОД / РЕСАЙЗ
    // ============================================================
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointerMove = (e) => {
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      mouse.tx = (t.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (t.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      const pr = Math.min(window.devicePixelRatio || 1, 1.75);
      renderer.setPixelRatio(pr);
      skyMat.uniforms.uTime.value = skyMat.uniforms.uTime.value;
      // обновим pixelRatio во всех материлах
      [starLayerFar, starLayerMid, starLayerNear].forEach((l) => l.mat.uniforms.uPixelRatio.value = pr);
      milkyMat.uniforms.uPixelRatio.value = pr;
      dustMat.uniforms.uPixelRatio.value = pr;
    };
    window.addEventListener('resize', onResize);

    let isVisible = !document.hidden;
    const onVis = () => { isVisible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    // ============================================================
    //                    ЦИКЛ АНИМАЦИИ
    // ============================================================
    const clock = new THREE.Clock();
    let rafId = 0;
    let smoothLevel = 0;
    let smoothBass = 0;

    function animate() {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // В фоновом режиме — работаем в лёгком режиме, но не останавливаем
      const timeScale = isVisible ? 1 : 0.25;

      // Сглаживание мыши
      mouse.x += (mouse.tx - mouse.x) * 0.045;
      mouse.y += (mouse.ty - mouse.y) * 0.045;

      // Аудиоанализ
      let level = 0, bass = 0;
      if (analyser && analyserData) {
        analyser.getByteFrequencyData(analyserData);
        const n = analyserData.length;
        const bassBins = Math.max(6, Math.floor(n * 0.06));
        let sum = 0, bassSum = 0;
        for (let i = 0; i < n; i++) {
          sum += analyserData[i];
          if (i < bassBins) bassSum += analyserData[i];
        }
        level = sum / (n * 255);
        bass  = bassSum / (bassBins * 255);
      }
      smoothLevel += (level - smoothLevel) * 0.12;
      smoothBass  += (bass  - smoothBass)  * 0.18;

      // ---- Камера ----
      // Медленный дрейф + микро-параллакс от мыши.
      const camT = t * 0.03 * timeScale;
      const camX = Math.sin(camT * 0.9) * 4 + Math.cos(camT * 0.31) * 1.5 + mouse.x * 5;
      const camY = Math.sin(camT * 0.7 + 1.2) * 2.2 + -mouse.y * 3.0;
      const camZ = 30 + Math.sin(camT * 0.4) * 2.5;
      camera.position.x += (camX - camera.position.x) * 0.045;
      camera.position.y += (camY - camera.position.y) * 0.045;
      camera.position.z += (camZ - camera.position.z) * 0.045;

      // Взгляд: центр + лёгкий сдвиг от мыши + микро-покачивание
      const lookX = mouse.x * 1.2 + Math.sin(t * 0.11) * 0.4;
      const lookY = -mouse.y * 0.8 + Math.cos(t * 0.09) * 0.3;
      camera.lookAt(lookX, lookY, 0);
      // лёгкий крен — как будто «плывёшь» в невесомости
      camera.rotation.z = Math.sin(t * 0.05) * 0.015 + mouse.x * 0.012;

      // ---- Небо ----
      skyMat.uniforms.uTime.value = t;
      skyMat.uniforms.uLevel.value = smoothLevel;
      sky.position.copy(camera.position); // сфера всегда вокруг камеры

      // ---- Звёзды ----
      starLayerFar.mat.uniforms.uTime.value = t;
      starLayerMid.mat.uniforms.uTime.value = t;
      starLayerNear.mat.uniforms.uTime.value = t;
      starLayerFar.mat.uniforms.uLevel.value = smoothLevel * 0.7;
      starLayerMid.mat.uniforms.uLevel.value = smoothLevel * 0.85;
      starLayerNear.mat.uniforms.uLevel.value = smoothLevel;
      // очень медленное вращение всего звёздного купола — «небо вращается»
      const domeRot = t * 0.004 * timeScale;
      starLayerFar.points.rotation.y = domeRot;
      starLayerMid.points.rotation.y = domeRot * 0.85;
      starLayerNear.points.rotation.y = domeRot * 0.6;
      // и чуть-чуть наклона
      starLayerFar.points.rotation.x = 0.05 + Math.sin(t * 0.02) * 0.01;

      // Яркие звёзды — мерцание и мягкий «breathing» от баса
      brightStars.forEach((sp) => {
        const u = sp.userData;
        const pulse = 0.85 + 0.15 * Math.sin(t * u.speed + u.phase);
        const s = u.baseScale * pulse * (1 + smoothBass * 0.25);
        sp.scale.set(s, s, 1);
        sp.material.opacity = 0.55 + 0.35 * pulse + smoothLevel * 0.2;
      });
      brightGroup.rotation.y = domeRot * 0.9;

      // ---- Туманности ----
      // Медленный дрейф, лёгкое вращение, мягкая реакция на общий уровень.
      nebulaSprites.forEach((sp) => {
        const u = sp.userData;
        sp.material.opacity = u.baseOpacity * (0.7 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.12 + u.phase))) + smoothLevel * u.baseOpacity * 0.6;
        const s = u.baseScale * (1 + smoothLevel * 0.05);
        sp.scale.set(s, s, 1);
        sp.material.rotation += u.rotSpeed * dt * timeScale;
        sp.position.y += Math.sin(t * 0.05 + u.phase) * u.drift * dt * timeScale;
      });
      nebulaeGroup.rotation.y = t * 0.0025 * timeScale;

      // ---- Галактический пояс ----
      milky.rotation.y = t * 0.0018 * timeScale;

      // ---- Планета ----
      // Медленное вращение + тонкий rim-light ответ на бас.
      planet.rotation.y += 0.0008 * dt * 60 * timeScale;
      atmosphere.material.uniforms.uIntensity.value = 0.8 + smoothLevel * 0.6;
      planetLight.intensity = 0.7 + smoothLevel * 0.7;
      ringMat.uniforms.uOpacity.value = 0.45 + smoothLevel * 0.15;

      // ---- Пыль ----
      dustMat.uniforms.uTime.value = t;
      dustMat.uniforms.uLevel.value = smoothLevel;

      // Пыль немного следует за камерой по z, чтобы всегда была рядом
      dust.position.z = camera.position.z * 0.0; // оставляем фиксированной — так надёжнее

      // ---- Финальный рендер ----
      renderer.render(world, camera);
    }

    animate();

    // Небольшая «калибровка» цвета фона под акцент
    function setAccent(hex) {
      const c = new THREE.Color(hex);
      // Небо получает лёгкий оттенок акцента
      skyMat.uniforms.uAccent.value.copy(c);
    }

    return {
      setAccent,
      dispose() {
        cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', onPointerMove);
        window.removeEventListener('touchmove', onPointerMove);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);

        world.traverse((obj) => {
          if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
          if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach((m) => {
              for (const k in m) {
                if (m[k] && m[k].isTexture) m[k].dispose();
              }
              m.dispose && m.dispose();
            });
          }
        });
        // Общие текстуры
        softTex.dispose && softTex.dispose();
        nebulaTex.dispose && nebulaTex.dispose();
        flareTex.dispose && flareTex.dispose();
        planetTex.dispose && planetTex.dispose();
        renderer.dispose();
      }
    };
  }

  // ============================================================
  //                       UI bindings
  // ============================================================
  function bindUI() {
    enterBtn.addEventListener('click', async () => {
      if (state.entered) return;
      enterBtn.disabled = true;
      enterBtn.querySelector('span').textContent = 'Loading…';
      introStatus.classList.remove('is-error');
      introStatus.textContent = 'Загружаем треки…';

      try {
        state.tracks = await loadPlaylist();
      } catch (err) {
        introStatus.classList.add('is-error');
        introStatus.textContent = err.message;
        enterBtn.disabled = false;
        enterBtn.querySelector('span').textContent = 'Повторить';
        return;
      }

      if (!state.tracks.length) {
        introStatus.classList.add('is-error');
        introStatus.textContent = 'В track.json нет ни одной корректной записи.';
        enterBtn.disabled = false;
        enterBtn.querySelector('span').textContent = 'Повторить';
        return;
      }

      introStatus.textContent = 'Собираем пространство…';
      try {
        if (!scene) scene = createScene();
      } catch (err) {
        console.error(err);
        introStatus.classList.add('is-error');
        introStatus.textContent = 'Не удалось инициализировать 3D. Проверьте, что Three.js доступен, и используется современный браузер.';
        enterBtn.disabled = false;
        enterBtn.querySelector('span').textContent = 'Повторить';
        return;
      }

      initAudioGraph();

      renderPlaylist();
      state.index = 0;
      loadTrack(0, false);
      if (state.tracks[0].accent) applyAccent(state.tracks[0].accent);
      else applyAccent(DEFAULT_ACCENT);
      if (scene && scene.setAccent) scene.setAccent(state.tracks[0].accent || DEFAULT_ACCENT);

      state.entered = true;
      intro.classList.add('is-hidden');
      sceneCanvas.classList.add('is-ready');
      topbar.classList.add('is-visible');
      topbar.setAttribute('aria-hidden', 'false');
      nowplaying.classList.add('is-visible');
      nowplaying.setAttribute('aria-hidden', 'false');
      player.classList.add('is-visible');
      player.setAttribute('aria-hidden', 'false');

      playCurrent();
    });

    // Play / Pause
    playBtn.addEventListener('click', togglePlay);
    audio.addEventListener('play', () => { setPlayingUI(true); resumeAudioCtx(); });
    audio.addEventListener('pause', () => setPlayingUI(false));
    audio.addEventListener('ended', () => nextTrack(true));
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('durationchange', updateProgress);
    audio.addEventListener('error', () => {
      if (!audio.src) return;
      const t = state.tracks[state.index];
      showToast(`Не удалось загрузить трек «${t ? t.title : ''}». Проверьте путь к файлу.`);
      setPlayingUI(false);
    });

    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(false));

    shuffleBtn.addEventListener('click', () => {
      state.shuffled = !state.shuffled;
      shuffleBtn.classList.toggle('is-on', state.shuffled);
      if (state.shuffled) buildShuffleOrder();
      showToast(state.shuffled ? 'Перемешивание включено' : 'Перемешивание выключено', 1800);
    });

    repeatBtn.addEventListener('click', () => {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      repeatBtn.classList.toggle('is-on', state.repeat !== 'off');
      const label = state.repeat === 'off' ? 'Повтор выключен'
                  : state.repeat === 'all' ? 'Повтор плейлиста'
                  : 'Повтор трека';
      showToast(label, 1800);
    });

    listBtn.addEventListener('click', () => { playlist.hidden = !playlist.hidden; });
    playlistClose.addEventListener('click', () => { playlist.hidden = true; });

    collapseBtn.addEventListener('click', () => setCollapsed(true));
    expandBtn.addEventListener('click', () => setCollapsed(false));

    muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      audio.muted = state.muted;
      updateVolumeUI();
    });

    // Прогресс
    const progressSeek = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      seekFromEvent(cx);
    };
    progress.addEventListener('mousedown', (e) => {
      progress.classList.add('is-active');
      progressSeek(e);
      const move = (ev) => progressSeek(ev);
      const up = () => {
        progress.classList.remove('is-active');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    progress.addEventListener('touchstart', progressSeek, { passive: true });
    progress.addEventListener('touchmove', progressSeek, { passive: true });
    progress.addEventListener('keydown', (e) => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
    });

    // Громкость
    const volApply = (e) => {
      const cx = e.touches ? e.touches[0].clientX : e.clientX;
      setVolumeFromEvent(cx);
    };
    volume.addEventListener('mousedown', (e) => {
      volApply(e);
      const move = (ev) => volApply(ev);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    volume.addEventListener('touchstart', volApply, { passive: true });
    volume.addEventListener('touchmove', volApply, { passive: true });
    volume.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { state.volume = Math.min(1, state.volume + 0.05); state.muted = false; audio.volume = state.volume; audio.muted = false; updateVolumeUI(); e.preventDefault(); }
      if (e.key === 'ArrowLeft')  { state.volume = Math.max(0, state.volume - 0.05); audio.volume = state.volume; updateVolumeUI(); e.preventDefault(); }
    });

    // Плейлист
    playlistList.addEventListener('click', (e) => {
      const el = e.target.closest('.track');
      if (!el) return;
      loadTrack(Number(el.dataset.index), true);
    });
    playlistList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.track');
      if (!el) return;
      e.preventDefault();
      loadTrack(Number(el.dataset.index), true);
    });

    // Клавиатура
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          if (state.entered) { e.preventDefault(); togglePlay(); }
          break;
        case 'ArrowRight':
          if (state.entered) {
            if (e.shiftKey) { nextTrack(false); }
            else if (isFinite(audio.duration) && audio.duration > 0) {
              e.preventDefault();
              audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
            }
          }
          break;
        case 'ArrowLeft':
          if (state.entered) {
            if (e.shiftKey) { prevTrack(); }
            else if (isFinite(audio.duration) && audio.duration > 0) {
              e.preventDefault();
              audio.currentTime = Math.max(0, audio.currentTime - 5);
            }
          }
          break;
        case 'ArrowUp':
          if (state.entered) {
            e.preventDefault();
            state.volume = Math.min(1, state.volume + 0.05);
            state.muted = false;
            audio.volume = state.volume; audio.muted = false;
            updateVolumeUI();
          }
          break;
        case 'ArrowDown':
          if (state.entered) {
            e.preventDefault();
            state.volume = Math.max(0, state.volume - 0.05);
            audio.volume = state.volume;
            updateVolumeUI();
          }
          break;
        case 'n': case 'N': if (state.entered) nextTrack(false); break;
        case 'p': case 'P': if (state.entered) prevTrack(); break;
        case 's': case 'S': if (state.entered) shuffleBtn.click(); break;
        case 'r': case 'R': if (state.entered) repeatBtn.click(); break;
        case 'm': case 'M': if (state.entered) muteBtn.click(); break;
        case 'l': case 'L': if (state.entered) listBtn.click(); break;
        case 'c': case 'C': if (state.entered) setCollapsed(!player.classList.contains('is-collapsed')); break;
        case 'Escape':
          if (!playlist.hidden) playlist.hidden = true;
          break;
        default: break;
      }
    });

    // Media Session
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => playCurrent());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(false));
      } catch (e) { /* ignore */ }
    }
  }

  function setCollapsed(collapsed) {
    player.classList.toggle('is-collapsed', collapsed);
    expandBtn.hidden = !collapsed;
    if (collapsed) playlist.hidden = true;
  }

  // ---------- Init ----------
  function init() {
    updateVolumeUI();
    updateProgress();
    bindUI();

    // Проверка загрузки Three.js
    setTimeout(() => {
      if (window.__NOCTURNE_THREE_FAILED__) {
        introStatus.classList.add('is-error');
        introStatus.textContent = 'Three.js недоступен: проверьте подключение к интернету или CDN.';
      }
    }, 3200);

    window.addEventListener('beforeunload', () => {
      try { audio.pause(); } catch (e) {}
      try { if (scene && scene.dispose) scene.dispose(); } catch (e) {}
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
