// 开机启动动画：粒子旋聚成 logo（gather，慢速）→ 之后进入呼吸常驻（breathe）。
// 视觉逻辑抽自 resource/start-animation.html 的 gather/breathe 两个模式，丢弃其余模式与展示用 UI。
// 时长由音频 ended 事件驱动收尾（音画同步），error 兜底防音频加载失败时卡死。
;(() => {
  const W = 340
  const H = 340
  const CX = W / 2
  const CY = H / 2 + 1
  const TWO_PI = Math.PI * 2
  // 绘图坐标系仍是 340，但实际在窗口里放大到这个尺寸显示（适配 1280×800 的 splash）。
  const DISPLAY_SIZE = 560

  function clamp(v, a = 0, b = 1) {
    return Math.max(a, Math.min(b, v))
  }
  function lerp(a, b, t) {
    return a + (b - a) * t
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3)
  }
  function easeInCubic(t) {
    return t * t * t
  }
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }
  function easeOutBack(t) {
    const c1 = 1.35
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  }
  function mixColor(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16),
      ag = parseInt(a.slice(3, 5), 16),
      ab = parseInt(a.slice(5, 7), 16)
    const br = parseInt(b.slice(1, 3), 16),
      bg = parseInt(b.slice(3, 5), 16),
      bb = parseInt(b.slice(5, 7), 16)
    return `rgb(${Math.round(lerp(ar, br, t))}, ${Math.round(lerp(ag, bg, t))}, ${Math.round(
      lerp(ab, bb, t),
    )})`
  }
  function rotatePoint(x, y, angle, cx = CX, cy = CY) {
    const dx = x - cx,
      dy = y - cy
    const c = Math.cos(angle),
      s = Math.sin(angle)
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c }
  }
  function mulberry32(seed) {
    return function () {
      let t = (seed += 0x6d2b79f5)
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  // 固定种子，保证每次启动的粒子分布一致。
  const rand = mulberry32(20260623)
  const particles = []
  const arms = 19
  const levels = 17
  for (let arm = 0; arm < arms; arm++) {
    for (let level = 0; level < levels; level++) {
      const n = level / (levels - 1)
      const wobble = (rand() - 0.5) * 1.3
      const r = 27 + Math.pow(n, 0.88) * 112 + wobble
      const theta = (arm * TWO_PI) / arms + level * 0.39 + Math.pow(n, 1.6) * 0.68
      const x = CX + Math.cos(theta) * r * 1.04
      const y = CY + Math.sin(theta) * r * 0.92
      const side = clamp((x - 58) / (W - 116))
      const colorBias = clamp(side * 0.98 + (rand() - 0.5) * 0.1)
      const baseSize = lerp(0.75, 4.0, Math.pow(n, 0.85)) * (0.82 + rand() * 0.36)
      const color = mixColor('#d8d1c2', '#285f61', colorBias)
      const sxAngle = theta - 0.82 - n * 0.35
      const expand = lerp(2.15, 1.65, n)
      const noise = 12 + rand() * 24
      const startX = CX + Math.cos(sxAngle) * r * expand + (rand() - 0.5) * noise
      const startY = CY + Math.sin(sxAngle) * r * expand * 0.93 + (rand() - 0.5) * noise
      const outAngle = theta + 0.68 + n * 0.45
      const endX = CX + Math.cos(outAngle) * r * 2.05 + (rand() - 0.5) * 16
      const endY = CY + Math.sin(outAngle) * r * 1.85 + (rand() - 0.5) * 16
      particles.push({ x, y, r: baseSize, theta, radius: r, n, color, startX, startY, endX, endY, seed: rand() })
    }
  }
  // 外圈加少量不规则点，让边缘更像真实图标里的自然散布。
  for (let i = 0; i < 38; i++) {
    const n = 0.76 + rand() * 0.26
    const theta = rand() * TWO_PI
    const r = 105 + rand() * 42
    const x = CX + Math.cos(theta) * r * 1.03
    const y = CY + Math.sin(theta) * r * 0.9
    const side = clamp((x - 54) / (W - 108))
    const color = mixColor('#d8d1c2', '#285f61', side)
    const sxa = theta - 1.0
    const exa = theta + 0.9
    particles.push({
      x,
      y,
      r: 2.4 + rand() * 1.9,
      theta,
      radius: r,
      n,
      color,
      startX: CX + Math.cos(sxa) * r * 2.1 + (rand() - 0.5) * 26,
      startY: CY + Math.sin(sxa) * r * 1.9 + (rand() - 0.5) * 26,
      endX: CX + Math.cos(exa) * r * 2.25 + (rand() - 0.5) * 22,
      endY: CY + Math.sin(exa) * r * 2.02 + (rand() - 0.5) * 22,
      seed: rand(),
    })
  }

  function setup(ctx, canvas) {
    const dpr = window.devicePixelRatio || 1
    canvas.width = DISPLAY_SIZE * dpr
    canvas.height = DISPLAY_SIZE * dpr
    canvas.style.width = DISPLAY_SIZE + 'px'
    canvas.style.height = DISPLAY_SIZE + 'px'
    // 把 340 的绘图坐标缩放到 DISPLAY_SIZE（再乘 dpr 适配高分屏），放大后仍锐利。
    const s = (DISPLAY_SIZE / W) * dpr
    ctx.setTransform(s, 0, 0, s, 0, 0)
  }
  function clear(ctx) {
    ctx.clearRect(0, 0, W, H)
  }
  function roundRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }
  function drawBackdrop(ctx, alpha = 1, scale = 1) {
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.translate(CX, CY)
    ctx.scale(scale, scale)
    ctx.translate(-CX, -CY)

    ctx.shadowColor = 'rgba(34,31,24,.13)'
    ctx.shadowBlur = 26
    ctx.shadowOffsetY = 13
    roundRectPath(ctx, 20, 18, 300, 300, 58)
    const bgGrad = ctx.createLinearGradient(24, 18, 320, 320)
    bgGrad.addColorStop(0, '#fbfaf6')
    bgGrad.addColorStop(0.55, '#f1ece3')
    bgGrad.addColorStop(1, '#e6dfd4')
    ctx.fillStyle = bgGrad
    ctx.fill()

    ctx.shadowColor = 'transparent'
    roundRectPath(ctx, 20.5, 18.5, 299, 299, 57)
    const inner = ctx.createRadialGradient(CX - 40, CY - 40, 40, CX, CY, 176)
    inner.addColorStop(0, 'rgba(255,255,255,.72)')
    inner.addColorStop(0.72, 'rgba(255,255,255,.06)')
    inner.addColorStop(1, 'rgba(160,145,126,.08)')
    ctx.fillStyle = inner
    ctx.fill()

    ctx.strokeStyle = 'rgba(82,73,61,.08)'
    ctx.lineWidth = 1
    roundRectPath(ctx, 20.5, 18.5, 299, 299, 57)
    ctx.stroke()
    ctx.restore()
  }
  function drawDot(ctx, x, y, r, color, opacity = 1, blur = 0) {
    ctx.save()
    ctx.globalAlpha = clamp(opacity)
    if (blur) {
      ctx.shadowColor = color
      ctx.shadowBlur = blur
    }
    ctx.beginPath()
    ctx.arc(x, y, Math.max(0.1, r), 0, TWO_PI)
    ctx.fillStyle = color
    ctx.fill()
    ctx.restore()
  }
  function drawBall(ctx, opacity = 1, scale = 1, glow = 0) {
    ctx.save()
    ctx.globalAlpha = clamp(opacity)
    ctx.translate(CX, CY)
    ctx.scale(scale, scale)
    ctx.translate(-CX, -CY)
    if (glow) {
      ctx.shadowColor = 'rgba(33,80,80,.34)'
      ctx.shadowBlur = glow
      ctx.shadowOffsetY = 2
    } else {
      ctx.shadowColor = 'rgba(20,35,34,.20)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetY = 4
    }
    ctx.beginPath()
    ctx.arc(CX, CY, 22, 0, TWO_PI)
    const g = ctx.createRadialGradient(CX - 9, CY - 12, 4, CX + 5, CY + 6, 28)
    g.addColorStop(0, '#779492')
    g.addColorStop(0.46, '#456d6c')
    g.addColorStop(1, '#203f40')
    ctx.fillStyle = g
    ctx.fill()
    ctx.restore()
  }
  function drawParticlesFormed(ctx, opacity = 1, rotation = 0, breathe = 0, twinklePhase = 0) {
    for (const p of particles) {
      const pr = rotatePoint(p.x, p.y, rotation)
      const wave = Math.sin(twinklePhase + p.seed * 10 + p.n * 4) * 0.1
      const rr = p.r * (1 + breathe * 0.14 + wave * 0.08)
      const a = opacity * (0.86 + p.n * 0.14 + wave)
      drawDot(ctx, pr.x, pr.y, rr, p.color, a)
    }
  }
  function drawGather(ctx, tNorm) {
    clear(ctx)
    const bgT = clamp(tNorm / 0.18)
    drawBackdrop(ctx, easeOutCubic(bgT), lerp(0.965, 1, easeOutCubic(bgT)))

    const appearT = clamp((tNorm - 0.06) / 0.7)
    for (const p of particles) {
      const delay = 0.02 + (1 - p.n) * 0.2 + p.seed * 0.09
      const dur = 0.62 + p.seed * 0.1
      const local = clamp((tNorm - delay) / dur)
      const e = easeOutCubic(local)
      const twist = (1 - e) * (-0.75 - p.n * 0.35)
      const tx = lerp(p.startX, p.x, e)
      const ty = lerp(p.startY, p.y, e)
      const pos = rotatePoint(tx, ty, twist)
      const rr = lerp(p.r * 0.32, p.r, e)
      const op = clamp(e * 1.2) * clamp(appearT * 1.5)
      drawDot(ctx, pos.x, pos.y, rr, p.color, op, (1 - e) * 2.2)
    }

    const ballT = clamp((tNorm - 0.7) / 0.22)
    drawBall(ctx, easeOutCubic(ballT), lerp(0.64, 1, easeOutBack(ballT)), lerp(24, 5, ballT))
  }
  function drawBreathe(ctx, tNorm) {
    clear(ctx)
    drawBackdrop(ctx, 1, 1)
    const phase = tNorm * TWO_PI
    const rot = Math.sin(phase) * 0.035
    const breath = Math.sin(phase * 1.2) * 0.15
    drawParticlesFormed(ctx, 1, rot, breath, phase * 2.1)
    drawBall(ctx, 1, 1 + Math.sin(phase * 1.3) * 0.025, 10 + Math.max(0, Math.sin(phase * 1.3)) * 10)
  }

  const canvas = document.querySelector('canvas.logo-canvas')
  const ctx = canvas.getContext('2d')
  setup(ctx, canvas)

  // 慢速编排，适配约 15s 的开机音效：前 ~6.5s 缓慢旋聚成 logo，之后呼吸常驻到音效结束。
  const GATHER_MS = 6500
  const BREATHE_MS = 4500
  const start = performance.now()
  function frame(now) {
    const elapsed = now - start
    if (elapsed < GATHER_MS) {
      drawGather(ctx, elapsed / GATHER_MS)
    } else {
      drawBreathe(ctx, ((elapsed - GATHER_MS) % BREATHE_MS) / BREATHE_MS)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // 音画同步：音频自然播完即通知主进程收尾；加载失败也兜底通知，避免 splash 卡死。
  const audio = document.getElementById('startup-audio')
  const skipButton = document.querySelector('.skip-button')
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    window.desktopAPI?.splashDone?.()
  }
  const skip = () => {
    if (audio) {
      audio.pause()
    }
    if (finished) return
    finished = true
    window.desktopAPI?.splashSkip?.()
  }
  skipButton?.addEventListener('click', skip)
  if (audio) {
    audio.addEventListener('ended', finish)
    audio.addEventListener('error', finish)
  } else {
    finish()
  }
})()
