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

// ─── 누적 통계 (히든 미션 조건 추적) ─────────────────────────────────────────
const STATS_KEY = 'molemole_stats';

function loadStats() {
    try { return JSON.parse(localStorage.getItem(STATS_KEY)) || {}; }
    catch { return {}; }
}
function saveStats(stats) {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

// ─── 디버그 유틸 ───────────────────────────────────────────────────────────────
function debugResetStats() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STATS_KEY);
    alert('기록이 초기화되었습니다.');
}

function debugResetCollection() {
    localStorage.removeItem(COLLECTION_KEY);
    localStorage.removeItem(EQUIPPED_KEY);
    [...COLLECTION_DATA.normal, ...COLLECTION_DATA.hidden].forEach(i => i.unlocked = false);
    loadEquipped();
    alert('콜렉션이 초기화되었습니다.');
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BOARD_SIZE       = 550;   // --cell:120×4 + gap:10×3 + pad:20×2
const GUN_AREA_H       = 110;   // 물총 영역 높이 (보드 스케일 계산 시 제외)
const TURN_DELAY_MIN   = 800;
const TURN_DELAY_RNG   = 1200;
const DROP_CATS        = new Set(['무기', '모자', '안경', '장신구', '효과']);

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
let score             = 0;
let reactionTimes     = [];
let lastHitIndices    = [];
let moleAppearTime    = 0;
let gameActive        = false;
let turnTimer         = null;
let turnResolved      = false;
let nextTurnTimer     = null;
let isSlowMo          = false;
let slowMoTimers      = [];
let isShooting        = false;
let isPaused          = false;
let pauseData         = null;
let turnTimerEndTime  = 0;
let nextTurnTimerEndTime = 0;
let canDropGifts      = false;

// 캐시된 그리드 (initGrid 후 갱신)
let cachedCells = [];
let cachedMoles = [];
let cachedGifts = [];

// ─── DOM 캐시 ─────────────────────────────────────────────────────────────────
const grid             = document.getElementById('grid');
const elScore          = document.getElementById('score');
const elPrevRtWrap     = document.getElementById('prevRtWrap');
const elPrevRtVal      = document.getElementById('prevRtVal');
const startScreen      = document.getElementById('startScreen');
const endScreen        = document.getElementById('endScreen');
const pauseOverlay     = document.getElementById('pauseOverlay');
const pauseBtn         = document.getElementById('pauseBtn');
const gun              = document.getElementById('gun');
const muzzlePt         = document.getElementById('muzzlePoint');
const boardWrapper     = document.getElementById('boardWrapper');
const gameHeader       = document.getElementById('gameHeader');
const gameContainer    = document.querySelector('.game-container');
const introScreen      = document.getElementById('introScreen');
const collectionScreen = document.getElementById('collectionScreen');
const settingsScreen   = document.getElementById('settingsScreen');

// ─── 페이지 네비게이션 ────────────────────────────────────────────────────────
const PAGE_SCREENS = {
    intro:      introScreen,
    rules:      startScreen,
    collection: collectionScreen,
    settings:   settingsScreen,
    end:        endScreen,
};
let currentPage = 'intro';

function showPage(page) {
    Object.values(PAGE_SCREENS).forEach(el => el && el.classList.add('hidden'));
    if (PAGE_SCREENS[page]) PAGE_SCREENS[page].classList.remove('hidden');
    currentPage = page;
    if (page === 'collection') renderCollection();
}

function navigateTo(page) {
    if (page === 'intro') {
        showPage('intro');
        history.replaceState({ page: 'intro' }, '');
    } else {
        history.pushState({ page }, '');
        showPage(page);
    }
}

window.addEventListener('popstate', (e) => {
    const page = e.state?.page;
    if (!page) return;

    if (gameActive) {
        endGame('게임을 나갔습니다.');
        history.replaceState({ page: 'intro' }, '');
    }
    showPage(page);
});

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const getNextDelay = () => TURN_DELAY_MIN + Math.random() * TURN_DELAY_RNG;

// ─── 보드 스케일 ──────────────────────────────────────────────────────────────
let boardScale = 1;

function scaleBoard() {
    if (!gameHeader || !boardWrapper || !gameContainer) return;
    const headerH = gameHeader.getBoundingClientRect().height;
    const availW  = window.innerWidth  - 48;
    const availH  = window.innerHeight - headerH - GUN_AREA_H - 14;
    const scale   = Math.min(availW / BOARD_SIZE, availH / BOARD_SIZE);
    boardScale    = scale;

    gameContainer.style.transform = `scale(${scale})`;
    boardWrapper.style.height = `${BOARD_SIZE * scale}px`;

    const boardH = BOARD_SIZE * scale;
    const freeH  = availH - boardH;
    gameHeader.style.marginTop = `${Math.max(0, freeH * 0.65)}px`;
}

window.addEventListener('resize', scaleBoard);

// ─── 그리드 초기화 ────────────────────────────────────────────────────────────
function initGrid() {
    grid.innerHTML = '';
    cachedCells = [];
    cachedMoles = [];
    cachedGifts = [];

    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        const mole = document.createElement('div');
        mole.className = 'mole';
        mole.innerHTML = `
          <div class="mole-char">
            <div class="spy-glasses"></div>
            <div class="mole-eyes"></div>
            <div class="mole-snout">
              <div class="mole-nose"></div>
              <div class="mole-mouse"></div>
            </div>
            <div class="mole-item"><div></div></div>
          </div>`;

        const gift = document.createElement('div');
        gift.className   = 'gift';
        gift.textContent = '🎁';

        const clip = document.createElement('div');
        clip.className = 'mole-clip';
        clip.appendChild(gift);
        clip.appendChild(mole);

        const hole = document.createElement('div');
        hole.className = 'mole-hole';
        hole.appendChild(clip);

        cell.appendChild(hole);
        cell.addEventListener('pointerdown', () => handleClick(i));
        grid.appendChild(cell);

        cachedCells.push(cell);
        cachedMoles.push(mole);
        cachedGifts.push(gift);
    }
}

// ─── 난이도 ───────────────────────────────────────────────────────────────────
function getTimeLimit() {
    if (score <= 15) return parseFloat((2.0 - score * 0.1).toFixed(2));
    return Math.max(0.1, parseFloat((0.5 - (score - 15) * 0.01).toFixed(3)));
}

// ─── 두더지 구성 ──────────────────────────────────────────────────────────────
function getMoleConfig() {
    if (score >= 40) return { total: 5, spies: 4 };
    if (score >= 30) return { total: 5, spies: 3 };
    if (score >= 20) return { total: 4, spies: 3 };
    if (score >= 10) return { total: 4, spies: 2 };
    return { total: 3, spies: 1 };
}

// ─── 랜덤 위치 선택 ───────────────────────────────────────────────────────────
function getRandomPositions(count) {
    const positions = new Set();
    while (positions.size < count) positions.add(Math.floor(Math.random() * 16));
    return [...positions];
}

// ─── 두더지 등장 ──────────────────────────────────────────────────────────────
function showMoles() {
    if (!gameActive) return;
    turnResolved = false;

    const { total, spies } = getMoleConfig();
    const positions = getRandomPositions(total);
    const spySet = new Set(
        [...positions].sort(() => Math.random() - 0.5).slice(0, spies)
    );

    cachedMoles.forEach(m => {
        m.classList.remove('show', 'spy', 'normal');
        m.dataset.type = '';
    });
    cachedGifts.forEach(g => {
        g.classList.remove('show');
        g.style.pointerEvents = '';
    });

    positions.forEach((pos) => {
        const mole = cachedMoles[pos];
        mole.classList.add('show');
        if (spySet.has(pos)) {
            mole.classList.add('spy');
            mole.dataset.type = 'spy';
        } else {
            mole.classList.add('normal');
            mole.dataset.type = 'normal';
            if (canDropGifts) {
                cachedGifts[pos].textContent = '🎁';
                cachedGifts[pos].classList.add('show');
            }
        }
    });

    moleAppearTime = Date.now();
    pauseBtn.classList.add('pause-btn--blocked');
    SFX.moleAppear();

    const timeLimit = getTimeLimit();
    turnTimerEndTime = Date.now() + timeLimit * 1000;
    turnTimer = setTimeout(() => {
        if (gameActive && !turnResolved) { SFX.gameOver(); endGame('시간 초과! 두더지를 클릭하지 못했습니다.'); }
    }, timeLimit * 1000);
}

// ─── 클릭 처리 ────────────────────────────────────────────────────────────────
function handleClick(index) {
    if (!gameActive || isSlowMo || isPaused) return;

    const mole = cachedMoles[index];
    if (!mole.classList.contains('show')) return;

    turnResolved = true;
    clearTimeout(turnTimer);

    const reactionTime = Date.now() - moleAppearTime;
    const isSpy        = mole.dataset.type === 'spy';
    const cell         = cachedCells[index];

    cell.style.zIndex = '100';
    isSlowMo = true;

    const slowDown = () => { document.getAnimations().forEach(a => { a.playbackRate = SLOW_RATE; }); SFX.setBGMRate(SLOW_RATE); };
    const slowUp   = () => { document.getAnimations().forEach(a => { a.playbackRate = 1; }); SFX.setBGMRate(1); };
    const onHit    = () => { isSpy ? SFX.hitSpy() : SFX.hitNormal(); };

    const setWeaponTimers = (effectFn, slowStartMs, hitMs, resolveMs) => {
        effectFn();
        slowMoTimers = [
            setTimeout(slowDown, slowStartMs),
            setTimeout(() => { slowUp(); onHit(); }, hitMs),
            setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), resolveMs),
        ];
    };

    switch (equippedWeapon) {
        case 'gun':        setWeaponTimers(() => shootWater(cell),                SLOW_START_MS,       HIT_WALL_MS,          HIT_WALL_MS + 900);   break;
        case 'lightning':  setWeaponTimers(() => strikeLightning(cell),           LIGHTNING_SLOWSTART_MS, LIGHTNING_HIT_MS,  LIGHTNING_RESOLVE_MS); break;
        case 'bomb':
        case 'balloon':    setWeaponTimers(() => throwProjectile(cell, index, equippedWeapon), THROW_SLOWSTART_MS, THROW_HIT_MS, THROW_RESOLVE_MS); break;
        case 'spotlight':  setWeaponTimers(() => strikeSpotlight(cell),           SPOT_SLOWSTART_MS,   SPOT_HIT_MS,          SPOT_RESOLVE_MS);      break;
        case 'ufo':        setWeaponTimers(() => strikeUFO(cell, index),          UFO_SLOWSTART_MS,    UFO_HIT_MS,           UFO_RESOLVE_MS);       break;
        case 'target':     setWeaponTimers(() => strikeTarget(cell, index),       TARGET_SLOWSTART_MS, TARGET_HIT_MS,        TARGET_RESOLVE_MS);    break;
        case 'claw':       setWeaponTimers(() => strikeClaw(cell, index),         CLAW_SLOWSTART_MS,   CLAW_HIT_MS,          CLAW_RESOLVE_MS);      break;
        default:           // hammer (+ 미구현 fallback)
            swingHammer(cell, index);
            slowMoTimers = [
                setTimeout(onHit, 150),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), 500),
            ];
    }
}

// ─── 히트 결과 처리 (무기 공통) ───────────────────────────────────────────────
function resolveHit(index, isSpy, reactionTime, cell) {
    isSlowMo = false;
    pauseBtn.classList.remove('pause-btn--blocked');
    cell.style.zIndex = '';
    cachedMoles.forEach(m => {
        m.classList.remove('show', 'spy', 'normal');
        m.dataset.type = '';
    });
    cachedGifts.forEach((g, idx) => {
        if (idx !== index) {
            g.classList.remove('show');
            g.style.pointerEvents = '';
        }
    });

    if (isSpy) {
        cachedGifts[index].classList.remove('show');
        checkHiddenConditions(reactionTime, index, true);
        SFX.gameOver();
        endGame('스파이 두더지를 클릭했습니다!', reactionTime);
        return;
    }

    score++;
    elScore.textContent = score;
    reactionTimes.push(reactionTime);

    const stats = loadStats();
    stats.totalCaught = (stats.totalCaught || 0) + 1;
    saveStats(stats);

    lastHitIndices.push(index);
    if (lastHitIndices.length > 3) lastHitIndices.shift();

    checkHiddenConditions(reactionTime, index, false, stats);
    if (elPrevRtWrap && elPrevRtVal) {
        elPrevRtVal.textContent = reactionTime;
        elPrevRtWrap.classList.remove('hidden');
    }

    const startNext = () => {
        const delay = getNextDelay();
        nextTurnTimerEndTime = Date.now() + delay;
        nextTurnTimer = setTimeout(showMoles, delay);
    };

    const giftPool = canDropGifts
        ? COLLECTION_DATA.normal.filter(i => !i.unlocked && DROP_CATS.has(i.cat))
        : [];

    if (giftPool.length > 0) {
        const item = giftPool[Math.floor(Math.random() * giftPool.length)];
        showGift(index, item, startNext);
    } else {
        cachedGifts[index].classList.remove('show');
        startNext();
    }
}

// ─── 선물 ─────────────────────────────────────────────────────────────────────
function showGift(index, item, onCollect) {
    const giftEl = cachedGifts[index];
    giftEl.style.pointerEvents = 'auto';

    function onClick(e) {
        e.stopPropagation();
        giftEl.classList.remove('show');
        giftEl.style.pointerEvents = '';
        giftEl.removeEventListener('click', onClick);
        item.unlocked = true;
        saveCollection();
        showGiftPopup(item, onCollect);
    }
    giftEl.addEventListener('click', onClick);
}

function showGiftPopup(item, onCollect) {
    const popup   = document.getElementById('giftPopup');
    document.getElementById('giftEmoji').textContent = item.emoji;
    document.getElementById('giftName').textContent  = item.name;
    popup.classList.remove('hidden');

    document.getElementById('giftClose').onclick = () => {
        popup.classList.add('hidden');
        onCollect();
    };
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
    lastHitIndices       = [];
    gameActive           = true;
    isSlowMo             = false;
    isPaused             = false;
    moleAppearTime       = 0;
    pauseData            = null;
    turnTimerEndTime     = 0;
    nextTurnTimerEndTime = 0;
    turnResolved         = false;
    canDropGifts         = true; // 테스트: 항상 드롭 허용

    elScore.textContent = '0';
    if (elPrevRtWrap) elPrevRtWrap.classList.add('hidden');

    Object.values(PAGE_SCREENS).forEach(el => el && el.classList.add('hidden'));
    history.pushState({ page: 'game' }, '');
    currentPage = 'game';

    initGrid();
    applyEquipped();
    SFX.playBGM();

    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = '⏸ 일시정지';

    const delay = getNextDelay();
    nextTurnTimerEndTime = Date.now() + delay;
    nextTurnTimer = setTimeout(showMoles, delay);
}

// ─── 공통 게임 정리 ───────────────────────────────────────────────────────────
function cleanupGame() {
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
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.add('hidden');
}

// ─── 게임 종료 ────────────────────────────────────────────────────────────────
function endGame(reason, elapsedMs = null) {
    const currentTimeLimit = getTimeLimit();
    const actualElapsed    = elapsedMs !== null
        ? elapsedMs
        : (moleAppearTime > 0 ? Math.round(Date.now() - moleAppearTime) : 0);

    cleanupGame();

    const avgReaction  = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length) : 0;
    const bestReaction = reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0;

    const isNewRecord = score > 0 && saveBest(score);
    const best        = loadBest();

    const stats = loadStats();
    if (bestReaction > 0 && (!stats.bestReactionEver || bestReaction < stats.bestReactionEver)) {
        stats.bestReactionEver = bestReaction;
        saveStats(stats);
    }

    document.getElementById('endReason').textContent    = reason;
    document.getElementById('finalScore').textContent   = score;
    document.getElementById('allTimeBest').textContent  = best ? best.score : '-';
    document.getElementById('avgReaction').textContent  = avgReaction;
    document.getElementById('bestReaction').textContent = bestReaction || '-';
    document.getElementById('allTimeBestReaction').textContent = stats.bestReactionEver || '-';
    document.getElementById('stageTimeLimit').textContent = currentTimeLimit;
    document.getElementById('elapsedTime').textContent    = actualElapsed;
    document.getElementById('newRecordMsg').classList.toggle('hidden', !isNewRecord);

    checkHiddenConditions();
    endScreen.classList.remove('hidden');
}

// ─── 앱 전환 / 탭 이탈 → 자동 일시정지 ──────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !gameActive || isPaused || isSlowMo) return;
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
    pauseOverlay.classList.remove('hidden');
    pauseBtn.textContent = '▶ 계속하기';
});

// ─── 게임 중단 ────────────────────────────────────────────────────────────────
function quitGame() {
    cleanupGame();
    cachedMoles.forEach(m => m.classList.remove('show'));
    if (score > 0) saveBest(score);
    navigateTo('intro');
}

// ─── 일시정지 ─────────────────────────────────────────────────────────────────
function togglePause() {
    if (!gameActive || isSlowMo) return;
    if (cachedMoles.some(m => m.classList.contains('show'))) return;

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
                moleAppearTime = Date.now() - pauseData.moleElapsed;
            }
            pauseData = null;
        }
        pauseOverlay.classList.add('hidden');
        pauseBtn.textContent = '⏸ 일시정지';
    }
}

// ─── 키보드 단축키 (Esc / P) ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (gameActive && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) togglePause();
});

// ─── 초기화 ───────────────────────────────────────────────────────────────────
loadCollection();
loadEquipped();
history.replaceState({ page: 'intro' }, '');
showPage('intro');
initGrid();
scaleBoard();
