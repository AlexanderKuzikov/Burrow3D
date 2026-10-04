/* ============================================================================
   Burrow3D — наборы объектов (биомы)
   ----------------------------------------------------------------------------
   Набор описывает всё, что делает местность живой: свет, рельеф, цвета земли
   и правила расстановки готовых объектов. Чтобы добавить свой набор —
   скопируй любой блок из BIOMES и поменяй значения. Движок подстраивается сам.

   ── Схема набора ────────────────────────────────────────────────────────────
   name        подпись в выпадающем списке
   note        одна строка-описание (показывается в панели)
   sky         небо и свет:
                top/bottom   градиент неба (шестнадцатеричные цвета)
                sun          цвет солнечного диска
                sunDir       направление на солнце (нормируется автоматически)
                fog               цвет тумана
                fogK              границы тумана как доля от размера карты [near, far]
                exposure     tone mapping exposure
                sunI         интенсивность солнца
                hemiSky/hemiGround/hemiI   полусферический свет
                fill/fillI    контровой заполняющий свет
   water       null — суша; иначе {level, color, rough, clear, envI, wave}
   relief      рельеф:
                amp/freq/oct     амплитуда, частота и число октав fbm
                ridged           true — гребни вместо холмов (горы)
                detAmp/detFreq   мелкая деталь
                roadFlatten/roadSink   насколько дорога ровная и насколько проседает
                blockedLift/blockedFlat  подъём и сглаживание занятых клеток
                rimStart/rimDrop как кромка уходит вниз (берег/обрыв)
                base             сдвиг всей поверхности по Y
   ground      цвета земли (второй цвет — вариация по шуму):
                free/road/blocked  пары [тёмный, светлый]
                grain             разброс яркости по клеткам
                mottle            масштаб пятен вариации
                speckle           доля «крапинок» на дороге
   scatter     правила расстановки по типам клеток:
                free/road/blocked  массив правил
   ── Схема правила ──────────────────────────────────────────────────────────
   b        имя объекта из BUILDERS (движок)
   per      сколько объектов на клетку: дробное = вероятность
   layer    'plants' | 'rocks' | 'props' — для переключателей в панели
   scale    [минимум, максимум] или число
   dens     {freq, bias, gain} — шумовая плотность: шанс = bias + gain * шум
   jitter   0..1 — насколько объект может смещаться внутри клетки
   tilt     максимальный наклон, радианы
   colors   переопределение цвета части: номер или [от, до]
            glow     переопределение свечения части: {partId: [цвет, сила]}
   ========================================================================== */

window.BIOMES = {

  /* ══════════════════════════════ Лес-Поле ══════════════════════════════ */
  forest: {
    name: 'Лес-Поле',
    note: 'Умеренный климат: хвойные и лиственные леса, луга, грунтовая дорога',
    sky: {
      top: 0x4a90d8, bottom: 0xdceaf4, sun: 0xfff0cf, sunDir: [-0.50, 0.47, 0.72],
      fog: 0xd3e3f0, fogK: [0.95, 4.2],
      exposure: 0.88, sunI: 1.8,
      hemiSky: 0x9ec4f2, hemiGround: 0x3d4a30, hemiI: 0.26,
      fill: 0x9fc4ff, fillI: 0.22, glow: 0.16,
    },
    water: { level: -11, color: 0x2f7d9b, rough: 0.05, clear: 1, envI: 1.45, wave: 1 },
    relief: {
      amp: 13.5, freq: 0.028, oct: 5, ridged: false,
      detAmp: 2.2, detFreq: 0.105,
      roadFlatten: 0.86, roadSink: 1.05,
      blockedLift: 0, blockedFlat: 0,
      rimStart: 0.60, rimDrop: 26, base: 0,
    },
    ground: {
      free: [0x63903c, 0x8ab457], road: [0x8c7047, 0xb59463], blocked: [0x3f6d28, 0x5c8a3c],
      grain: 0.11, mottle: 0.09, speckle: 0.12,
    },
    scatter: {
      free: [
        { b: 'conifer', per: 0.42, layer: 'plants', scale: [0.75, 1.45], jitter: 0.9, tilt: 0.05,
          dens: { freq: 0.07, bias: 0.42, gain: 1.0 },
          colors: { low: [0x25501f, 0x357028], top: [0x2c5c22, 0x3f7f2c], trunk: [0x4e3820, 0x63482a] } },
        { b: 'broadleaf', per: 0.18, layer: 'plants', scale: [0.8, 1.5], jitter: 0.9, tilt: 0.06,
          colors: { crown: [0x3d7a24, 0x59a032], crown2: [0x356c20, 0x4e8f2c], trunk: [0x54391f, 0x6b4a2a] } },
        { b: 'tuft', per: 3, layer: 'plants', scale: [0.6, 1.55], jitter: 1,
          colors: { blade: [0x4f8a2c, 0x76b047] } },
      ],
      road: [
        { b: 'pebble', per: 0.09, layer: 'rocks', scale: [0.45, 1.0], jitter: 0.95 },
      ],
      blocked: [
        { b: 'conifer', per: 0.55, layer: 'plants', scale: [0.8, 1.55], jitter: 0.9, tilt: 0.05,
          dens: { freq: 0.07, bias: 0.5, gain: 1.0 },
          colors: { low: [0x1f4a1c, 0x2f6b24], top: [0x275a20, 0x3a7d2a], trunk: [0x452f1c, 0x583a24] } },
        { b: 'tuft', per: 1.2, layer: 'plants', scale: [0.5, 1.2], jitter: 1,
          colors: { blade: [0x3d6f24, 0x5d8f39] } },
        { b: 'pebble', per: 0.05, layer: 'rocks', scale: [0.4, 0.9], jitter: 0.95 },
      ], },
    },

  /* ═══════════════════════════════ Пустыня ══════════════════════════════ */
  desert: {
    name: 'Пустыня',
    note: 'Барханы, кактусы и сухие кусты. Воды нет, горизонт тонет в мареве',
    sky: {
      top: 0x74a8d2, bottom: 0xf2ddbe, sun: 0xfff2d0, sunDir: [0.34, 0.52, -0.78],
      fog: 0xe8d4b4, fogK: [0.62, 2.95],
      exposure: 0.95, sunI: 2.1,
      hemiSky: 0xf0d9b0, hemiGround: 0x6b5233, hemiI: 0.30,
      fill: 0x9fc4ff, fillI: 0.18, glow: 0.22,
    },
    water: null,
    relief: {
      amp: 13, freq: 0.014, oct: 4, ridged: false,
      detAmp: 1.2, detFreq: 0.085,
      roadFlatten: 0.80, roadSink: 0.45,
      blockedLift: 2.5, blockedFlat: 0.3,
      rimStart: 0.62, rimDrop: 22, base: 0,
    },
    ground: {
      free: [0xc4a067, 0xead094], road: [0xa88a5e, 0xcbb083], blocked: [0x8a6f4a, 0xb59468],
      grain: 0.10, mottle: 0.07, speckle: 0.10,
    },
    scatter: {
      free: [
        { b: 'cactus', per: 0.10, layer: 'plants', scale: [0.7, 1.5], jitter: 0.85,
          colors: { body: [0x4a7a52, 0x66966a], arm: [0x447049, 0x5c8a5c] } },
        { b: 'scrub', per: 0.22, layer: 'plants', scale: [0.6, 1.4], jitter: 1,
          colors: { bush: [0x8a7a45, 0xa89463] } },
        { b: 'tuft', per: 1.4, layer: 'plants', scale: [0.5, 1.1], jitter: 1,
          colors: { blade: [0xb59a63, 0xd0b47c] } },
        { b: 'pebble', per: 0.06, layer: 'rocks', scale: [0.4, 0.95], jitter: 0.95, colors: { rock: [0x9a7c52, 0xc0a06e] } },
      ],
      road: [
        { b: 'pebble', per: 0.16, layer: 'rocks', scale: [0.45, 1.05], jitter: 0.95, colors: { rock: [0x9a7c52, 0xc0a06e] } },
        { b: 'scrub', per: 0.03, layer: 'plants', scale: [0.5, 1.0], jitter: 1 },
      ],
      blocked: [
        { b: 'boulder', per: 0.30, layer: 'rocks', scale: [0.8, 1.9], jitter: 0.9, tilt: 0.2, colors: { rock: [0x9a7c52, 0xc0a06e] } },
        { b: 'scrub', per: 0.12, layer: 'plants', scale: [0.5, 1.1], jitter: 1 },
      ], },
    },

  /* ════════════════════════════════ Горы ═══════════════════════════════ */
  mountains: {
    name: 'Горы',
    note: 'Гребнистый рельеф, скальные массивы, снежные языки и сосны по склонам',
    sky: {
      top: 0x3d7cc4, bottom: 0xdfeaf4, sun: 0xfff4dd, sunDir: [-0.62, 0.40, 0.68],
      fog: 0xd8e6f2, fogK: [0.82, 3.6],
      exposure: 0.90, sunI: 1.7,
      hemiSky: 0xa8c8ee, hemiGround: 0x545c62, hemiI: 0.30,
      fill: 0x8fb4e0, fillI: 0.24, glow: 0.18,
    },
    water: { level: -13, color: 0x3a7f96, rough: 0.06, clear: 1, envI: 1.3, wave: 1.2 },
    relief: {
      amp: 42, freq: 0.018, oct: 6, ridged: true, ridgedMid: 0.36,
      detAmp: 2.6, detFreq: 0.09,
      roadFlatten: 0.72, roadSink: 0.9,
      blockedLift: 4, blockedFlat: 0.12,
      rimStart: 0.62, rimDrop: 42, base: 0,
    },
    ground: {
      free: [0x4a7a4a, 0x6f9a6a], road: [0x7f868c, 0xa8b0b6], blocked: [0x5f656c, 0x878e95],
      grain: 0.13, mottle: 0.06, speckle: 0.16,
    },
    scatter: {
      free: [
        { b: 'pine', per: 0.28, layer: 'plants', scale: [0.7, 1.35], jitter: 0.9, tilt: 0.07,
          dens: { freq: 0.06, bias: 0.35, gain: 0.9 },
          colors: { low: [0x1e3f2a, 0x2c5a3a], mid: [0x24492f, 0x336641], top: [0x2b5537, 0x3c7049], trunk: [0x453020, 0x573f2a] } },
        { b: 'tuft', per: 2, layer: 'plants', scale: [0.5, 1.2], jitter: 1,
          colors: { blade: [0x5d8a4a, 0x86ab63] } },
        { b: 'boulder', per: 0.08, layer: 'rocks', scale: [0.6, 1.4], jitter: 0.9, tilt: 0.25, colors: { rock: [0x6e7379, 0x8f959c] } },
      ],
      road: [
        { b: 'pebble', per: 0.14, layer: 'rocks', scale: [0.45, 1.05], jitter: 0.95, colors: { rock: [0x6e7379, 0x8f959c] } },
      ],
      blocked: [
        { b: 'boulder', per: 0.45, layer: 'rocks', scale: [0.9, 2.2], jitter: 0.9, tilt: 0.3, colors: { rock: [0x6e7379, 0x8f959c] } },
        { b: 'drift', per: 0.18, layer: 'props', scale: [0.7, 1.4], jitter: 0.95,
          colors: { snow: [0xe8f0f8, 0xfdfeff] } },
        { b: 'pine', per: 0.16, layer: 'plants', scale: [0.6, 1.15], jitter: 0.9, tilt: 0.07 },
      ], },
    },

  /* ═══════════════════════════ Марсианская пустыня ═══════════════════════ */
  mars: {
    name: 'Марсианская пустыня',
    note: 'Ржавая пыль, базальтовые останцы, кактусы-друиды. Пыльная буря',
    sky: {
      top: 0xc98a5a, bottom: 0xefc79a, sun: 0xffd9a8, sunDir: [0.42, 0.40, -0.82],
      fog: 0xd9a878, fogK: [0.44, 2.15],
      exposure: 0.98, sunI: 1.5,
      hemiSky: 0xd8a070, hemiGround: 0x6b3a22, hemiI: 0.38,
      fill: 0x7fa8d8, fillI: 0.16, glow: 0.26,
    },
    water: null,
    relief: {
      amp: 12.5, freq: 0.022, oct: 5, ridged: false,
      detAmp: 1.7, detFreq: 0.1,
      roadFlatten: 0.84, roadSink: 0.6,
      blockedLift: 4, blockedFlat: 0.15,
      rimStart: 0.58, rimDrop: 26, base: 0,
    },
    ground: {
      free: [0x9c4f2c, 0xc4703f], road: [0x7d3f24, 0xa35a33], blocked: [0x5e2f1c, 0x7d4429],
      grain: 0.14, mottle: 0.08, speckle: 0.14,
    },
    scatter: {
      free: [
        { b: 'cactus', per: 0.06, layer: 'plants', scale: [0.6, 1.3], jitter: 0.85,
          colors: { body: [0x6b5a3a, 0x8a7550], arm: [0x60503a, 0x7d6a48] } },
        { b: 'boulder', per: 0.12, layer: 'rocks', scale: [0.7, 1.7], jitter: 0.9, tilt: 0.25, colors: { rock: [0x4e3527, 0x6d4a34] } },
        { b: 'scrub', per: 0.08, layer: 'plants', scale: [0.5, 1.1], jitter: 1,
          colors: { bush: [0x7a5a42, 0x967050] } },
        { b: 'crystal', per: 0.03, layer: 'props', scale: [0.6, 1.2], jitter: 0.9,
          colors: { shard: 0xd9a0ff }, glow: { shard: [0x7a3ab0, 0.9] } },
      ],
      road: [
        { b: 'pebble', per: 0.20, layer: 'rocks', scale: [0.45, 1.1], jitter: 0.95, colors: { rock: [0x4e3527, 0x6d4a34] } },
      ],
      blocked: [
        { b: 'basalt', per: 0.35, layer: 'rocks', scale: [0.7, 1.8], jitter: 0.9, tilt: 0.12 },
        { b: 'boulder', per: 0.28, layer: 'rocks', scale: [0.8, 2.0], jitter: 0.9, tilt: 0.3, colors: { rock: [0x4e3527, 0x6d4a34] } },
        { b: 'crystal', per: 0.05, layer: 'props', scale: [0.6, 1.3], jitter: 0.9 },
      ], },
    },

  /* ═══════════════════════════════ Болота Венеры ════════════════════════ */
  venus: {
    name: 'Болота Венеры',
    note: 'Кислотная мелководь: дорога-дамба, грибные рощи, плотный серный туман',
    sky: {
      top: 0xd9b45e, bottom: 0xf4e2ac, sun: 0xfff0b0, sunDir: [-0.30, 0.66, 0.68],
      fog: 0xe8d49a, fogK: [0.52, 2.35],
      exposure: 1.02, sunI: 1.3,
      hemiSky: 0xf0d890, hemiGround: 0x4a5a3a, hemiI: 0.48,
      fill: 0xbfd8a0, fillI: 0.20, glow: 0.30,
    },
    water: { level: -0.4, color: 0x2a8f74, rough: 0.10, clear: 0.8, envI: 1.2, wave: 0.55 },
    relief: {
      amp: 3.4, freq: 0.03, oct: 4, ridged: false,
      detAmp: 0.9, detFreq: 0.12,
      roadFlatten: 0.45, roadSink: -0.9,
      blockedLift: 2.2, blockedFlat: 0.35,
      rimStart: 0.62, rimDrop: 16, base: 0,
    },
    ground: {
      free: [0x3d5a34, 0x5c7a48], road: [0x8a7a4a, 0xaa9a62], blocked: [0x2f4a2a, 0x46683a],
      grain: 0.12, mottle: 0.1, speckle: 0.08,
    },
    scatter: {
      free: [
        { b: 'reed', per: 2.4, layer: 'plants', scale: [0.7, 1.6], jitter: 1,
          colors: { stalk: [0x6f8a3a, 0x94ad55] } },
        { b: 'lily', per: 0.22, layer: 'plants', scale: [0.7, 1.5], jitter: 0.95 },
        { b: 'tuft', per: 1, layer: 'plants', scale: [0.5, 1.2], jitter: 1,
          colors: { blade: [0x4a7038, 0x6b9450] } },
      ],
      road: [
        { b: 'scrub', per: 0.14, layer: 'plants', scale: [0.5, 1.1], jitter: 1 },
        { b: 'pebble', per: 0.05, layer: 'rocks', scale: [0.4, 0.9], jitter: 0.95, colors: { rock: [0x4a5a44, 0x6b7d5f] } },
      ],
      blocked: [
        { b: 'giantMushroom', per: 0.42, layer: 'props', scale: [0.7, 1.7], jitter: 0.9, tilt: 0.06 },
        { b: 'mushroom', per: 0.7, layer: 'props', scale: [0.6, 1.5], jitter: 0.95 },
        { b: 'spore', per: 0.5, layer: 'props', scale: [0.7, 1.6], jitter: 1,
          colors: { ball: 0xd9f0a0 }, glow: { ball: [0xa0e060, 1.4] } },
      ], },
    },

  /* ════════════════════════════════ Ледник ══════════════════════════════ */
  glacier: {
    name: 'Ледник',
    note: 'Снег и лёд, ледяные шпили, мёрзлый кустарник. Синий холодный свет',
    sky: {
      top: 0x6f9fd0, bottom: 0xeaf3f9, sun: 0xfff8ec, sunDir: [-0.55, 0.42, 0.72],
      fog: 0xdfeaf2, fogK: [0.58, 2.7],
      exposure: 0.92, sunI: 1.6,
      hemiSky: 0xbcd8f2, hemiGround: 0x6a7a86, hemiI: 0.36,
      fill: 0xa8c8e8, fillI: 0.26, glow: 0.20,
    },
    water: { level: -8, color: 0x2a5f80, rough: 0.04, clear: 1, envI: 1.5, wave: 0.8 },
    relief: {
      amp: 16, freq: 0.024, oct: 5, ridged: false,
      detAmp: 1.8, detFreq: 0.11,
      roadFlatten: 0.80, roadSink: 1.0,
      blockedLift: 5, blockedFlat: 0.2,
      rimStart: 0.58, rimDrop: 30, base: 0,
    },
    ground: {
      free: [0xe4eef6, 0xfafdff], road: [0x8ba3b6, 0xaec6d6], blocked: [0x7fa8c4, 0xa8cde4],
      grain: 0.08, mottle: 0.07, speckle: 0.10,
    },
    scatter: {
      free: [
        { b: 'iceSpike', per: 0.14, layer: 'rocks', scale: [0.7, 1.7], jitter: 0.9, tilt: 0.1,
          colors: { spike: [0x9fd0ea, 0xd8f0ff] } },
        { b: 'drift', per: 0.28, layer: 'props', scale: [0.8, 1.8], jitter: 0.95,
          colors: { snow: [0xeaf2fa, 0xffffff] } },
        { b: 'tuft', per: 0.6, layer: 'plants', scale: [0.45, 1.0], jitter: 1,
          colors: { blade: [0x8aa89a, 0xa8c4b4] } },
      ],
      road: [
        { b: 'pebble', per: 0.10, layer: 'rocks', scale: [0.4, 0.95], jitter: 0.95, colors: { rock: [0x7d9cb4, 0xa8c6d8] } },
        { b: 'drift', per: 0.10, layer: 'props', scale: [0.6, 1.3], jitter: 0.95 },
      ],
      blocked: [
        { b: 'iceSpike', per: 0.45, layer: 'rocks', scale: [0.9, 2.3], jitter: 0.9, tilt: 0.12 },
        { b: 'drift', per: 0.40, layer: 'props', scale: [1.0, 2.2], jitter: 0.95 },
        { b: 'crystal', per: 0.06, layer: 'props', scale: [0.6, 1.3], jitter: 0.9,
          colors: { shard: 0xbfe8ff }, glow: { shard: [0x4a9ad0, 0.8] } },
      ], },
    },

  /* ═════════════════════════════ Грибная чаща ═══════════════════════════ */
  fungal: {
    name: 'Грибная чаща',
    note: 'Тёмный мох, гигантские светящиеся грибы и споры. Свет только от грибов',
    sky: {
      top: 0x1e1830, bottom: 0x7a5a86, sun: 0xc0a0ff, sunDir: [0.44, 0.54, 0.72],
      fog: 0x4a3a5e, fogK: [0.34, 1.6],
      exposure: 1.25, sunI: 1.25,
      hemiSky: 0x9a7ac8, hemiGround: 0x4a5a44, hemiI: 1.0,
      fill: 0x40ffa0, fillI: 0.28, glow: 0.34,
    },
    water: null,
    relief: {
      amp: 10.5, freq: 0.03, oct: 5, ridged: false,
      detAmp: 1.4, detFreq: 0.115,
      roadFlatten: 0.78, roadSink: 0.9,
      blockedLift: 3.5, blockedFlat: 0.25,
      rimStart: 0.62, rimDrop: 22, base: 0,
    },
    ground: {
      free: [0x50684a, 0x76916a], road: [0x6f6684, 0x968ba8], blocked: [0x42593c, 0x5f7a54],
      grain: 0.15, mottle: 0.1, speckle: 0.10,
    },
    scatter: {
      free: [
        { b: 'tuft', per: 2, layer: 'plants', scale: [0.5, 1.3], jitter: 1,
          colors: { blade: [0x3f6f3a, 0x5d8f52] } },
        { b: 'mushroom', per: 0.32, layer: 'props', scale: [0.6, 1.4], jitter: 0.95,
          colors: { stem: [0xbfd8a0, 0xd9e8bf], cap: [0xd06a9a, 0xf08ab4] }, glow: { stem: [0x8a2a6a, 0.7] } },
        { b: 'spore', per: 0.45, layer: 'props', scale: [0.6, 1.5], jitter: 1,
          colors: { ball: 0xa0ffd0 }, glow: { ball: [0x40ffa0, 1.8] } },
      ],
      road: [
        { b: 'pebble', per: 0.12, layer: 'rocks', scale: [0.4, 0.95], jitter: 0.95, colors: { rock: [0x3a3a44, 0x56565f] } },
        { b: 'spore', per: 0.10, layer: 'props', scale: [0.5, 1.1], jitter: 1 },
      ],
      blocked: [
        { b: 'giantMushroom', per: 0.6, layer: 'props', scale: [0.8, 2.0], jitter: 0.9, tilt: 0.05 },
        { b: 'mushroom', per: 0.8, layer: 'props', scale: [0.6, 1.6], jitter: 0.95,
          colors: { stem: [0xbfd8a0, 0xd9e8bf], cap: [0xd06a9a, 0xf08ab4] }, glow: { stem: [0x8a2a6a, 0.7] } },
        { b: 'spore', per: 0.8, layer: 'props', scale: [0.6, 1.7], jitter: 1,
          colors: { ball: 0xa0ffd0 }, glow: { ball: [0x40ffa0, 1.8] } },
        { b: 'crystal', per: 0.05, layer: 'props', scale: [0.5, 1.1], jitter: 0.9,
          colors: { shard: 0xc0ffd0 }, glow: { shard: [0x2a9a5a, 1.0] } },
      ], }, }, };
