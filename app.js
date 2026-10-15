/* Nocturne — музыкальное пространство
 * Сцена: Three.js (CDN). Аудио: HTMLAudioElement + Web Audio API (analyser).
 * Плейлист: ./track.json (единственный источник).
 */

(() => {
  'use strict';

  // ---------- Константы и режимы пространства ----------
  const SPACES = {
    city: {
      label: 'Midnight City',
      accent: '#8fa4ff',
      fog: { color: 0x05070f, near: 12, far: 140 },
      hemi: { sky: 0x2a3a6a, ground: 0x080a14, intensity: 0.35 },
      particles: { count: 1200, color: 0x9db3ff, size: 0.9, speed: 0.6 },
      ambient: 0x1a2240
    },
    space: {
      label: 'Deep Space',
      accent: '#a18aff',
      fog: { color: 0x03040c, near: 8, far: 220 },
      hemi: { sky: 0x3a2a6a, ground: 0x04040a, intensity: 0.28 },
      particles: { count: 2200, color: 0xcbd4ff, size: 1.1, speed: 1.0 },
      ambient: 0x141034
    },
    dream: {
      label: 'Dreamscape',
      accent: '#7fd6d0',
      fog: { color: 0x060a14, near: 10, far: 180 },
      hemi: { sky: 0x2a5a5a, ground: 0x080c14, intensity: 0.34 },
      particles: { count: 1600, color: 0xa9e6e0, size: 1.0, speed: 0.8 },
      ambient: 0x12303a
    }
  };

  const DEFAULT_SPACE = 'city';
  const DEFAULT_ACCENT = '#8fa4ff';

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const intro        = $('intro');
  const enterBtn     = $('enterBtn');
  const introStatus  = $('introStatus');
  const sceneCanvas  = $('scene');
  const topbar       = $('topbar');
  const modeBtn      = $('modeBtn');
  const modeMenu     = $('modeMenu');
  const modeLabel    = $('modeLabel');
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
    repeat: 'off', // 'off' | 'one' | 'all'
    volume: 0.8,
    muted: false,
    space: DEFAULT_SPACE,
    accent: DEFAULT_ACCENT,
    entered: false,
    audioReady: false,
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
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.85;
      analyserData = new Uint8Array(analyser.frequencyBinCount);
      sourceNode.connect(analyser);
      analyser.connect(audioCtx.destination);
    } catch (err) {
      // Не критично — просто без визуализации.
      console.warn('[Nocturne] Аудиограф недоступен:', err);
      audioCtx = null;
      analyser = null;
    }
  }

  function resumeAudioCtx() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
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
    if (/^rgb(a)?\(/i.test(c) || /^hsl(a)?\(/i.test(c)) return c;
    return fallback;
  }

  function applyAccent(accent) {
    document.documentElement.style.setProperty('--accent', accent);
    // Производный оттенок для градиента
    const darker = shade(accent, -0.12);
    if (darker) document.documentElement.style.setProperty('--accent-2', darker);
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

  // ---------- Загрузка плейлиста из track.json ----------
  async function loadPlaylist() {
    let data;
    try {
      // Относительный путь — корректно работает в GitHub Pages /project-name/
      const res = await fetch('./track.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.error('[Nocturne] Ошибка загрузки track.json:', err);
      throw new Error(
        'Не удалось загрузить track.json. ' +
        'Проверьте, что файл существует, содержит корректный JSON и сайт открыт через HTTP-сервер.'
      );
    }

    if (!Array.isArray(data)) {
      throw new Error('track.json должен содержать массив треков.');
    }

    const tracks = [];
    for (let i = 0; i < data.length; i++) {
      const raw = data[i] || {};
      if (!raw.file || typeof raw.file !== 'string') {
        console.warn('[Nocturne] Пропущен трек без поля "file":', raw);
        continue;
      }
      tracks.push({
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : `Untitled ${i + 1}`,
        artist: typeof raw.artist === 'string' ? raw.artist.trim() : '',
        file: raw.file.trim(),
        cover: typeof raw.cover === 'string' ? raw.cover.trim() : '',
        space: typeof raw.space === 'string' && SPACES[raw.space] ? raw.space : '',
        accent: safeAccent(raw.accent, '')
      });
    }
    return tracks;
  }

  // ---------- UI: рендер плейлиста ----------
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
    const items = playlistList.querySelectorAll('.track');
    items.forEach((el) => {
      el.classList.toggle('is-current', Number(el.dataset.index) === state.index);
    });
  }

  // ---------- UI: now playing ----------
  function updateNowPlaying() {
    const t = state.tracks[state.index];
    if (!t) {
      npTitle.textContent = '—';
      npArtist.textContent = '—';
      setCover('');
      return;
    }
    npTitle.textContent = t.title;
    npArtist.textContent = t.artist || 'Unknown artist';
    document.title = `${t.title}${t.artist ? ' — ' + t.artist : ''} · Nocturne`;
    setCover(t.cover);
  }

  function setCover(url) {
    // Удаляем старую <img> если есть
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
    if (state.index >= 0) {
      const cur = playlistList.querySelector('.track.is-current');
      if (cur) cur.classList.toggle('is-playing', playing);
    }
  }

  function loadTrack(index, autoplay = true) {
    if (!state.tracks.length) return;
    if (index < 0) index = state.tracks.length - 1;
    if (index >= state.tracks.length) index = 0;
    state.index = index;

    const t = state.tracks[index];

    // Смена акцента и режима пространства
    const accent = t.accent || (SPACES[t.space]?.accent) || DEFAULT_ACCENT;
    state.accent = accent;
    applyAccent(accent);

    if (t.space && SPACES[t.space] && t.space !== state.space) {
      setSpace(t.space, false);
    }

    // Аудио
    audio.src = t.file;
    audio.load();
    updateNowPlaying();
    highlightCurrent();
    setPlayingUI(false);

    if (autoplay) {
      playCurrent();
    }
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
        else {
          setPlayingUI(false);
          return;
        }
      }
    }
    loadTrack(next, true);
  }

  function prevTrack() {
    if (!state.tracks.length) return;
    // Если проиграно больше 3 сек — перезапустить текущий
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
    // Начинаем с текущего
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

  // ---------- UI: режимы пространства ----------
  function setSpace(name, announce = true) {
    if (!SPACES[name]) name = DEFAULT_SPACE;
    state.space = name;
    modeLabel.textContent = SPACES[name].label;
    // Отражаем в меню
    modeMenu.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.mode === name ? 'true' : 'false');
    });
    if (scene && scene.setSpace) scene.setSpace(name);
    if (announce) showToast(`Режим: ${SPACES[name].label}`, 2200);
  }

  // ---------- UI: свернуть / развернуть ----------
  function setCollapsed(collapsed) {
    player.classList.toggle('is-collapsed', collapsed);
    expandBtn.hidden = !collapsed;
    if (collapsed) {
      playlist.hidden = true;
    }
  }

  // ---------- Сцена Three.js ----------
  let scene = null;

  function createScene() {
    if (window.__NOCTURNE_THREE_FAILED__ || typeof window.THREE === 'undefined') {
      throw new Error('Three.js не загрузился. Проверьте доступ к CDN (jsdelivr/unpkg).');
    }
    const THREE = window.THREE;

    const renderer = new THREE.WebGLRenderer({
      canvas: sceneCanvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.setClearColor(0x03040a, 1);

    const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
    camera.position.set(0, 2.4, 14);
    camera.lookAt(0, 1.6, 0);

    const rootScene = new THREE.Scene();
    const fog = new THREE.FogExp2(0x03040a, 0.014);
    rootScene.fog = fog;

    // Свет
    const hemi = new THREE.HemisphereLight(0x2a3a6a, 0x080a14, 0.35);
    rootScene.add(hemi);
    const ambient = new THREE.AmbientLight(0x1a2240, 0.7);
    rootScene.add(ambient);

    // Группы контента по режимам
    const groupCity = new THREE.Group();
    const groupSpace = new THREE.Group();
    const groupDream = new THREE.Group();
    rootScene.add(groupCity, groupSpace, groupDream);

    // --- ГОРОД ---
    const city = buildCity(THREE, groupCity);

    // --- КОСМОС ---
    const space = buildSpace(THREE, groupSpace);

    // --- DREAM ---
    const dream = buildDream(THREE, groupDream);

    // --- Общая система частиц ---
    const particles = createParticles(THREE, 1600, 0xaebcff, 1.0);
    rootScene.add(particles.points);

    // Видимые группы
    groupCity.visible = true;
    groupSpace.visible = false;
    groupDream.visible = false;

    // Реакция на мышь
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMouseMove = (e) => {
      const t = e.touches ? e.touches[0] : e;
      if (!t) return;
      mouse.tx = (t.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (t.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    window.addEventListener('touchmove', onMouseMove, { passive: true });

    // Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    };
    window.addEventListener('resize', onResize);

    // Видимость вкладки
    let visible = !document.hidden;
    const onVis = () => { visible = !document.hidden; };
    document.addEventListener('visibilitychange', onVis);

    // ---------- Anim loop ----------
    const clock = new THREE.Clock();
    let rafId = 0;
    let targetSpace = 'city';
    let targetAccent = new THREE.Color(0x8fa4ff);

    function animate() {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Мягкое сглаживание мыши
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      // Аудиоанализ
      let level = 0;
      let bass = 0;
      if (analyser && analyserData) {
        analyser.getByteFrequencyData(analyserData);
        // общий уровень
        let sum = 0;
        const n = analyserData.length;
        const bassBins = Math.max(4, Math.floor(n * 0.08));
        let bassSum = 0;
        for (let i = 0; i < n; i++) {
          sum += analyserData[i];
          if (i < bassBins) bassSum += analyserData[i];
        }
        level = sum / (n * 255);
        bass = bassSum / (bassBins * 255);
      }

      // Камера плавно гуляет
      const camX = Math.sin(t * 0.09) * 1.2 + mouse.x * 1.4;
      const camY = 2.4 + Math.sin(t * 0.13) * 0.25 + -mouse.y * 0.5;
      const camZ = 14 + Math.cos(t * 0.07) * 0.6;
      camera.position.x += (camX - camera.position.x) * 0.04;
      camera.position.y += (camY - camera.position.y) * 0.04;
      camera.position.z += (camZ - camera.position.z) * 0.04;
      camera.lookAt(mouse.x * 0.6, 1.6 - mouse.y * 0.3, 0);

      // Частицы
      particles.update(dt, t, level, bass, state.space);

      // Группа города
      if (groupCity.visible) {
        city.update(t, bass, mouse);
      }
      // Космос
      if (groupSpace.visible) {
        space.update(t, level, mouse);
      }
      // Dream
      if (groupDream.visible) {
        dream.update(t, level, bass, mouse);
      }

      // Плавная смена режимов
      const vis = { city: targetSpace === 'city', space: targetSpace === 'space', dream: targetSpace === 'dream' };
      groupCity.visible = smoothToggle(groupCity, vis.city, dt);
      groupSpace.visible = smoothToggle(groupSpace, vis.space, dt);
      groupDream.visible = smoothToggle(groupDream, vis.dream, dt);

      renderer.render(rootScene, camera);
    }

    function smoothToggle(group, on, dt) {
      // Плавное проявление: используем userData.opacity
      const o = group.userData.opacity ?? (on ? 1 : 0);
      const target = on ? 1 : 0;
      const next = o + (target - o) * Math.min(1, dt * 2.2);
      group.userData.opacity = next;
      group.visible = next > 0.001 || on;
      group.traverse((obj) => {
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((m) => {
            if ('opacity' in m) {
              if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
              m.transparent = true;
              m.opacity = m.userData.baseOpacity * next;
            }
          });
        }
      });
      return group.visible;
    }

    // Стартовый прогон
    groupCity.userData.opacity = 1;
    groupSpace.userData.opacity = 0;
    groupDream.userData.opacity = 0;

    animate();

    return {
      renderer,
      camera,
      rootScene,
      setSpace(name) {
        if (!SPACES[name]) return;
        targetSpace = name;
        const cfg = SPACES[name];
        // Плавная интерполяция тумана и света
        if (cfg.fog) {
          fog.color.lerp(new THREE.Color(cfg.fog.color), 0.6);
          fog.density = 1 / (cfg.fog.far * 0.55);
        }
        if (cfg.hemi) {
          hemi.color.lerp(new THREE.Color(cfg.hemi.sky), 0.6);
          hemi.groundColor.lerp(new THREE.Color(cfg.hemi.ground), 0.6);
        }
        if (cfg.ambient) {
          ambient.color.lerp(new THREE.Color(cfg.ambient), 0.6);
        }
        particles.setPalette(cfg.particles.color, cfg.particles.size);
      },
      dispose() {
        cancelAnimationFrame(rafId);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('touchmove', onMouseMove);
        window.removeEventListener('resize', onResize);
        document.removeEventListener('visibilitychange', onVis);

        rootScene.traverse((obj) => {
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
        renderer.dispose();
      }
    };
  }

  // ---------- Построители сцены ----------
  function buildCity(THREE, group) {
    // Пол
    const floorGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x05070f });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    group.add(floor);

    // Дорога
    const roadGeo = new THREE.PlaneGeometry(10, 400, 1, 1);
    const roadMat = new THREE.MeshBasicMaterial({ color: 0x0a0d18 });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    group.add(road);

    // Здания по обе стороны
    const buildings = new THREE.Group();
    const bMat = new THREE.MeshStandardMaterial({
      color: 0x0a0f1e,
      emissive: 0x111733,
      emissiveIntensity: 0.35,
      roughness: 0.9,
      metalness: 0.05
    });
    const bMat2 = new THREE.MeshStandardMaterial({
      color: 0x0d1327,
      emissive: 0x1a2140,
      emissiveIntensity: 0.4,
      roughness: 0.9,
      metalness: 0.05
    });

    for (let i = 0; i < 46; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -90 + Math.random() * 180;
      const w = 4 + Math.random() * 6;
      const d = 4 + Math.random() * 6;
      const h = 6 + Math.random() * 28;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, Math.random() > 0.5 ? bMat : bMat2);
      mesh.position.set(side * (8 + Math.random() * 5 + w / 2), h / 2, z);
      buildings.add(mesh);
    }
    group.add(buildings);

    // Фонари
    const lampGroup = new THREE.Group();
    const poleMat = new THREE.MeshBasicMaterial({ color: 0x1b2340 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x9db3ff });
    const halos = [];
    for (let i = 0; i < 10; i++) {
      const z = -80 + i * 16;
      const x = 5.5 * (i % 2 === 0 ? -1 : 1);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), poleMat);
      pole.position.set(x, 2, z);
      lampGroup.add(pole);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), glowMat);
      glow.position.set(x, 4, z);
      lampGroup.add(glow);
      const halo = new THREE.PointLight(0x9db3ff, 0.9, 20, 2);
      halo.position.set(x, 4, z);
      lampGroup.add(halo);
      halos.push(halo);
    }
    group.add(lampGroup);

    return {
      update(t, bass, mouse) {
        // мягкое мерцание света
        halos.forEach((h, i) => {
          h.intensity = 0.7 + 0.25 * (0.5 + 0.5 * Math.sin(t * (0.6 + i * 0.05))) + bass * 0.8;
        });
        buildings.position.x = mouse.x * 0.2;
      }
    };
  }

  function buildSpace(THREE, group) {
    // Далёкие "туманности" — большие плоские пятна с прозрачностью
    const nebulaMat = new THREE.MeshBasicMaterial({
      color: 0x6a5aff,
      transparent: true,
      opacity: 0.10,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const nebs = [];
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.CircleGeometry(20 + Math.random() * 30, 32);
      const mesh = new THREE.Mesh(geo, nebulaMat.clone());
      mesh.material.color.setHex([0x6a5aff, 0x8a4aff, 0x3a6aff, 0xa18aff][i % 4]);
      mesh.material.opacity = 0.06 + Math.random() * 0.08;
      mesh.position.set((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 60, -60 - Math.random() * 90);
      mesh.rotation.z = Math.random() * Math.PI;
      nebs.push(mesh);
      group.add(mesh);
    }

    // Планета
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(7, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x1a2140,
        emissive: 0x2a3a7a,
        emissiveIntensity: 0.5,
        roughness: 0.9,
        metalness: 0.1
      })
    );
    planet.position.set(-22, 6, -60);
    group.add(planet);

    const planetLight = new THREE.PointLight(0x6a7aff, 1.2, 80, 2);
    planetLight.position.set(-22, 6, -40);
    group.add(planetLight);

    // Кольцо
    const ringGeo = new THREE.RingGeometry(9, 11.5, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x8a7aff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.copy(planet.position);
    ring.rotation.x = Math.PI / 2.6;
    group.add(ring);

    return {
      update(t, level, mouse) {
        nebs.forEach((n, i) => {
          n.material.opacity = (0.05 + 0.08 * (0.5 + 0.5 * Math.sin(t * 0.2 + i))) + level * 0.12;
          n.rotation.z += 0.0006 * (1 + i * 0.05);
        });
        ring.rotation.z = t * 0.06;
        planetLight.intensity = 1.0 + level * 1.5;
        group.rotation.y = mouse.x * 0.05;
      }
    };
  }

  function buildDream(THREE, group) {
    // Плавающие геометрические фигуры
    const shapes = [];
    const geos = [
      new THREE.IcosahedronGeometry(1.1, 0),
      new THREE.OctahedronGeometry(1.2, 0),
      new THREE.TorusGeometry(0.9, 0.28, 16, 40),
      new THREE.BoxGeometry(1.4, 1.4, 1.4),
      new THREE.TetrahedronGeometry(1.4, 0)
    ];
    const palette = [0x7fd6d0, 0xa18aff, 0x8fa4ff, 0x6ad0ff, 0xbca6ff];

    for (let i = 0; i < 26; i++) {
      const geo = geos[i % geos.length];
      const mat = new THREE.MeshStandardMaterial({
        color: palette[i % palette.length],
        emissive: palette[i % palette.length],
        emissiveIntensity: 0.35,
        roughness: 0.45,
        metalness: 0.4,
        transparent: true,
        opacity: 0.85
      });
      const m = new THREE.Mesh(geo, mat);
      const angle = Math.random() * Math.PI * 2;
      const radius = 6 + Math.random() * 16;
      m.position.set(
        Math.cos(angle) * radius,
        1 + Math.random() * 8,
        -10 - Math.random() * 40
      );
      m.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      m.userData = {
        baseY: m.position.y,
        amp: 0.3 + Math.random() * 0.5,
        speed: 0.3 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2
      };
      group.add(m);
      shapes.push(m);
    }

    const light1 = new THREE.PointLight(0x7fd6d0, 1.0, 60, 2);
    light1.position.set(0, 10, -20);
    group.add(light1);

    const light2 = new THREE.PointLight(0xa18aff, 0.8, 60, 2);
    light2.position.set(10, 4, -30);
    group.add(light2);

    return {
      update(t, level, bass, mouse) {
        shapes.forEach((s, i) => {
          const u = s.userData;
          s.position.y = u.baseY + Math.sin(t * u.speed + u.phase) * u.amp + bass * 0.4;
          s.rotation.x += 0.0025 * (1 + level * 3);
          s.rotation.y += 0.0035 * (1 + level * 3);
        });
        light1.intensity = 0.8 + level * 1.5;
        light2.intensity = 0.6 + bass * 1.5;
        group.rotation.y = mouse.x * 0.06;
      }
    };
  }

  // ---------- Частицы ----------
  function createParticles(THREE, count, color, size) {
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = Math.random() * 40 - 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 220 - 20;
      speeds[i] = 0.5 + Math.random() * 1.4;
      phases[i] = Math.random() * Math.PI * 2;
      seeds[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: color,
      size: size,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;

    return {
      points,
      setPalette(newColor, newSize) {
        mat.color.setHex(newColor);
        mat.size = newSize;
      },
      update(dt, t, level, bass, spaceName) {
        const pos = geo.attributes.position.array;
        const drift = spaceName === 'space' ? 1.4 : spaceName === 'dream' ? 1.0 : 0.7;
        const wave = spaceName === 'dream' ? 0.6 : 0.2;
        for (let i = 0; i < count; i++) {
          const ix = i * 3;
          pos[ix + 1] += dt * speeds[i] * 0.15 * drift;
          pos[ix + 0] += Math.sin(t * 0.3 + phases[i]) * dt * 0.12 * wave;
          if (pos[ix + 1] > 40) {
            pos[ix + 1] = -6;
            pos[ix + 0] = (Math.random() - 0.5) * 120;
            pos[ix + 2] = (Math.random() - 0.5) * 220 - 20;
          }
        }
        geo.attributes.position.needsUpdate = true;
        mat.opacity = 0.55 + level * 0.4;
        mat.size = (spaceName === 'space' ? 1.1 : 0.9) * (1 + bass * 0.5);
      }
    };
  }

  // ---------- Обработчики UI ----------
  function bindUI() {
    // Enter
    enterBtn.addEventListener('click', async () => {
      if (state.entered) return;
      enterBtn.disabled = true;
      enterBtn.querySelector('span').textContent = 'Loading…';
      introStatus.classList.remove('is-error');
      introStatus.textContent = 'Загружаем треки…';

      // Плейлист
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

      // Сцена
      try {
        if (!scene) scene = createScene();
      } catch (err) {
        console.error(err);
        introStatus.classList.add('is-error');
        introStatus.textContent = 'Не удалось инициализировать 3D. Проверьте, что Three.js доступен, и что используется современный браузер.';
        enterBtn.disabled = false;
        enterBtn.querySelector('span').textContent = 'Повторить';
        return;
      }

      // Аудиограф — только после явного действия пользователя
      initAudioGraph();

      // Рендерим плейлист, подготавливаем первый трек
      renderPlaylist();
      state.index = 0;
      loadTrack(0, false);
      applyAccent(state.tracks[0].accent || SPACES[state.tracks[0].space]?.accent || DEFAULT_ACCENT);
      if (state.tracks[0].space) setSpace(state.tracks[0].space, false);

      // Показываем интерфейс
      state.entered = true;
      intro.classList.add('is-hidden');
      sceneCanvas.classList.add('is-ready');
      topbar.classList.add('is-visible');
      topbar.setAttribute('aria-hidden', 'false');
      nowplaying.classList.add('is-visible');
      nowplaying.setAttribute('aria-hidden', 'false');
      player.classList.add('is-visible');
      player.setAttribute('aria-hidden', 'false');

      // Пробуем запустить трек (сработает из-за клика пользователя)
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

    // Prev / Next
    prevBtn.addEventListener('click', prevTrack);
    nextBtn.addEventListener('click', () => nextTrack(false));

    // Shuffle
    shuffleBtn.addEventListener('click', () => {
      state.shuffled = !state.shuffled;
      shuffleBtn.classList.toggle('is-on', state.shuffled);
      if (state.shuffled) buildShuffleOrder();
      showToast(state.shuffled ? 'Перемешивание включено' : 'Перемешивание выключено', 1800);
    });

    // Repeat
    repeatBtn.addEventListener('click', () => {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      repeatBtn.classList.toggle('is-on', state.repeat !== 'off');
      repeatBtn.classList.toggle('is-one', state.repeat === 'one');
      const label = state.repeat === 'off' ? 'Повтор выключен' : state.repeat === 'all' ? 'Повтор плейлиста' : 'Повтор трека';
      showToast(label, 1800);
    });

    // List
    listBtn.addEventListener('click', () => {
      playlist.hidden = !playlist.hidden;
    });
    playlistClose.addEventListener('click', () => { playlist.hidden = true; });

    // Collapse
    collapseBtn.addEventListener('click', () => setCollapsed(true));
    expandBtn.addEventListener('click', () => setCollapsed(false));

    // Mute
    muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      audio.muted = state.muted;
      updateVolumeUI();
    });

    // Прогресс — click & drag
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
    progress.addEventListener('touchstart', (e) => {
      progressSeek(e);
    }, { passive: true });
    progress.addEventListener('touchmove', (e) => {
      progressSeek(e);
    }, { passive: true });

    // Прогресс — keyboard
    progress.addEventListener('keydown', (e) => {
      if (!isFinite(audio.duration) || audio.duration <= 0) return;
      if (e.key === 'ArrowRight') {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
        e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        e.preventDefault();
      }
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

    // Плейлист — клик по треку
    playlistList.addEventListener('click', (e) => {
      const el = e.target.closest('.track');
      if (!el) return;
      const idx = Number(el.dataset.index);
      if (Number.isNaN(idx)) return;
      loadTrack(idx, true);
    });
    playlistList.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target.closest('.track');
      if (!el) return;
      e.preventDefault();
      loadTrack(Number(el.dataset.index), true);
    });

    // Меню режимов
    modeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !modeMenu.hidden;
      modeMenu.hidden = open;
      modeBtn.setAttribute('aria-expanded', String(!open));
    });
    modeMenu.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-mode]');
      if (!li) return;
      setSpace(li.dataset.mode, true);
      modeMenu.hidden = true;
      modeBtn.setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', (e) => {
      if (modeMenu.hidden) return;
      if (e.target.closest('#modeMenu') || e.target.closest('#modeBtn')) return;
      modeMenu.hidden = true;
      modeBtn.setAttribute('aria-expanded', 'false');
    });

    // Клавиатура
    document.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case ' ':
          if (state.entered) {
            e.preventDefault();
            togglePlay();
          }
          break;
        case 'ArrowRight':
          if (state.entered && !e.shiftKey) {
            e.preventDefault();
            if (!isFinite(audio.duration) || audio.duration <= 0) return;
            audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
          } else if (state.entered && e.shiftKey) {
            nextTrack(false);
          }
          break;
        case 'ArrowLeft':
          if (state.entered && !e.shiftKey) {
            e.preventDefault();
            if (!isFinite(audio.duration) || audio.duration <= 0) return;
            audio.currentTime = Math.max(0, audio.currentTime - 5);
          } else if (state.entered && e.shiftKey) {
            prevTrack();
          }
          break;
        case 'ArrowUp':
          if (state.entered) {
            e.preventDefault();
            state.volume = Math.min(1, state.volume + 0.05);
            state.muted = false;
            audio.volume = state.volume;
            audio.muted = false;
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
        case 'n': case 'N':
          if (state.entered) nextTrack(false);
          break;
        case 'p': case 'P':
          if (state.entered) prevTrack();
          break;
        case 's': case 'S':
          if (state.entered) shuffleBtn.click();
          break;
        case 'r': case 'R':
          if (state.entered) repeatBtn.click();
          break;
        case 'm': case 'M':
          if (state.entered) muteBtn.click();
          break;
        case 'l': case 'L':
          if (state.entered) listBtn.click();
          break;
        case 'c': case 'C':
          if (state.entered) {
            const collapsed = !player.classList.contains('is-collapsed');
            setCollapsed(collapsed);
          }
          break;
        case 'Escape':
          if (!modeMenu.hidden) {
            modeMenu.hidden = true;
            modeBtn.setAttribute('aria-expanded', 'false');
          } else if (!playlist.hidden) {
            playlist.hidden = true;
          }
          break;
        default:
          break;
      }
    });

    // Кнопки браузера (Media Session API, если есть)
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => playCurrent());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', prevTrack);
        navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack(false));
        navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 10); });
        navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10); });
      } catch (e) { /* не критично */ }
    }
  }

  // Обновляем Media Session metadata при смене трека
  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const t = state.tracks[state.index];
    if (!t || !window.MediaMetadata) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title,
        artist: t.artist || 'Unknown artist',
        album: 'Nocturne',
        artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : []
      });
    } catch (e) { /* ignore */ }
  }

  // Патчим updateNowPlaying, чтобы обновлять Media Session
  const _origUpdateNowPlaying = updateNowPlaying;
  updateNowPlaying = function() {
    _origUpdateNowPlaying.apply(this, arguments);
    updateMediaSession();
  };

  // ---------- Инициализация ----------
  function init() {
    // Стартовые атрибуты интерфейса
    modeLabel.textContent = SPACES[state.space].label;
    modeMenu.querySelectorAll('li').forEach((li) => {
      li.setAttribute('aria-selected', li.dataset.mode === state.space ? 'true' : 'false');
    });
    updateVolumeUI();
    updateProgress();

    bindUI();

    // Если Three.js не загрузился — предупредим в intro
    setTimeout(() => {
      if (typeof window.THREE === 'undefined' && !window.__NOCTURNE_THREE_FAILED__) {
        // Ещё есть шанс, что fallback загружается — подождём немного
      }
      if (window.__NOCTURNE_THREE_FAILED__) {
        introStatus.classList.add('is-error');
        introStatus.textContent = 'Three.js недоступен: проверьте подключение к интернету или CDN.';
      }
    }, 3000);

    // Пауза аудио при уходе со вкладки (по желанию — здесь не делаем, чтобы музыка играла)
    // Освобождаем ресурсы при выгрузке
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