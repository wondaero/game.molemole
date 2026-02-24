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

        cell.appendChild(mole);
        cell.addEventListener('click', () => handleClick(i));
        grid.appendChild(cell);
    }
}

// 난이도에 따른 제한 시간
function getTimeLimit() {
    if (score >= 20) return 0.5;
    if (score >= 10) return 0.65;
    return 0.8;
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