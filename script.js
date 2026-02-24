// 게임 상태
let score = 0;
let reactionTimes = [];
let moleAppearTime = 0;
let gameActive = false;
let turnTimer = null;
let nextTurnTimer = null;

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

        cell.appendChild(mole);
        cell.appendChild(hammer);
        cell.appendChild(burst);
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

    // 제한 시간 타이머
    const timeLimit = getTimeLimit();
    timeLimitDisplay.textContent = timeLimit;

    turnTimer = setTimeout(() => {
        if (gameActive) {
            endGame('시간 초과! 두더지를 클릭하지 못했습니다.');
        }
    }, timeLimit * 1000);
}

// 클릭 처리
function handleClick(index) {
    if (!gameActive) return;

    const cell = document.querySelectorAll('.cell')[index];
    const mole = cell.querySelector('.mole');

    if (!mole.classList.contains('show')) return;

    // 망치 애니메이션
    const hammer = cell.querySelector('.hammer');
    hammer.classList.remove('hit');
    void hammer.offsetWidth;
    hammer.classList.add('hit');

    // 히트 이펙트
    const burst = cell.querySelector('.hit-burst');
    burst.classList.remove('pop');
    void burst.offsetWidth;
    burst.classList.add('pop');

    clearTimeout(turnTimer);

    const reactionTime = Date.now() - moleAppearTime;

    if (mole.dataset.type === 'spy') {
        endGame('스파이 두더지를 클릭했습니다!');
        return;
    }

    if (mole.dataset.type === 'normal') {
        // 성공
        score++;
        scoreDisplay.textContent = score;
        reactionTimes.push(reactionTime);

        // 모든 두더지 숨기기
        document.querySelectorAll('.mole').forEach(m => {
            m.classList.remove('show', 'spy', 'normal');
            m.dataset.type = '';
        });

        // 다음 턴 (2~5초 후)
        const nextDelay = 2000 + Math.random() * 3000;
        nextTurnTimer = setTimeout(showMoles, nextDelay);
    }
}

// 게임 시작
function startGame() {
    score = 0;
    reactionTimes = [];
    gameActive = true;

    scoreDisplay.textContent = '0';
    timeLimitDisplay.textContent = '0.8';

    startScreen.classList.add('hidden');
    endScreen.classList.add('hidden');

    initGrid();

    // 첫 두더지 등장 (2~5초 후)
    const firstDelay = 2000 + Math.random() * 3000;
    nextTurnTimer = setTimeout(showMoles, firstDelay);
}

// 게임 종료
function endGame(reason) {
    gameActive = false;
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);

    // 통계 계산
    const avgReaction = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
        : 0;
    const bestReaction = reactionTimes.length > 0
        ? Math.min(...reactionTimes)
        : 0;

    document.getElementById('endReason').textContent = reason;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('avgReaction').textContent = avgReaction;
    document.getElementById('bestReaction').textContent = bestReaction;

    endScreen.classList.remove('hidden');
}

// 초기화
initGrid();