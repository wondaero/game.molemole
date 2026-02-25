// ─── 사운드 시스템 (TODO: 파일 연결 시 구현) ────────────────────────────────
const SFX = {
    // bgm: new Audio('sounds/bgm.mp3'),
    playBGM()         { /* TODO */ },
    stopBGM()         { /* TODO */ },
    setBGMRate(_rate) { /* TODO: bgm.playbackRate = _rate */ },
    moleAppear()      { /* TODO */ },
    hitNormal()       { /* TODO */ },
    hitSpy()          { /* TODO */ },
    gameOver()        { /* TODO */ },
};

// ─── 최고 기록 (localStorage) ─────────────────────────────────────────────────
const STORAGE_KEY = 'molemole_best';

function loadBest() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null; }
    catch { return null; }
}

function saveBest(score) {
    const prev = loadBest();
    if (!prev || score > prev.score) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ score }));
        return true;
    }
    return false;
}

function updateBestDisplay() {
    const best = loadBest();
    elBestScore.textContent = best ? best.score : '-';
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BOARD_SIZE       = 550;   // --cell:120×4 + gap:10×3 + pad:20×2
const GUN_AREA_H       = 110;   // 물총 영역 높이 (보드 스케일 계산 시 제외)
const TURN_DELAY_MIN   = 2000;
const TURN_DELAY_RNG   = 3000;
const SLOW_RATE        = 0.1;
const SLOW_START_MS    = 117;   // 정상속도 기준 히트 1/3 지점
const REMAINING_HIT_MS = 23;    // 1/3 → 40% 히트 잔여 (정상속도 ms)
const HIT_WALL_MS      = SLOW_START_MS + Math.ceil(REMAINING_HIT_MS / SLOW_RATE); // ~347ms

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
let score             = 0;
let reactionTimes     = [];
let moleAppearTime    = 0;
let gameActive        = false;
let turnTimer         = null;
let nextTurnTimer     = null;
let isSlowMo          = false;
let slowMoTimers      = [];
let isShooting        = false;
let isPaused          = false;
let elapsedRafId      = null;
let pauseData         = null;
let turnTimerEndTime  = 0;
let nextTurnTimerEndTime = 0;

// 캐시된 그리드 (initGrid 후 갱신)
let cachedCells = [];
let cachedMoles = [];

// ─── DOM 캐시 ─────────────────────────────────────────────────────────────────
const grid          = document.getElementById('grid');
const elScore       = document.getElementById('score');
const elTimeLimit   = document.getElementById('timeLimit');
const elBestScore   = document.getElementById('bestScore');
const elElapsed     = document.getElementById('elapsedDisplay');
const startScreen   = document.getElementById('startScreen');
const endScreen     = document.getElementById('endScreen');
const pauseOverlay  = document.getElementById('pauseOverlay');
const pauseBtn      = document.getElementById('pauseBtn');
const gun           = document.getElementById('gun');
const muzzlePt      = document.getElementById('muzzlePoint');
const boardWrapper  = document.getElementById('boardWrapper');
const gameHeader    = document.getElementById('gameHeader');
const gameContainer = document.querySelector('.game-container');

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const getNextDelay = () => TURN_DELAY_MIN + Math.random() * TURN_DELAY_RNG;

// ─── 보드 스케일 ──────────────────────────────────────────────────────────────
function scaleBoard() {
    if (!gameHeader || !boardWrapper || !gameContainer) return;
    const headerH = gameHeader.getBoundingClientRect().height;
    const availW  = window.innerWidth - 32;
    const availH  = document.body.clientHeight - headerH - GUN_AREA_H;
    const scale   = Math.min(availW / BOARD_SIZE, availH / BOARD_SIZE);
    gameContainer.style.transform = `scale(${scale})`;
    boardWrapper.style.height     = `${BOARD_SIZE * scale}px`;
}

window.addEventListener('resize', scaleBoard);

// ─── 그리드 초기화 ────────────────────────────────────────────────────────────
function initGrid() {
    grid.innerHTML = '';
    cachedCells = [];
    cachedMoles = [];

    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        const mole = document.createElement('div');
        mole.className = 'mole';
        mole.innerHTML = '<div class="person-content"><span class="person-text"></span></div>';

        const hole = document.createElement('div');
        hole.className = 'mole-hole';
        hole.appendChild(mole);

        cell.appendChild(hole);
        cell.addEventListener('click', () => handleClick(i));
        grid.appendChild(cell);

        cachedCells.push(cell);
        cachedMoles.push(mole);
    }
}

// ─── 난이도 ───────────────────────────────────────────────────────────────────
function getTimeLimit() {
    if (score >= 31) return Math.max(0.1, parseFloat((0.4 - (score - 30) * 0.001).toFixed(3)));
    if (score >= 21) return 0.4;
    if (score >= 16) return 0.5;
    if (score >= 11) return 0.8;
    if (score >= 6)  return 1.0;
    return 1.5;
}

// ─── 랜덤 위치 3개 선택 ───────────────────────────────────────────────────────
function getRandomPositions() {
    const positions = new Set();
    while (positions.size < 3) positions.add(Math.floor(Math.random() * 16));
    return [...positions];
}

// ─── 두더지 등장 ──────────────────────────────────────────────────────────────
function showMoles() {
    if (!gameActive) return;

    const positions = getRandomPositions();
    const spyIndex  = Math.floor(Math.random() * 3);

    // 전체 리셋
    cachedMoles.forEach(m => {
        m.classList.remove('show', 'spy', 'normal');
        m.dataset.type = '';
    });

    // 등장
    positions.forEach((pos, idx) => {
        const mole   = cachedMoles[pos];
        const textEl = mole.querySelector('.person-text');
        mole.classList.add('show');
        if (idx === spyIndex) {
            mole.classList.add('spy');
            mole.dataset.type = 'spy';
            if (textEl) textEl.textContent = '스파이';
        } else {
            mole.classList.add('normal');
            mole.dataset.type = 'normal';
            if (textEl) textEl.textContent = '사람';
        }
    });

    moleAppearTime = Date.now();
    startElapsedDisplay();
    SFX.moleAppear();

    const timeLimit = getTimeLimit();
    elTimeLimit.textContent = timeLimit;
    turnTimerEndTime = Date.now() + timeLimit * 1000;
    turnTimer = setTimeout(() => {
        if (gameActive) { SFX.gameOver(); endGame('시간 초과! 두더지를 클릭하지 못했습니다.'); }
    }, timeLimit * 1000);
}

// ─── 클릭 처리 ────────────────────────────────────────────────────────────────
function handleClick(index) {
    if (!gameActive || isSlowMo || isPaused) return;

    const mole = cachedMoles[index];
    if (!mole.classList.contains('show')) return;

    clearTimeout(turnTimer);
    stopElapsedDisplay();

    const reactionTime = Date.now() - moleAppearTime;
    const isSpy        = mole.dataset.type === 'spy';
    const cell         = cachedCells[index];

    shootWater(cell);
    cell.style.zIndex = '100';
    isSlowMo = true;

    slowMoTimers = [
        setTimeout(() => {
            document.getAnimations().forEach(a => { a.playbackRate = SLOW_RATE; });
            SFX.setBGMRate(SLOW_RATE);
        }, SLOW_START_MS),

        setTimeout(() => {
            document.getAnimations().forEach(a => { a.playbackRate = 1; });
            SFX.setBGMRate(1);
            isSpy ? SFX.hitSpy() : SFX.hitNormal();
        }, HIT_WALL_MS),

        setTimeout(() => {
            isSlowMo = false;
            cell.style.zIndex = '';
            cachedMoles.forEach(m => {
                m.classList.remove('show', 'spy', 'normal');
                m.dataset.type = '';
            });

            if (isSpy) {
                SFX.gameOver();
                endGame('스파이 두더지를 클릭했습니다!', reactionTime);
                return;
            }

            score++;
            elScore.textContent = score;
            reactionTimes.push(reactionTime);

            const delay = getNextDelay();
            nextTurnTimerEndTime = Date.now() + delay;
            nextTurnTimer = setTimeout(showMoles, delay);
        }, HIT_WALL_MS + 900),
    ];
}

// ─── 게임 시작 ────────────────────────────────────────────────────────────────
function startGame() {
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(a => { a.playbackRate = 1; a.play(); });

    score                = 0;
    reactionTimes        = [];
    gameActive           = true;
    isSlowMo             = false;
    isPaused             = false;
    moleAppearTime       = 0;
    pauseData            = null;
    turnTimerEndTime     = 0;
    nextTurnTimerEndTime = 0;

    elScore.textContent     = '0';
    elTimeLimit.textContent = getTimeLimit();
    updateBestDisplay();

    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');

    initGrid();
    SFX.playBGM();

    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = '⏸ 일시정지';

    const delay = getNextDelay();
    nextTurnTimerEndTime = Date.now() + delay;
    nextTurnTimer = setTimeout(showMoles, delay);
}

// ─── 게임 종료 ────────────────────────────────────────────────────────────────
// elapsedMs: 스파이 클릭 시 반응 시간, 시간초과 시 null
function endGame(reason, elapsedMs = null) {
    const currentTimeLimit = getTimeLimit();
    const actualElapsed    = elapsedMs !== null
        ? elapsedMs
        : (moleAppearTime > 0 ? Math.round(Date.now() - moleAppearTime) : 0);

    gameActive = false;
    isSlowMo   = false;
    isPaused   = false;
    pauseData  = null;
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(a => { a.playbackRate = 1; a.play(); });
    SFX.stopBGM();
    stopElapsedDisplay();
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.add('hidden');

    const avgReaction  = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length) : 0;
    const bestReaction = reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0;

    const isNewRecord = score > 0 && saveBest(score);
    const best        = loadBest();

    document.getElementById('endReason').textContent    = reason;
    document.getElementById('finalScore').textContent   = score;
    document.getElementById('allTimeBest').textContent  = best ? best.score : '-';
    document.getElementById('avgReaction').textContent  = avgReaction;
    document.getElementById('bestReaction').textContent = bestReaction;
    document.getElementById('stageTimeLimit').textContent = currentTimeLimit;
    document.getElementById('elapsedTime').textContent    = actualElapsed;
    document.getElementById('newRecordMsg').classList.toggle('hidden', !isNewRecord);

    updateBestDisplay();
    endScreen.classList.remove('hidden');
}

// ─── 탭 이탈 ─────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive) endGame('게임 화면을 벗어났습니다.');
});

// ─── 일시정지 ─────────────────────────────────────────────────────────────────
function togglePause() {
    if (!gameActive || isSlowMo) return;
    if (cachedMoles.some(m => m.classList.contains('show'))) return; // 두더지 등장 중 불가

    if (!isPaused) {
        isPaused = true;
        const now = Date.now();
        pauseData = {
            turnRemaining: turnTimer     ? turnTimerEndTime     - now : -1,
            nextRemaining: nextTurnTimer ? nextTurnTimerEndTime - now : -1,
            moleElapsed:   moleAppearTime > 0 ? now - moleAppearTime : -1,
        };
        clearTimeout(turnTimer);
        clearTimeout(nextTurnTimer);
        turnTimer = nextTurnTimer = null;
        document.getAnimations().forEach(a => a.pause());
        stopElapsedDisplay();
        pauseOverlay.classList.remove('hidden');
        pauseBtn.textContent = '▶ 계속하기';
    } else {
        isPaused = false;
        document.getAnimations().forEach(a => a.play());
        if (pauseData) {
            if (pauseData.turnRemaining >= 0) {
                const rem = Math.max(0, pauseData.turnRemaining);
                turnTimerEndTime = Date.now() + rem;
                turnTimer = setTimeout(() => {
                    if (gameActive) { SFX.gameOver(); endGame('시간 초과! 두더지를 클릭하지 못했습니다.'); }
                }, rem);
            }
            if (pauseData.nextRemaining >= 0) {
                const rem = Math.max(0, pauseData.nextRemaining);
                nextTurnTimerEndTime = Date.now() + rem;
                nextTurnTimer = setTimeout(showMoles, rem);
            }
            if (pauseData.moleElapsed >= 0) {
                // 일시정지 시간만큼 보정하여 경과 표시 정확도 유지
                moleAppearTime = Date.now() - pauseData.moleElapsed;
                startElapsedDisplay();
            }
            pauseData = null;
        }
        pauseOverlay.classList.add('hidden');
        pauseBtn.textContent = '⏸ 일시정지';
    }
}

// ─── 실시간 경과시간 ──────────────────────────────────────────────────────────
function startElapsedDisplay() {
    stopElapsedDisplay();
    if (!elElapsed) return;
    const tick = () => {
        elElapsed.textContent = moleAppearTime > 0 ? Date.now() - moleAppearTime : 0;
        elapsedRafId = requestAnimationFrame(tick);
    };
    elapsedRafId = requestAnimationFrame(tick);
}

function stopElapsedDisplay() {
    if (elapsedRafId) { cancelAnimationFrame(elapsedRafId); elapsedRafId = null; }
    if (elElapsed) elElapsed.textContent = '-';
}

// ─── 키보드 단축키 (Esc / P) ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (gameActive && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) togglePause();
});

// ─── 물총 이펙트 ──────────────────────────────────────────────────────────────
function shootWater(targetEl) {
    if (!gun || !muzzlePt || isShooting) return;
    isShooting = true;

    const wr = targetEl.getBoundingClientRect();
    const tx = wr.left + wr.width  / 2;
    const ty = wr.top  + wr.height / 2;

    // transform-origin이 총구 → 회전 전에 읽어도 항상 정확한 위치
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
        setTimeout(() => { gun.style.transform = ''; isShooting = false; }, 400);
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

// ─── 초기화 ───────────────────────────────────────────────────────────────────
updateBestDisplay();
initGrid();
scaleBoard();
