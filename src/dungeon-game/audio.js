
/* 背景音乐：原生 Audio 播放曲目，Web Audio 提供备用音乐与音效。 */
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var sfxBus = null;
  var delayNode = null;
  var droneOsc = null;
  var droneGain = null;
  var timer = null;
  var step = 0;
  var nextTime = 0;
  var playing = false;
  var musicOn = true;
  var sfxOn = true;
  var vol = 0.7;              /* 音量 0~1 */
  var NORMAL_TRACKS = ['bgm.mp3', 'dungeon-pvp/bgm.mp3'];
  var SOLO_TRACKS = ['bgm-last.mp4', 'dungeon-pvp/bgm-last.mp4'];
  var track = null;
  var trackKind = 'normal';
  var trackSrc = NORMAL_TRACKS[0];
  var candIdx = 0;
  var trackFailed = false;
  var playSerial = 0;
  var lastError = '';

  function trackList(kind) {
    /* 单文件版会把两首音频内嵌进 window.__AUDIO。 */
    var emb = root.__AUDIO;
    if (emb) {
      var one = kind === 'solo' ? emb.solo : emb.normal;
      if (one) return [one];
    }
    return kind === 'solo' ? SOLO_TRACKS : NORMAL_TRACKS;
  }
  var KEY_MUSIC = 'dd_web_bgm';
  var KEY_SFX = 'dd_web_sfx';
  var KEY_VOL = 'dd_web_vol';

  var BPM = 50;
  var STEP = 60 / BPM / 2;   /* 八分音符 */

  /* A 小调音阶（低音区） */
  var SCALE = {
    A1: 55.00, E2: 82.41, A2: 110.00,
    C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.00, A3: 220.00
  };

  function readPref(key) {
    try { return localStorage.getItem(key) !== '0'; } catch (e) { return true; }
  }
  function savePref(key, v) {
    try { localStorage.setItem(key, v ? '1' : '0'); } catch (e) {}
  }
  function readNum(key, dflt) {
    try { var v = localStorage.getItem(key); return v === null ? dflt : parseFloat(v); } catch (e) { return dflt; }
  }
  function saveNum(key, v) {
    try { localStorage.setItem(key, String(v)); } catch (e) {}
  }

  function ensureCtx() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 2.2 * vol;
    sfxBus.connect(ctx.destination);

    /* 一点回声，让音色不干 */
    delayNode = ctx.createDelay(1.0);
    delayNode.delayTime.value = 0.36;
    var fb = ctx.createGain();
    fb.gain.value = 0.34;
    delayNode.connect(fb);
    fb.connect(delayNode);
    delayNode.connect(master);
    return ctx;
  }

  function note(freq, time, dur, type, gain, send) {
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(master);
    if (send && delayNode) g.connect(delayNode);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  function thump(time, freq, dur, gain) {
    if (!ctx) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, time);
    o.frequency.exponentialRampToValueAtTime(freq * 0.55, time + dur);
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(master);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  /* 16 步循环：低声部 + 稀疏琶音 + 沉重鼓点 */
  function scheduleStep(i, t) {
    if (i === 0) { note(SCALE.A2, t, 2.4, 'triangle', 0.085, true); thump(t, 62, 0.42, 0.16); }
    if (i === 3) note(SCALE.E3, t, 1.6, 'sine', 0.05, true);
    if (i === 6) note(SCALE.C3, t, 1.8, 'triangle', 0.055, true);
    if (i === 8) { note(SCALE.A1, t, 2.6, 'sine', 0.09, false); thump(t, 55, 0.5, 0.13); }
    if (i === 11) note(SCALE.G3, t, 1.5, 'sine', 0.04, true);
    if (i === 14) note(SCALE.E3, t, 1.7, 'triangle', 0.045, true);
    /* 偶尔一点高音铃声 */
    if (i === 5 && Math.random() < 0.5) note(SCALE.A3, t, 1.2, 'sine', 0.025, true);
    if (i === 13 && Math.random() < 0.35) note(SCALE.D3, t, 1.4, 'sine', 0.03, true);
  }

  function tick() {
    if (!ctx || !playing) return;
    while (nextTime < ctx.currentTime + 0.6) {
      scheduleStep(step % 16, nextTime);
      nextTime += STEP;
      step += 1;
    }
  }

  function startDrone() {
    if (!ctx || droneOsc) return;
    droneGain = ctx.createGain();
    droneGain.gain.value = 0.028;
    droneGain.connect(master);
    droneOsc = ctx.createOscillator();
    droneOsc.type = 'sawtooth';
    droneOsc.frequency.value = SCALE.A1;
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    droneOsc.connect(filter);
    filter.connect(droneGain);
    droneOsc.start();
  }

  function startSynth() {
    if (!ensureCtx()) return;
    resumeCtx();
    if (playing) return;
    playing = true;
    step = 0;
    nextTime = ctx.currentTime + 0.08;
    startDrone();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.5 * vol, ctx.currentTime + 2.5);
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 220);
    tick();
  }

  function stopSynth() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.8);
  }

  function resumeCtx() {
    if (!ctx || ctx.state !== 'suspended' || !ctx.resume) return;
    try {
      var p = ctx.resume();
      if (p && p.catch) p.catch(function () {});
    } catch (e) {}
  }

  function applyVolume() {
    if (!track) return;
    /* 本地文件和内嵌曲目直接输出，避免媒体跨域路由导致静音。 */
    try { track.volume = vol; } catch (e) {}
  }

  function sourceLabel() {
    if (trackSrc.indexOf('data:') === 0) return trackKind === 'solo' ? '单人曲（内置）' : '主背景音乐（内置）';
    return trackSrc;
  }

  function failTrack(failedTrack, err) {
    if (failedTrack !== track) return;
    track = null;
    playSerial += 1;
    pendingGesture = false;
    lastError = (err && err.name) || 'MediaError';
    try { failedTrack.pause(); } catch (e) {}
    candIdx += 1;
    var list = trackList(trackKind);
    if (candIdx < list.length) {
      if (musicOn) start();
      return;
    }
    trackFailed = true;
    if (musicOn) {
      notifyAudio('背景音乐无法加载，已使用备用音乐（' + lastError + '）');
      startSynth();
    }
  }

  function ensureTrack() {
    if (track) return track;
    var list = trackList(trackKind);
    if (candIdx >= list.length) { trackFailed = true; return null; }
    var A = root.Audio;
    if (!A) { trackFailed = true; return null; }
    trackSrc = list[candIdx];
    try {
      track = new A(trackSrc);
      track.loop = true;
      track.preload = 'auto';
      track.volume = vol;
      var current = track;
      track.addEventListener('error', function () { failTrack(current, current.error); });
      track.load();
      applyVolume();
    } catch (e) {
      track = null;
      trackFailed = true;
    }
    return track;
  }

  var pendingGesture = false;
  var embedded = (function () {
    try { return root.self !== root.top; } catch (e) { return true; }
  })();

  function notifyAudio(msg) {
    try {
      var bar = document.getElementById('err-bar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'err-bar';
        document.body.appendChild(bar);
      }
      bar.textContent = msg;
      bar.style.background = '#5a3a12';
      bar.style.borderBottom = '1px solid #a9791f';
      bar.style.display = 'block';
      setTimeout(function () { if (bar) bar.style.display = 'none'; }, 7000);
    } catch (e) {}
    if (root.console && root.console.warn) root.console.warn('[BGM] ' + msg);
  }

  function setTrack(kind) {
    kind = (kind === 'solo') ? 'solo' : 'normal';
    if (kind === trackKind) return;
    trackKind = kind;
    candIdx = 0;
    trackFailed = false;
    pendingGesture = false;
    lastError = '';
    playSerial += 1;
    var old = track;
    track = null;
    if (old) { try { old.pause(); } catch (e) {} }
    if (musicOn) start();
  }

  function start() {
    if (!musicOn) return;
    ensureCtx();
    resumeCtx();
    var t = ensureTrack();
    if (t) {
      applyVolume();
      var serial = ++playSerial;
      pendingGesture = false;
      stopSynth();
      function playFailed(err) {
          /* 切曲、暂停或重试前的旧请求不能覆盖当前曲目状态。 */
          if (t !== track || serial !== playSerial || !musicOn) return;
          var name = (err && err.name) || '';
          if (name === 'AbortError') return;
          if (name === 'NotAllowedError') {
            /* 只是被自动播放策略拦了，等下一次点击再试，不要降级 */
            pendingGesture = true;
            notifyAudio('请点击画面开始播放音乐；若预览窗口仍无声，请在独立浏览器里打开文件');
            return;
          }
          failTrack(t, err);
      }
      try {
        var p = t.play();
        if (p && p.then) p.then(function () {
          if (t === track && serial === playSerial) { pendingGesture = false; lastError = ''; }
        }, playFailed);
      } catch (err) { playFailed(err); }
      return;
    }
    startSynth();
  }

  function stop() {
    playSerial += 1;
    pendingGesture = false;
    if (track) { try { track.pause(); } catch (e) {} }
    stopSynth();
  }

  var volApplyTimer = null;
  var volSaveTimer = null;
  var lastToastAt = 0;

  function applyVolumes() {
    applyVolume();
    if (ctx && master) {
      var target = playing ? 0.5 * vol : 0.0001;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.12);
    }
    if (ctx && sfxBus) {
      sfxBus.gain.cancelScheduledValues(ctx.currentTime);
      sfxBus.gain.setValueAtTime(sfxBus.gain.value, ctx.currentTime);
      sfxBus.gain.linearRampToValueAtTime(2.2 * vol, ctx.currentTime + 0.08);
    }
  }

  function setVolume(v, silent) {
    vol = Math.max(0, Math.min(1, typeof v === 'number' ? v : parseFloat(v)));
    if (isNaN(vol)) vol = 0.7;

    /* 滑条外观立即更新：便宜 */
    var sl = document.getElementById('vol');
    if (sl) {
      if (sl.style && sl.style.setProperty) sl.style.setProperty('--p', Math.round(vol * 100) + '%');
      if (sl.value !== String(Math.round(vol * 100))) sl.value = String(Math.round(vol * 100));
    }

    /* 真正改声音：节流到 40ms 一次，避免拖动时每像素都跑一遍 */
    if (!volApplyTimer) {
      volApplyTimer = setTimeout(function () {
        volApplyTimer = null;
        applyVolumes();
      }, 40);
    }

    /* 存档：防抖 400ms，别在拖动时反复写 localStorage（这就是卡顿来源） */
    if (volSaveTimer) clearTimeout(volSaveTimer);
    volSaveTimer = setTimeout(function () {
      volSaveTimer = null;
      saveNum(KEY_VOL, vol);
    }, 400);

    if (!silent) {
      var now = Date.now();
      if (now - lastToastAt > 130) {
        lastToastAt = now;
        showVolToast();
      }
    }
  }

  function getVolume() { return vol; }

  var volToastTimer = null;
  function showVolToast() {
    try {
      var box = document.getElementById('vol-toast');
      if (!box) {
        box = document.createElement('div');
        box.id = 'vol-toast';
        box.className = 'vol-toast';
        document.body.appendChild(box);
      }
      var srcName;
      if (track) srcName = '曲目';
      else if (playing) srcName = '合成';
      else srcName = '无音源';
      box.textContent = '音量 ' + Math.round(vol * 100) + '% · ' + srcName;
      box.classList.add('show');
      if (volToastTimer) clearTimeout(volToastTimer);
      volToastTimer = setTimeout(function () { box.classList.remove('show'); }, 900);
    } catch (e) {}
  }

  function isMusicOn() { return musicOn; }

  function setMusicEnabled(v) {
    musicOn = !!v;
    savePref(KEY_MUSIC, musicOn);
    paint();
    if (musicOn) start(); else stop();
  }

  function toggleMusic() { setMusicEnabled(!musicOn); return musicOn; }

  function paint() {
    var mb = document.getElementById('btn-bgm');
    if (mb) {
      mb.classList.toggle('off', !musicOn);
      mb.setAttribute('aria-label', musicOn ? '关闭音乐' : '开启音乐');
      mb.setAttribute('title', musicOn ? '关闭音乐' : '开启音乐');
    }
    var sb = document.getElementById('btn-sfx');
    if (sb) {
      sb.classList.toggle('off', !sfxOn);
      sb.setAttribute('aria-label', sfxOn ? '关闭音效' : '开启音效');
      sb.setAttribute('title', sfxOn ? '关闭音效' : '开启音效');
    }
  }

  function setSfxEnabled(v) {
    sfxOn = !!v;
    savePref(KEY_SFX, sfxOn);
    paint();
    if (sfxOn) play('click');
  }
  function isSfxOn() { return sfxOn; }
  function toggleSfx() { setSfxEnabled(!sfxOn); return sfxOn; }

  /* ---------- 音效 ---------- */
  var noiseBuf = null;
  function getNoise() {
    if (!ctx) return null;
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(ctx.sampleRate * 0.4);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return noiseBuf;
  }

  function sfxBlip(freq, freq2, dur, type, gain) {
    if (!ctx) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(freq2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function sfxNoise(dur, gain, filterType, filterFreq) {
    if (!ctx) return;
    var buf = getNoise();
    if (!buf) return;
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(filterFreq || 1200, t);
    var g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  var SFX_DEFS = {
    click: function () { sfxBlip(620, 420, 0.07, 'triangle', 0.16); },
    place: function () {
      sfxBlip(660, 660, 0.1, 'sine', 0.2);
      setTimeout(function () { sfxBlip(990, 990, 0.16, 'sine', 0.16); }, 70);
    },
    attack: function () {
      sfxNoise(0.14, 0.36, 'lowpass', 1500);
      sfxBlip(180, 70, 0.16, 'sine', 0.3);
    },
    crit: function () {
      sfxNoise(0.18, 0.42, 'lowpass', 2200);
      sfxBlip(240, 80, 0.22, 'sine', 0.36);
      setTimeout(function () { sfxBlip(880, 1320, 0.14, 'square', 0.14); }, 30);
    },
    heal: function () { sfxBlip(440, 700, 0.3, 'sine', 0.18); },
    death: function () { sfxBlip(200, 55, 0.55, 'sawtooth', 0.24); },
    dodge: function () { sfxNoise(0.16, 0.2, 'highpass', 2600); },
    /* 流血：湿冷的撕裂声 */
    bleed: function () {
      sfxNoise(0.26, 0.34, 'bandpass', 1100);
      sfxBlip(300, 110, 0.18, 'sawtooth', 0.16);
    },
    /* 腐蚀：低沉的咕嘟冒泡 */
    blight: function () {
      sfxNoise(0.34, 0.22, 'lowpass', 520);
      sfxBlip(150, 70, 0.34, 'sine', 0.26);
      setTimeout(function () { sfxBlip(110, 60, 0.22, 'sine', 0.18); }, 130);
    }
  };

  function play(name) {
    if (!sfxOn) return;
    if (!ensureCtx()) return;
    resumeCtx();
    var fn = SFX_DEFS[name];
    if (fn) { try { fn(); } catch (e) {} }
  }

  function ready() {
    musicOn = readPref(KEY_MUSIC);
    sfxOn = readPref(KEY_SFX);
    vol = readNum(KEY_VOL, 0.7);
    if (isNaN(vol) || vol < 0 || vol > 1) vol = 0.7;

    var sl = document.getElementById('vol');
    if (sl) {
      sl.value = String(Math.round(vol * 100));
      if (sl.style && sl.style.setProperty) sl.style.setProperty('--p', Math.round(vol * 100) + '%');
      sl.addEventListener('input', function () { setVolume(parseFloat(sl.value) / 100); });
      sl.addEventListener('change', function () { setVolume(parseFloat(sl.value) / 100); });

      /* 兜底：某些移动内核不派发 range 的 input 事件，直接用坐标算 */
      var dragging = false;
      var cachedRect = null;
      var fromPointer = function (e) {
        var rect = cachedRect || (sl.getBoundingClientRect ? sl.getBoundingClientRect() : null);
        if (!rect || !rect.width) return;
        var x = (e.clientX != null ? e.clientX : e.pageX) || 0;
        var ratio = (x - rect.left) / rect.width;
        ratio = Math.max(0, Math.min(1, ratio));
        setVolume(ratio);
      };
      sl.addEventListener('pointerdown', function (e) {
        dragging = true;
        cachedRect = sl.getBoundingClientRect ? sl.getBoundingClientRect() : null;
        fromPointer(e);
      });
      root.addEventListener('pointermove', function (e) {
        if (dragging) fromPointer(e);
      });
      root.addEventListener('pointerup', function () { dragging = false; });
      root.addEventListener('pointercancel', function () { dragging = false; });
    }
    paint();

    var mb = document.getElementById('btn-bgm');
    if (mb) {
      mb.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMusic();
      });
    }
    var sb = document.getElementById('btn-sfx');
    if (sb) {
      sb.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleSfx();
      });
    }

    /* 按钮/卡牌点击音 */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('button, .hero-card, .slot-card, .reward, .mode-card')) play('click');
    }, true);

    /* 被自动播放策略拦下后，任意点击都重试 */
    var retryMusic = function () {
      if (pendingGesture && musicOn) { pendingGesture = false; start(); }
    };
    root.addEventListener('pointerdown', retryMusic, true);
    root.addEventListener('keydown', retryMusic, true);

    /* 浏览器要求用户交互后才能出声 */
    var kick = function (e) {
      /* 点静音键本身不算"开始播放" */
      var t = e && e.target;
      if (t && t.closest && (t.closest('#btn-bgm') || t.closest('#btn-sfx') || t.closest('#vol'))) return;
      root.removeEventListener('pointerdown', kick);
      root.removeEventListener('keydown', kick);
      if (musicOn) start();
    };
    root.addEventListener('pointerdown', kick);
    root.addEventListener('keydown', kick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  root.BGM = { start: start, stop: stop, toggle: toggleMusic, setEnabled: setMusicEnabled, isOn: isMusicOn,
               setVolume: setVolume, getVolume: getVolume,
               setTrack: setTrack, getTrack: function () { return trackSrc; },
               getMode: function () { return trackKind; },
               debug: function () {
                 return { src: sourceLabel(), kind: trackKind, hasTrack: !!track,
                          playing: !!(track && !track.paused), pendingGesture: pendingGesture,
                          failed: trackFailed, synthPlaying: playing, lastError: lastError,
                          audioEmbedded: !!root.__AUDIO, volume: vol, embedded: embedded };
               } };
  root.SFX = { play: play, setEnabled: setSfxEnabled, isOn: isSfxOn, toggle: toggleSfx };
})(typeof window !== 'undefined' ? window : this);

