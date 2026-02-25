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

// DOM 요소
const grid = document.getElementById('grid');
const scoreDisplay = document.getElementById('score');
const timeLimitDisplay = document.getElementById('timeLimit');
const startScreen = document.getElementById('startScreen');
const endScreen = document.getElementById('endScreen');

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
            <div class="mole-body">
                <div class="mole-face">
                    <div class="spy-glasses">
                        <div class="glass left"></div>
                        <div class="glass right"></div>
                        <div class="glass-bridge"></div>
                    </div>
                    <div class="mole-eye left"></div>
                    <div class="mole-eye right"></div>
                    <div class="mole-nose"></div>
                </div>
            </div>
        `;

        const hammer = document.createElement('div');
        hammer.className = 'hammer';
        hammer.innerHTML = '<div class="hammer-head"></div><div class="hammer-handle"></div>';

        const burst = document.createElement('div');
        burst.className = 'hit-burst';
        for (let r = 0; r < 8; r++) {
            const ray = document.createElement('div');
            ray.className = 'burst-ray';
            ray.style.setProperty('--i', r);
            burst.appendChild(ray);
        }

        const stars = document.createElement('div');
        stars.className = 'spin-stars';
        for (let s = 0; s < 3; s++) {
            const orbit = document.createElement('div');
            orbit.className = 'star-orbit';
            orbit.style.setProperty('--s', s);
            orbit.innerHTML = '<span class="star-icon">★</span>';
            stars.appendChild(orbit);
        }

        const moleHole = document.createElement('div');
        moleHole.className = 'mole-hole';
        moleHole.appendChild(mole);

        cell.appendChild(moleHole);
        cell.appendChild(hammer);
        cell.appendChild(burst);
        cell.appendChild(stars);
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

        if (idx === spyIndex) {
            mole.classList.add('spy');
            mole.dataset.type = 'spy';
        } else {
            mole.classList.add('normal');
            mole.dataset.type = 'normal';
        }
    });

    moleAppearTime = Date.now();

    SFX.moleAppear();

    // 제한 시간 타이머
    const timeLimit = getTimeLimit();
    timeLimitDisplay.textContent = timeLimit;

    turnTimer = setTimeout(() => {
        if (gameActive) {
            SFX.gameOver();
            endGame('시간 초과! 두더지를 클릭하지 못했습니다.');
        }
    }, timeLimit * 1000);
}

// 클릭 처리
function handleClick(index) {
    if (!gameActive || isSlowMo) return;

    const cell = document.querySelectorAll('.cell')[index];
    const mole = cell.querySelector('.mole');

    if (!mole.classList.contains('show')) return;

    clearTimeout(turnTimer);

    const reactionTime = Date.now() - moleAppearTime;
    const isSpy = mole.dataset.type === 'spy';

    // 별/물음표 아이콘 미리 설정
    const stars = cell.querySelector('.spin-stars');
    stars.querySelectorAll('.star-icon').forEach(icon => {
        icon.textContent = isSpy ? '?' : '★';
    });

    // 망치 애니메이션 시작 (정상 속도)
    const hammer = cell.querySelector('.hammer');
    hammer.classList.remove('hit');
    void hammer.offsetWidth;
    hammer.classList.add('hit');

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

        // 히트 지점: 정상 복귀 + 이펙트 발동
        setTimeout(() => {
            document.getAnimations().forEach(anim => { anim.playbackRate = 1; });
            SFX.setBGMRate(1);
            isSpy ? SFX.hitSpy() : SFX.hitNormal();

            const burst = cell.querySelector('.hit-burst');
            burst.classList.remove('pop');
            void burst.offsetWidth;
            burst.classList.add('pop');

            stars.classList.remove('active');
            void stars.offsetWidth;
            stars.classList.add('active');
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
    document.getAnimations().forEach(anim => { anim.playbackRate = 1; });

    score = 0;
    reactionTimes = [];
    gameActive = true;
    isSlowMo = false;

    scoreDisplay.textContent = '0';
    timeLimitDisplay.textContent = getTimeLimit();
    updateBestDisplay();

    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');

    initGrid();
    SFX.playBGM();

    // 첫 두더지 등장 (2~5초 후)
    const firstDelay = 2000 + Math.random() * 3000;
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
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(anim => { anim.playbackRate = 1; });
    SFX.stopBGM();

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

// 초기화
updateBestDisplay();
initGrid();
