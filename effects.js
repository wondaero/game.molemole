// ─── 슬로우모션 / 물총 타이밍 ─────────────────────────────────────────────────
const SLOW_RATE        = 0.1;
const SLOW_START_MS    = 117;   // 정상속도 기준 히트 1/3 지점
const REMAINING_HIT_MS = 23;    // 1/3 → 40% 히트 잔여 (정상속도 ms)
const HIT_WALL_MS      = SLOW_START_MS + Math.ceil(REMAINING_HIT_MS / SLOW_RATE); // ~347ms

// ── 번개 타이밍 ───────────────────────────────────────────────────────────────
const LIGHTNING_SLOWSTART_MS = 80;
const LIGHTNING_HIT_MS       = 220;
const LIGHTNING_RESOLVE_MS   = LIGHTNING_HIT_MS + 400;

// ── 투척 타이밍: 폭탄/물풍선 ──────────────────────────────────────────────────
const THROW_SLOWSTART_MS  = 160;
const THROW_HIT_MS        = 480;
const THROW_RESOLVE_MS    = THROW_HIT_MS + 600;

// ── 핀조명 타이밍 ─────────────────────────────────────────────────────────────
const SPOT_SLOWSTART_MS  = 100;
const SPOT_HIT_MS        = 380;
const SPOT_RESOLVE_MS    = SPOT_HIT_MS + 550;

// ── UFO 타이밍 ────────────────────────────────────────────────────────────────
const UFO_SLOWSTART_MS   = 150;
const UFO_HIT_MS         = 520;
const UFO_RESOLVE_MS     = UFO_HIT_MS + 700;

// ── 타겟 타이밍 ───────────────────────────────────────────────────────────────
const TARGET_SLOWSTART_MS = 100;
const TARGET_HIT_MS       = 420;
const TARGET_RESOLVE_MS   = TARGET_HIT_MS + 550;

// ── 갈고리 타이밍 ─────────────────────────────────────────────────────────────
const CLAW_SLOWSTART_MS  = 130;
const CLAW_HIT_MS        = 480;
const CLAW_RESOLVE_MS    = CLAW_HIT_MS + 850;

// ── 물총 조준점 (구멍 내 상대 위치, 0.0~1.0) ──────────────────────────────────
const GUN_AIM = { x: 0.5, y: 0.6 };

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────
function makeFlash(color, duration = 180, zIndex = 90) {
    const el = document.createElement('div');
    Object.assign(el.style, {
        position: 'fixed', inset: '0',
        background: color, pointerEvents: 'none', zIndex,
    });
    document.body.appendChild(el);
    el.animate([{ opacity: 1 }, { opacity: 0 }],
        { duration, easing: 'ease-out', fill: 'forwards' })
        .onfinish = () => el.remove();
}


// ─── 망치 이펙트 ──────────────────────────────────────────────────────────────
function swingHammer(cell, moleIndex) {
    const cr = cell.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;

    const hammer = document.createElement('div');
    hammer.className = 'hammer';
    hammer.innerHTML = `<div class="hammer-handle"></div><div class="hammer-head"></div>`;

    hammer.style.position = 'fixed';
    hammer.style.top  = `${cr.top - 50}px`;
    hammer.style.left = `${cx}px`;

    document.body.appendChild(hammer);

    hammer.animate([
        { transform: 'translateX(-50%) rotate(-65deg)', offset: 0,    easing: 'cubic-bezier(0.4,0,1,1)' },
        { transform: 'translateX(-50%) rotate(20deg)',  offset: 0.55, easing: 'ease-out' },
        { transform: 'translateX(-50%) rotate(-8deg)',  offset: 0.75 },
        { transform: 'translateX(-50%) rotate(5deg)',   offset: 0.9  },
        { transform: 'translateX(-50%) rotate(-2deg)',  offset: 1    },
    ], { duration: 280, fill: 'forwards' });

    setTimeout(() => {
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 0,   easing: 'ease-out' },
                { transform: 'translate(-50%, calc(-50% + 14px)) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 1 },
            ], { duration: 250 });
        }
    }, 150);

    setTimeout(() => hammer.remove(), 650);
}

// ─── 번개 이펙트 ──────────────────────────────────────────────────────────────
function strikeLightning(cell) {
    const moleChar = cell.querySelector('.mole-char');
    const mcr = moleChar ? moleChar.getBoundingClientRect() : cell.getBoundingClientRect();
    const tx = mcr.left + mcr.width  / 2;
    const ty = mcr.top  + mcr.height * 0.15;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,20,0.92)',
        pointerEvents: 'none', zIndex: '79',
    });
    document.body.appendChild(overlay);
    const hitRatio = LIGHTNING_HIT_MS / LIGHTNING_RESOLVE_MS;
    overlay.animate([
        { opacity: 0,   offset: 0 },
        { opacity: 1,   offset: 0.13 },
        { opacity: 1,   offset: hitRatio },
        { opacity: 0,   offset: hitRatio + 0.06 },
        { opacity: 0.8, offset: hitRatio + 0.18 },
        { opacity: 0,   offset: 1 },
    ], { duration: LIGHTNING_RESOLVE_MS, fill: 'forwards' })
        .onfinish = () => overlay.remove();

    function makeBoltPath(spread, segs = 7) {
        const pts = [[tx, 0]];
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            pts.push([tx + (Math.random() - 0.5) * spread, ty * t]);
        }
        pts.push([tx, ty]);
        return 'M ' + pts.map(p => p.join(',')).join(' L ');
    }

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(svg.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100vw', height: '100vh',
        pointerEvents: 'none', zIndex: '80', overflow: 'visible',
    });
    svg.innerHTML = `
        <defs>
            <filter id="lglow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
        </defs>
        <path d="${makeBoltPath(50)}" stroke="#FFF176" stroke-width="6"
              fill="none" stroke-linecap="round" filter="url(#lglow)"/>
        <path d="${makeBoltPath(28)}" stroke="#FFFFFF" stroke-width="2.5"
              fill="none" stroke-linecap="round"/>
    `;
    document.body.appendChild(svg);

    svg.animate([
        { opacity: 1 },
        { opacity: 0.9, offset: 0.1 },
        { opacity: 0 },
    ], { duration: 350, easing: 'ease-in', fill: 'forwards' }).onfinish = () => svg.remove();

    setTimeout(() => {
        makeFlash('rgba(255, 248, 130, 0.45)', 180);

        for (let i = 0; i < 10; i++) {
            const sz   = 3 + Math.random() * 6;
            const drop = document.createElement('div');
            Object.assign(drop.style, {
                position: 'fixed',
                width: `${sz}px`, height: `${sz}px`,
                background: `rgba(255,${180 + Math.random() * 75 | 0},30,0.92)`,
                borderRadius: '50%',
                left: `${tx - sz / 2}px`, top: `${ty - sz / 2}px`,
                pointerEvents: 'none', zIndex: '85',
            });
            document.body.appendChild(drop);
            const a = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
            const r = 15 + Math.random() * 35;
            drop.animate([
                { transform: 'translate(0,0) scale(1)',                                    opacity: 1 },
                { transform: `translate(${Math.cos(a)*r}px,${Math.sin(a)*r}px) scale(0)`, opacity: 0 },
            ], { duration: 200 + Math.random() * 180, easing: 'ease-out', fill: 'forwards' })
                .onfinish = () => drop.remove();
        }
    }, LIGHTNING_HIT_MS);
}

// ─── 투척 이펙트 (폭탄 / 물풍선 공통) ────────────────────────────────────────
function throwProjectile(cell, moleIndex, type) {
    const cr   = cell.getBoundingClientRect();
    const tx   = cr.left + cr.width  / 2;
    const ty   = cr.top  + cr.height / 2;
    const sx   = window.innerWidth  / 2;
    const sy   = window.innerHeight - 80;
    const size = 24;
    const arcH = Math.max(120, (sy - ty) * 0.6 + 80);

    const proj = document.createElement('div');
    Object.assign(proj.style, {
        position: 'fixed', left: '0', top: '0',
        width: `${size}px`, pointerEvents: 'none', zIndex: '75',
        transform: `translate(${sx - size / 2}px, ${sy - size / 2}px)`,
    });

    if (type === 'bomb') {
        proj.style.height = `${size}px`;
        proj.innerHTML = `
            <div style="position:relative;width:100%;height:100%">
                <div style="width:${size}px;height:${size}px;background:#1a1a1a;border-radius:50%;
                            border:2px solid #444;box-shadow:inset -3px -3px 6px rgba(0,0,0,0.5),
                            inset 2px 2px 5px rgba(255,255,255,0.1)"></div>
                <div style="position:absolute;width:4px;height:10px;background:#6B4A1A;
                            border-radius:2px;top:-10px;left:50%;transform:translateX(-50%)"></div>
                <div style="position:absolute;font-size:9px;top:-20px;left:50%;
                            transform:translateX(-50%)">✨</div>
            </div>`;
    } else {
        const hue = Math.random() * 360;
        proj.style.height = `${size + 5}px`;
        proj.innerHTML = `
            <div style="position:relative;width:${size}px;height:${size + 5}px">
                <div style="width:${size}px;height:${size + 5}px;
                            background:hsl(${hue},75%,55%);border-radius:50% 50% 45% 45%;
                            box-shadow:inset -4px -4px 8px rgba(0,0,0,0.2),
                            inset 3px 3px 7px rgba(255,255,255,0.45)"></div>
                <div style="position:absolute;width:0;height:0;
                            border-left:4px solid transparent;border-right:4px solid transparent;
                            border-top:6px solid hsl(${hue},65%,42%);
                            bottom:-5px;left:50%;transform:translateX(-50%)"></div>
            </div>`;
    }
    document.body.appendChild(proj);

    const steps = 14;
    const frames = [];
    for (let i = 0; i <= steps; i++) {
        const t   = i / steps;
        const x   = sx + (tx - sx) * t - size / 2;
        const y   = sy + (ty - sy) * t - arcH * 4 * t * (1 - t) - size / 2;
        const rot = type === 'bomb' ? 720 * t : 20 * Math.sin(t * Math.PI * 3);
        frames.push({ transform: `translate(${x}px,${y}px) rotate(${rot}deg)`, offset: t });
    }
    proj.animate(frames, { duration: THROW_HIT_MS, easing: 'linear', fill: 'forwards' });

    setTimeout(() => {
        proj.remove();

        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 0,   easing: 'ease-out' },
                { transform: 'translate(-50%, calc(-50% + 14px)) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 1 },
            ], { duration: 250 });
        }

        if (type === 'bomb') {
            makeFlash('rgba(255,100,0,0.28)', 220);

            for (let i = 0; i < 18; i++) {
                const sz  = 5 + Math.random() * 14;
                const hue = 15 + Math.random() * 45;
                const ptcl = document.createElement('div');
                Object.assign(ptcl.style, {
                    position: 'fixed',
                    width: `${sz}px`, height: `${sz}px`,
                    background: `hsl(${hue},100%,${45 + Math.random() * 25}%)`,
                    borderRadius: Math.random() > 0.4 ? '50%' : '2px',
                    left: `${tx - sz / 2}px`, top: `${ty - sz / 2}px`,
                    pointerEvents: 'none', zIndex: '85',
                });
                document.body.appendChild(ptcl);
                const a = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
                const r = 28 + Math.random() * 60;
                ptcl.animate([
                    { transform: 'translate(0,0) scale(1)', opacity: 1 },
                    { transform: `translate(${Math.cos(a)*r}px,${Math.sin(a)*r}px) scale(0)`, opacity: 0 },
                ], { duration: 320 + Math.random() * 260, easing: 'ease-out', fill: 'forwards' })
                    .onfinish = () => ptcl.remove();
            }
        } else {
            waterSplash(tx, ty);
            waterSplash(tx, ty);
        }
    }, THROW_HIT_MS);
}

// ─── 물총 이펙트 ──────────────────────────────────────────────────────────────
function shootWater(targetEl) {
    if (!gun || !muzzlePt || isShooting) return;
    isShooting = true;

    const gunWrap = gun.parentElement;
    gunWrap.style.opacity = '1';

    const wr = targetEl.getBoundingClientRect();
    const tx = wr.left + wr.width  * GUN_AIM.x;
    const ty = wr.top  + wr.height * GUN_AIM.y;

    const mr = muzzlePt.getBoundingClientRect();
    const mx = mr.left + mr.width  / 2;
    const my = mr.top  + mr.height / 2;

    const gunAng = Math.atan2(ty - my, tx - mx) * (180 / Math.PI);
    gun.style.transform = tx < mx
        ? `scaleX(-1) rotate(${180 - gunAng}deg)`
        : `rotate(${gunAng}deg)`;

    const dist      = Math.hypot(tx - mx, ty - my);
    const streamAng = Math.atan2(tx - mx, -(ty - my)) * (180 / Math.PI);

    const stream = document.createElement('div');
    stream.className = 'water-stream';
    Object.assign(stream.style, {
        left:       `${mx - 4}px`,
        bottom:     `${window.innerHeight - my}px`,
        height:     '0px',
        background: 'linear-gradient(to top, rgba(0,191,255,0.95), rgba(135,206,250,0.5))',
        transform:  `rotate(${streamAng}deg)`,
        transition: 'height 0.13s linear',
        boxShadow:  '0 0 6px rgba(0,191,255,0.6)',
    });
    document.body.appendChild(stream);

    requestAnimationFrame(() => requestAnimationFrame(() => {
        stream.style.height = `${dist}px`;
    }));

    setTimeout(() => {
        waterSplash(tx, ty);
        stream.style.transition = 'opacity 0.12s';
        stream.style.opacity    = '0';
        setTimeout(() => stream.remove(), 150);
        setTimeout(() => { gun.style.transform = ''; gunWrap.style.opacity = '0'; isShooting = false; }, 400);
    }, 145);
}

function waterSplash(cx, cy) {
    for (let i = 0; i < 12; i++) {
        const sz   = 4 + Math.random() * 9;
        const drop = document.createElement('div');
        Object.assign(drop.style, {
            position:      'fixed',
            width:         `${sz}px`,
            height:        `${sz}px`,
            background:    `rgba(${20 + Math.random()*40 | 0},${160 + Math.random()*70 | 0},255,0.88)`,
            borderRadius:  '50%',
            left:          `${cx - sz / 2}px`,
            top:           `${cy - sz / 2}px`,
            pointerEvents: 'none',
            zIndex:        '100',
        });
        document.body.appendChild(drop);

        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
        const r = 16 + Math.random() * 40;
        drop.animate([
            { transform: 'translate(0,0) scale(1)',                                        opacity: 1 },
            { transform: `translate(${Math.cos(a)*r}px,${Math.sin(a)*r}px) scale(0)`,     opacity: 0 },
        ], { duration: 280 + Math.random() * 220, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => drop.remove();
    }
}

// ─── 핀조명 이펙트 ────────────────────────────────────────────────────────────
function strikeSpotlight(cell) {
    const cr = cell.getBoundingClientRect();
    const mx = cr.left + cr.width  / 2;
    const my = cr.top  + cr.height / 2;

    const lampX = window.innerWidth * 0.18;
    const lampY = 14;
    const W = window.innerWidth, H = window.innerHeight;

    const dx = mx - lampX, dy = my - lampY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / dist, ny = dx / dist;

    const startR = 8, endR = cr.width * 0.65;
    const pts = [
        [lampX + nx * startR, lampY + ny * startR],
        [lampX - nx * startR, lampY - ny * startR],
        [mx   - nx * endR,   my   - ny * endR  ],
        [mx   + nx * endR,   my   + ny * endR  ],
    ];

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,0,0.96)',
        pointerEvents: 'none', zIndex: '80', opacity: '0',
    });
    document.body.appendChild(overlay);
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    Object.assign(svg.style, {
        position: 'fixed', left: '0', top: '0',
        pointerEvents: 'none', zIndex: '81', opacity: '0',
    });
    document.body.appendChild(svg);

    const defs = document.createElementNS(svgNS, 'defs');
    const grad = document.createElementNS(svgNS, 'linearGradient');
    grad.setAttribute('id', 'spot-beam-grad');
    grad.setAttribute('gradientUnits', 'userSpaceOnUse');
    grad.setAttribute('x1', lampX); grad.setAttribute('y1', lampY);
    grad.setAttribute('x2', mx);   grad.setAttribute('y2', my);
    [['0%', 'rgba(255,255,160,0.45)'], ['100%', 'rgba(255,255,160,0.0)']].forEach(([off, col]) => {
        const s = document.createElementNS(svgNS, 'stop');
        s.setAttribute('offset', off); s.setAttribute('stop-color', col); grad.appendChild(s);
    });
    defs.appendChild(grad);
    svg.appendChild(defs);

    const beam = document.createElementNS(svgNS, 'polygon');
    beam.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    beam.setAttribute('fill', 'url(#spot-beam-grad)');
    svg.appendChild(beam);

    const ell = document.createElementNS(svgNS, 'ellipse');
    ell.setAttribute('cx', mx); ell.setAttribute('cy', my + 6);
    ell.setAttribute('rx', endR * 0.95); ell.setAttribute('ry', endR * 0.5);
    ell.setAttribute('fill', 'rgba(255,255,200,0.22)');
    ell.setAttribute('opacity', '0');
    svg.appendChild(ell);

    svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 40, fill: 'forwards' });

    const rotateDeg = Math.atan2(-dx, dy) * 180 / Math.PI;
    const lampSize = 52;
    const lampEl = document.createElement('div');
    Object.assign(lampEl.style, {
        position: 'fixed',
        left: `${lampX - lampSize / 2}px`,
        top:  `${lampY}px`,
        width: `${lampSize}px`, height: `${lampSize}px`,
        pointerEvents: 'none', zIndex: '82',
        transformOrigin: `${lampSize / 2}px 0px`,
        transform: `rotate(${rotateDeg}deg)`,
    });
    lampEl.innerHTML = `<svg width="${lampSize}" height="${lampSize}" viewBox="0 0 52 52">
        <line x1="26" y1="0" x2="26" y2="10" stroke="#aaa" stroke-width="3" stroke-linecap="round"/>
        <polygon points="12,10 40,10 46,40 6,40" fill="#4a3a2a" stroke="#7a6a5a" stroke-width="1.5"/>
        <polygon points="16,12 36,12 38,22 14,22" fill="#6a5040" opacity="0.6"/>
        <ellipse cx="26" cy="40" rx="20" ry="5" fill="#2a1a0a"/>
        <ellipse cx="26" cy="40" rx="15" ry="3.5" fill="rgba(255,255,160,0.75)"/>
    </svg>`;
    document.body.appendChild(lampEl);

    setTimeout(() => {
        [overlay, svg].forEach(el => {
            el.animate([{ opacity: 1 }, { opacity: 0 }],
                { duration: 380, easing: 'ease-in', fill: 'forwards' })
                .onfinish = () => el.remove();
        });
        lampEl.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 280, delay: 220, easing: 'ease-in', fill: 'forwards' })
            .onfinish = () => lampEl.remove();
    }, SPOT_HIT_MS);
}

// ─── 인형뽑기 갈고리 이펙트 ───────────────────────────────────────────────────
function strikeClaw(cell, moleIndex) {
    const cr      = cell.getBoundingClientRect();
    const cx      = cr.left + cr.width / 2;
    const targetY = cr.top + cr.height * 0.3;

    const wireH = 140;
    const clawH = 50;
    const wrapH = wireH + clawH;
    const startY      = -wrapH - 5;
    const descendDist = targetY - startY - wrapH;

    const PAUSE_DUR   = 80;
    const totalDur    = CLAW_RESOLVE_MS + 500;
    const descendFrac = CLAW_HIT_MS / totalDur;
    const pauseFrac   = (CLAW_HIT_MS + PAUSE_DUR) / totalDur;

    const openSVG = `<svg width="56" height="${clawH}" viewBox="0 0 56 ${clawH}" style="overflow:visible;display:block">
        <rect x="18" y="0" width="20" height="8" rx="4" fill="#888"/>
        <path d="M 22,8 C 7,22 5,35 10,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M 28,8 L 28,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M 34,8 C 49,22 51,35 46,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    const closedSVG = `<svg width="56" height="${clawH}" viewBox="0 0 56 ${clawH}" style="overflow:visible;display:block">
        <rect x="18" y="0" width="20" height="8" rx="4" fill="#888"/>
        <path d="M 26,8 C 20,20 19,32 22,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M 28,8 L 28,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M 30,8 C 36,20 37,32 34,${clawH}" stroke="#bbb" stroke-width="5" fill="none" stroke-linecap="round"/>
    </svg>`;

    const wrap = document.createElement('div');
    Object.assign(wrap.style, {
        position: 'fixed',
        left: `${cx}px`, top: `${startY}px`,
        width: '56px',
        transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        pointerEvents: 'none', zIndex: '85',
    });

    const wireEl = document.createElement('div');
    Object.assign(wireEl.style, {
        width: '4px', height: `${wireH}px`,
        background: 'linear-gradient(to bottom, rgba(120,120,120,0.4), rgba(180,180,180,0.95))',
        borderRadius: '2px', flexShrink: '0',
    });
    wrap.appendChild(wireEl);

    const clawEl = document.createElement('div');
    clawEl.innerHTML = openSVG;
    wrap.appendChild(clawEl);
    document.body.appendChild(wrap);

    wrap.animate([
        { transform: 'translateX(-50%) translateY(0px)',               offset: 0,           easing: 'ease-in' },
        { transform: `translateX(-50%) translateY(${descendDist}px)`,  offset: descendFrac, easing: 'linear'  },
        { transform: `translateX(-50%) translateY(${descendDist}px)`,  offset: pauseFrac,   easing: 'ease-in' },
        { transform: 'translateX(-50%) translateY(-700px)',            offset: 1            },
    ], { duration: totalDur, fill: 'forwards' })
        .onfinish = () => wrap.remove();

    setTimeout(() => {
        clawEl.innerHTML = closedSVG;

        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            // mole-char가 .mole-clip 밖에 있어 클리핑 없이 위로 이동 가능
            const upDist = Math.round((descendDist + 700) / boardScale);
            const upDur  = totalDur - CLAW_HIT_MS - PAUSE_DUR;
            let upAnim;
            setTimeout(() => {
                upAnim = moleChar.animate([
                    { transform: 'translate(-50%, -50%)',                                              opacity: 1 },
                    { transform: `translate(-50%, calc(-50% - ${upDist}px)) scale(0.15)`,             opacity: 0 },
                ], { duration: upDur, easing: 'ease-in', fill: 'forwards' });
            }, PAUSE_DUR);

            setTimeout(() => upAnim?.cancel(), CLAW_RESOLVE_MS - CLAW_HIT_MS + 250);
        }

        makeFlash('rgba(255,240,180,0.38)', 180);
    }, CLAW_HIT_MS);
}

// ─── UFO 이펙트 ───────────────────────────────────────────────────────────────
function strikeUFO(cell, moleIndex) {
    const cr  = cell.getBoundingClientRect();
    const cx  = cr.left + cr.width  / 2;
    const ufoW = 110;
    const UFO_BODY_H = 50;

    const ufoEndTop  = Math.max(10, cr.top - 200);
    const ufoStartTop = -120;

    const beamH = cr.top - ufoEndTop - UFO_BODY_H;

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,18,0.85)',
        pointerEvents: 'none', zIndex: '78',
    });
    document.body.appendChild(overlay);
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });

    const ufo = document.createElement('div');
    Object.assign(ufo.style, {
        position: 'fixed',
        left: `${cx - ufoW / 2}px`,
        top:  `${ufoStartTop}px`,
        width: `${ufoW}px`,
        pointerEvents: 'none', zIndex: '82',
    });

    ufo.innerHTML = `
        <div style="text-align:center;position:relative">
            <div style="width:46px;height:20px;
                        background:linear-gradient(to bottom,rgba(140,215,255,0.85),rgba(80,160,255,0.45));
                        border-radius:50% 50% 0 0;
                        border:1.5px solid rgba(140,210,255,0.7);
                        margin:0 auto;box-shadow:0 0 12px rgba(100,200,255,0.7)"></div>
            <div style="width:90px;height:22px;
                        background:linear-gradient(135deg,#b8c6dc 0%,#7888a8 100%);
                        border-radius:50%;margin:-2px auto 0;
                        box-shadow:0 0 16px rgba(120,160,255,0.55),inset 0 2px 5px rgba(255,255,255,0.3)"></div>
            <div style="position:relative;height:6px;margin-top:1px">
                <div style="width:6px;height:6px;background:#ffe066;border-radius:50%;
                            position:absolute;left:15px;top:0;box-shadow:0 0 6px #ffe066"></div>
                <div style="width:6px;height:6px;background:#66ffcc;border-radius:50%;
                            position:absolute;left:50%;transform:translateX(-50%);top:0;
                            box-shadow:0 0 6px #66ffcc"></div>
                <div style="width:6px;height:6px;background:#ff88ff;border-radius:50%;
                            position:absolute;right:15px;top:0;box-shadow:0 0 6px #ff88ff"></div>
            </div>
            <div style="width:0;height:0;
                        border-left:28px solid transparent;
                        border-right:28px solid transparent;
                        border-top:${beamH}px solid rgba(120,220,255,0.16);
                        margin:0 auto;filter:blur(6px);position:relative;z-index:-1"></div>
        </div>`;
    document.body.appendChild(ufo);

    const dy = ufoEndTop - ufoStartTop;
    ufo.animate([
        { transform: 'translateY(0)',             opacity: 0 },
        { transform: `translateY(${dy}px)`,       opacity: 1, offset: 0.32, easing: 'ease-out' },
        { transform: `translateY(${dy}px)`,       opacity: 1, offset: 0.65, easing: 'ease-in' },
        { transform: `translateY(${dy - 160}px)`, opacity: 0 },
    ], { duration: UFO_HIT_MS + 600, fill: 'forwards' })
        .onfinish = () => ufo.remove();

    setTimeout(() => {
        makeFlash('rgba(100,200,255,0.28)', 260);

        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            // mole-char가 .mole-clip 밖에 있어 클리핑 없이 UFO로 이동 가능
            const charRect   = moleChar.getBoundingClientRect();
            const travelDist = Math.round(((charRect.top + charRect.height / 2) - (ufoEndTop + UFO_BODY_H)) / boardScale);
            const midDist    = Math.round(travelDist * 0.5);
            const upAnim = moleChar.animate([
                { transform: 'translate(-50%, -50%)',                                                   opacity: 1   },
                { transform: `translate(-50%, calc(-50% - ${midDist}px)) scale(0.6)`,                  opacity: 0.7, offset: 0.5 },
                { transform: `translate(-50%, calc(-50% - ${travelDist}px)) scale(0.15)`,              opacity: 0   },
            ], { duration: 380, easing: 'ease-in', fill: 'forwards' });

            setTimeout(() => {
                try { upAnim.cancel(); } catch(e) {}
            }, UFO_RESOLVE_MS - UFO_HIT_MS + 250);
        }

        for (let i = 0; i < 8; i++) {
            const star = document.createElement('div');
            const sz = 3 + Math.random() * 4;
            Object.assign(star.style, {
                position: 'fixed',
                width: `${sz}px`, height: `${sz}px`,
                background: ['#ffe066','#66ffcc','#ff88ff','#88ccff'][i % 4],
                borderRadius: '50%',
                left: `${cx - sz / 2}px`,
                top:  `${ufoEndTop + 42 - sz / 2}px`,
                pointerEvents: 'none', zIndex: '85',
                boxShadow: `0 0 4px currentColor`,
            });
            document.body.appendChild(star);
            const a = (i / 8) * Math.PI * 2;
            const r = 50 + Math.random() * 30;
            star.animate([
                { transform: 'translate(0,0) scale(1)', opacity: 1 },
                { transform: `translate(${Math.cos(a)*r}px,${Math.sin(a)*r}px) scale(0)`, opacity: 0 },
            ], { duration: 400 + Math.random() * 200, easing: 'ease-out', fill: 'forwards' })
                .onfinish = () => star.remove();
        }

        overlay.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 500, delay: 280, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => overlay.remove();
    }, UFO_HIT_MS);
}

// ─── 타겟 이펙트 ──────────────────────────────────────────────────────────────
function strikeTarget(cell, moleIndex) {
    const cr = cell.getBoundingClientRect();
    const tx = cr.left + cr.width  / 2;
    const ty = cr.top  + cr.height / 2;
    const sx = window.innerWidth  / 2;
    const sy = window.innerHeight - 60;
    const size = 72;

    const target = document.createElement('div');
    Object.assign(target.style, {
        position: 'fixed',
        width:  `${size}px`,
        height: `${size}px`,
        left: `${sx - size / 2}px`,
        top:  `${sy - size / 2}px`,
        borderRadius: '50%',
        pointerEvents: 'none',
        zIndex: '80',
    });
    const r1 = size / 2;
    const r2 = size * 0.32;
    const r3 = size * 0.14;
    target.innerHTML = `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" overflow="visible">
            <circle cx="${r1}" cy="${r1}" r="${r1 - 2}"
                    fill="none" stroke="rgba(255,50,50,0.9)" stroke-width="3"/>
            <circle cx="${r1}" cy="${r1}" r="${r2}"
                    fill="none" stroke="rgba(255,50,50,0.7)" stroke-width="2"/>
            <circle cx="${r1}" cy="${r1}" r="${r3}"
                    fill="rgba(255,50,50,0.55)" stroke="none"/>
            <line x1="${r1}" y1="0"    x2="${r1}" y2="${size}"
                  stroke="rgba(255,50,50,0.65)" stroke-width="1.5"/>
            <line x1="0"    y1="${r1}" x2="${size}" y2="${r1}"
                  stroke="rgba(255,50,50,0.65)" stroke-width="1.5"/>
        </svg>`;
    document.body.appendChild(target);

    target.animate([
        { transform: 'translate(0,0) scale(1.5)', opacity: 0 },
        { transform: 'translate(0,0) scale(1)',   opacity: 1, offset: 0.12 },
        { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.88)` },
    ], { duration: TARGET_HIT_MS, easing: 'cubic-bezier(0.25,0,0.35,1)', fill: 'forwards' });

    setTimeout(() => {
        makeFlash('rgba(255,40,40,0.22)', 180);

        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 0   },
                { transform: 'translate(-50%, calc(-50% + 14px)) scaleY(0.62)', offset: 0.3 },
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 1   },
            ], { duration: 250 });
        }

        target.animate([
            { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.88)`, opacity: 1 },
            { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(2.2)`,  opacity: 0 },
        ], { duration: 380, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => target.remove();

        for (let i = 0; i < 3; i++) {
            const ring = document.createElement('div');
            const rs = 12;
            Object.assign(ring.style, {
                position: 'fixed',
                width: `${rs}px`, height: `${rs}px`,
                borderRadius: '50%',
                border: '2px solid rgba(255,50,50,0.8)',
                left: `${tx - rs / 2}px`, top: `${ty - rs / 2}px`,
                pointerEvents: 'none', zIndex: '85',
            });
            document.body.appendChild(ring);
            ring.animate([
                { transform: 'scale(1)', opacity: 0.8 },
                { transform: `scale(${4 + i * 1.5})`, opacity: 0 },
            ], { duration: 320 + i * 80, delay: i * 60, easing: 'ease-out', fill: 'forwards' })
                .onfinish = () => ring.remove();
        }
    }, TARGET_HIT_MS);
}
