// ─── 사운드 시스템 (구멍 - 파일 연결 시 구현) ────────────────────────────────
const SFX = {
    // TODO: 배경음악 (HTMLAudioElement 또는 Web Audio API AudioBuffer)
    // bgm: new Audio('sounds/bgm.mp3'),

    // 배경음 재생 (게임 시작 시 호출)
    playBGM() { /* TODO */ },

    // 배경음 정지 (게임 종료 시 호출)
    stopBGM() { /* TODO */ },

    // 슬로우모션 시 배경음 속도 조절 (rate: 0~1 = 슬로우, 1 = 정상)
    setBGMRate(_rate) { /* TODO: bgm.playbackRate = _rate */ },

    // 두더지 등장음
    moleAppear() { /* TODO */ },

    // 일반 두더지 타격음
    hitNormal() { /* TODO */ },

    // 스파이 두더지 타격음
    hitSpy() { /* TODO */ },

    // 시간 초과 / 게임 오버 음
    gameOver() { /* TODO */ },
};

// ─── 최고 기록 (localStorage) ─────────────────────────────────────────────────
const STORAGE_KEY = 'molemole_best';

function loadBest() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || null;
    } catch { return null; }
}

function saveBest(score) {
    const prev = loadBest();
    if (!prev || score > prev.score) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ score }));
        return true; // 신기록
    }
    return false;
}

function updateBestDisplay() {
    const best = loadBest();
    const el = document.getElementById('bestScore');
    if (el) el.textContent = best ? best.score : '-';
}

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
let score = 0;
let reactionTimes = [];
let moleAppearTime = 0;
let gameActive = false;
let turnTimer = null;
let nextTurnTimer = null;
let isSlowMo = false;
let slowMoTimers = [];
let isShooting = false;
let isPaused = false;
let elapsedRafId = null;
let pauseData = null;
let turnTimerEndTime = 0;
let nextTurnTimerEndTime = 0;

// DOM 요소
const grid = document.getElementById('grid');
const scoreDisplay = document.getElementById('score');
const timeLimitDisplay = document.getElementById('timeLimit');
const startScreen = document.getElementById('startScreen');
const endScreen = document.getElementById('endScreen');

// ─── 보드 스케일 ────────────────────────────────────────────────────────────────
// 보드 고정 크기: --cell:120 × 4 + gap:10 × 3 + pad:20 × 2 = 550px
const BOARD_SIZE = 550;
// 물총 영역 높이: bottom 오프셋(24) + 총 높이(58) + 여유(20)
const GUN_AREA_H = 110;

function scaleBoard() {
    const header    = document.getElementById('gameHeader');
    const wrapper   = document.getElementById('boardWrapper');
    const container = document.querySelector('.game-container');
    if (!header || !wrapper || !container) return;

    const headerH = header.getBoundingClientRect().height;
    const availW  = window.innerWidth  - 32; // 좌우 16px 여백
    const availH  = document.body.clientHeight - headerH - GUN_AREA_H;

    const scale = Math.min(availW / BOARD_SIZE, availH / BOARD_SIZE);

    container.style.transform = `scale(${scale})`;
    wrapper.style.height      = `${BOARD_SIZE * scale}px`;
}

window.addEventListener('resize', scaleBoard);

// 그리드 초기화
function initGrid() {
    grid.innerHTML = '';
    for (let i = 0; i < 16; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;

        const mole = document.createElement('div');
        mole.className = 'mole';
        mole.innerHTML = `
            <div class="curtain curtain-left"></div>
            <div class="curtain curtain-right"></div>
            <div class="person-content">
                <span class="person-text"></span>
            </div>
        `;

        const moleHole = document.createElement('div');
        moleHole.className = 'mole-hole';
        moleHole.appendChild(mole);

        cell.appendChild(moleHole);
        cell.addEventListener('click', () => handleClick(i));
        grid.appendChild(cell);
    }
}

// 난이도에 따른 제한 시간
function getTimeLimit() {
    if (score >= 31) return Math.max(0.1, parseFloat((0.4 - (score - 30) * 0.001).toFixed(3)));
    if (score >= 21) return 0.4;
    if (score >= 16) return 0.5;
    if (score >= 11) return 0.8;
    if (score >= 6) return 1.0;
    return 1.5;
}

// 랜덤 위치 3개 선택
function getRandomPositions() {
    const positions = [];
    while (positions.length < 3) {
        const pos = Math.floor(Math.random() * 16);
        if (!positions.includes(pos)) {
            positions.push(pos);
        }
    }
    return positions;
}

// 두더지 등장
function showMoles() {
    if (!gameActive) return;

    const positions = getRandomPositions();
    const spyIndex = Math.floor(Math.random() * 3); // 스파이 위치

    const cells = document.querySelectorAll('.cell');
    const moles = document.querySelectorAll('.mole');

    // 모든 두더지 숨기기
    moles.forEach(mole => {
        mole.classList.remove('show', 'spy', 'normal');
        mole.dataset.type = '';
    });

    // 선택된 위치에 두더지 표시
    positions.forEach((pos, idx) => {
        const mole = cells[pos].querySelector('.mole');
        mole.classList.add('show');

        const textEl = mole.querySelector('.person-text');
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

    // 제한 시간 타이머
    const timeLimit = getTimeLimit();
    timeLimitDisplay.textContent = timeLimit;

    turnTimerEndTime = Date.now() + timeLimit * 1000;
    turnTimer = setTimeout(() => {
        if (gameActive) {
            SFX.gameOver();
            endGame('시간 초과! 두더지를 클릭하지 못했습니다.');
        }
    }, timeLimit * 1000);
}

// 클릭 처리
function handleClick(index) {
    if (!gameActive || isSlowMo || isPaused) return;

    const cell = document.querySelectorAll('.cell')[index];
    const mole = cell.querySelector('.mole');

    if (!mole.classList.contains('show')) return;

    clearTimeout(turnTimer);
    stopElapsedDisplay();

    const reactionTime = Date.now() - moleAppearTime;
    const isSpy = mole.dataset.type === 'spy';

    // 물총 발사
    shootWater(cell);

    // 클릭된 셀을 최상위로 (인접 셀에 가려지지 않게)
    cell.style.zIndex = '100';
    isSlowMo = true;

    // 타이밍: 망치 총 0.35s, 히트 = 40%(140ms), 슬로우 시작 = 1/3(117ms)
    const SLOW_RATE = 0.1;
    const SLOW_START = 117;                                // 정상속도로 1/3 지점 (ms)
    const REMAINING_TO_HIT = 23;                          // 1/3→40% 잔여 (ms, 정상속도)
    const HIT_WALL = SLOW_START + Math.ceil(REMAINING_TO_HIT / SLOW_RATE); // ~347ms

    slowMoTimers = [
        // 1/3 지점: 갑자기 슬로우
        setTimeout(() => {
            document.getAnimations().forEach(anim => { anim.playbackRate = SLOW_RATE; });
            SFX.setBGMRate(SLOW_RATE);
        }, SLOW_START),

        // 히트 지점: 정상 복귀
        setTimeout(() => {
            document.getAnimations().forEach(anim => { anim.playbackRate = 1; });
            SFX.setBGMRate(1);
            isSpy ? SFX.hitSpy() : SFX.hitNormal();
        }, HIT_WALL),

        // 이펙트 완료 후 정리 (stars: 0.65s, burst: 0.3s)
        setTimeout(() => {
            isSlowMo = false;
            cell.style.zIndex = '';

            document.querySelectorAll('.mole').forEach(m => {
                m.classList.remove('show', 'spy', 'normal');
                m.dataset.type = '';
            });

            if (isSpy) {
                SFX.gameOver();
                endGame('스파이 두더지를 클릭했습니다!', reactionTime);
                return;
            }

            score++;
            scoreDisplay.textContent = score;
            reactionTimes.push(reactionTime);

            const nextDelay = 2000 + Math.random() * 3000;
            nextTurnTimerEndTime = Date.now() + nextDelay;
            nextTurnTimer = setTimeout(showMoles, nextDelay);
        }, HIT_WALL + 900),
    ];
}

// 게임 시작
function startGame() {
    // 혹시 남아있는 타이머 전부 정리
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(anim => { anim.playbackRate = 1; anim.play(); });

    score = 0;
    reactionTimes = [];
    gameActive = true;
    isSlowMo = false;
    isPaused = false;
    pauseData = null;
    turnTimerEndTime = 0;
    nextTurnTimerEndTime = 0;

    scoreDisplay.textContent = '0';
    timeLimitDisplay.textContent = getTimeLimit();
    updateBestDisplay();

    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');

    initGrid();
    SFX.playBGM();

    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) { pauseBtn.classList.remove('hidden'); pauseBtn.textContent = '⏸ 일시정지'; }

    // 첫 두더지 등장 (2~5초 후)
    const firstDelay = 2000 + Math.random() * 3000;
    nextTurnTimerEndTime = Date.now() + firstDelay;
    nextTurnTimer = setTimeout(showMoles, firstDelay);
}

// 게임 종료
// elapsedMs: 스파이 클릭 시 실제 반응 시간 전달, 시간초과 시 null(자동계산)
function endGame(reason, elapsedMs = null) {
    const currentTimeLimit = getTimeLimit();
    const actualElapsed = elapsedMs !== null
        ? elapsedMs
        : (moleAppearTime > 0 ? Math.round(Date.now() - moleAppearTime) : 0);

    gameActive = false;
    isSlowMo = false;
    isPaused = false;
    pauseData = null;
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(anim => { anim.playbackRate = 1; anim.play(); });
    SFX.stopBGM();
    stopElapsedDisplay();
    document.getElementById('pauseOverlay').classList.add('hidden');
    document.getElementById('pauseBtn').classList.add('hidden');

    // 통계 계산
    const avgReaction = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
        : 0;
    const bestReaction = reactionTimes.length > 0
        ? Math.min(...reactionTimes)
        : 0;

    // 최고기록 처리
    const isNewRecord = score > 0 && saveBest(score);
    const best = loadBest();

    document.getElementById('endReason').textContent = reason;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('allTimeBest').textContent = best ? best.score : '-';
    document.getElementById('avgReaction').textContent = avgReaction;
    document.getElementById('bestReaction').textContent = bestReaction;

    const stageLimitEl = document.getElementById('stageTimeLimit');
    const elapsedEl    = document.getElementById('elapsedTime');
    if (stageLimitEl) stageLimitEl.textContent = currentTimeLimit;
    if (elapsedEl)    elapsedEl.textContent    = actualElapsed;

    const newRecordMsg = document.getElementById('newRecordMsg');
    if (isNewRecord) {
        newRecordMsg.classList.remove('hidden');
    } else {
        newRecordMsg.classList.add('hidden');
    }

    updateBestDisplay();
    endScreen.classList.remove('hidden');
}

// 탭 이탈 시 게임 종료
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive) {
        endGame('게임 화면을 벗어났습니다.');
    }
});

// 일시정지
function togglePause() {
    if (!gameActive || isSlowMo) return;
    if (document.querySelector('.mole.show')) return; // 커튼 열린 동안 일시정지 불가

    const overlay = document.getElementById('pauseOverlay');
    const btn     = document.getElementById('pauseBtn');

    if (!isPaused) {
        isPaused = true;
        const now = Date.now();
        pauseData = {
            turnRemaining: turnTimer     ? turnTimerEndTime     - now : -1,
            nextRemaining: nextTurnTimer ? nextTurnTimerEndTime - now : -1,
        };
        clearTimeout(turnTimer);
        clearTimeout(nextTurnTimer);
        turnTimer     = null;
        nextTurnTimer = null;
        document.getAnimations().forEach(anim => anim.pause());
        overlay.classList.remove('hidden');
        if (btn) btn.textContent = '▶ 계속';
    } else {
        isPaused = false;
        document.getAnimations().forEach(anim => anim.play());
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
            pauseData = null;
        }
        overlay.classList.add('hidden');
        if (btn) btn.textContent = '⏸ 일시정지';
    }
}

// ─── 실시간 경과시간 표시 ─────────────────────────────────────────────────────
function startElapsedDisplay() {
    stopElapsedDisplay();
    const el = document.getElementById('elapsedDisplay');
    if (!el) return;
    function tick() {
        el.textContent = moleAppearTime > 0 ? Date.now() - moleAppearTime : 0;
        elapsedRafId = requestAnimationFrame(tick);
    }
    elapsedRafId = requestAnimationFrame(tick);
}

function stopElapsedDisplay() {
    if (elapsedRafId) { cancelAnimationFrame(elapsedRafId); elapsedRafId = null; }
    const el = document.getElementById('elapsedDisplay');
    if (el) el.textContent = '-';
}

// 키보드 단축키 (Esc / P)
document.addEventListener('keydown', (e) => {
    if (gameActive && (e.key === 'Escape' || e.key === 'p' || e.key === 'P')) {
        togglePause();
    }
});

// ─── 물총 이펙트 ─────────────────────────────────────────────────────────────
function shootWater(targetEl) {
    const gun      = document.getElementById('gun');
    const muzzlePt = document.getElementById('muzzlePoint');
    if (!gun || !muzzlePt || isShooting) return;
    isShooting = true;

    const wr = targetEl.getBoundingClientRect();
    const tx = wr.left + wr.width  / 2;
    const ty = wr.top  + wr.height / 2;

    // transform-origin이 총구이므로 회전 전에 읽으면 항상 정확한 위치
    const mr = muzzlePt.getBoundingClientRect();
    const mx = mr.left + mr.width  / 2;
    const my = mr.top  + mr.height / 2;

    const gunAng = Math.atan2(ty - my, tx - mx) * (180 / Math.PI);
    gun.style.transform = `rotate(${gunAng}deg)`;

    const dist      = Math.hypot(tx - mx, ty - my);
    const streamAng = Math.atan2(tx - mx, -(ty - my)) * (180 / Math.PI);

    const stream = document.createElement('div');
    stream.className = 'water-stream';
    const bott = window.innerHeight - my;
    Object.assign(stream.style, {
        left:       `${mx - 4}px`,
        bottom:     `${bott}px`,
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
        setTimeout(() => {
            gun.style.transform = '';
            isShooting = false;
        }, 400);
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
            background:    `rgba(${20 + Math.random()*40 | 0}, ${160 + Math.random()*70 | 0}, 255, 0.88)`,
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
            { transform: 'translate(0,0) scale(1)', opacity: 1 },
            { transform: `translate(${Math.cos(a)*r}px, ${Math.sin(a)*r}px) scale(0)`, opacity: 0 }
        ], {
            duration: 280 + Math.random() * 220,
            easing:   'ease-out',
            fill:     'forwards',
        }).onfinish = () => drop.remove();
    }
}

// 초기화
updateBestDisplay();
initGrid();
scaleBoard();
