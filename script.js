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


// ─── 상수 ────────────────────────────────────────────────────────────────────
const BOARD_SIZE       = 550;   // --cell:120×4 + gap:10×3 + pad:20×2
const GUN_AREA_H       = 110;   // 물총 영역 높이 (보드 스케일 계산 시 제외)
const BOARD_TILT_DEG   = 18;    // rotateX 기울기 (perspective 효과)
const TURN_DELAY_MIN   = 2000;
const TURN_DELAY_RNG   = 3000;
const SLOW_RATE        = 0.1;
const SLOW_START_MS    = 117;   // 정상속도 기준 히트 1/3 지점
const REMAINING_HIT_MS = 23;    // 1/3 → 40% 히트 잔여 (정상속도 ms)
const HIT_WALL_MS      = SLOW_START_MS + Math.ceil(REMAINING_HIT_MS / SLOW_RATE); // ~347ms

// ── 번개 타이밍 (이펙트 구현 시 조정) ──────────────────────────────────────
const LIGHTNING_SLOWSTART_MS = 80;
const LIGHTNING_HIT_MS       = 220;  // 슬로우 끝 = 히트 판정
const LIGHTNING_RESOLVE_MS   = LIGHTNING_HIT_MS + 400;

// ── 투척 타이밍: 폭탄/물풍선 (이펙트 구현 시 조정) ─────────────────────────
const THROW_SLOWSTART_MS  = 160;
const THROW_HIT_MS        = 480;  // 착탄 판정
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

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
let score             = 0;
let reactionTimes     = [];
let moleAppearTime    = 0;
let gameActive        = false;
let turnTimer         = null;
let turnResolved      = false; // 클릭으로 이미 처리됐으면 true → 타이머 게임오버 차단
let nextTurnTimer     = null;
let isSlowMo          = false;
let slowMoTimers      = [];
let isShooting        = false;
let isPaused          = false;
let elapsedRafId      = null;
let pauseData         = null;
let turnTimerEndTime  = 0;
let nextTurnTimerEndTime = 0;
let equippedWeapon    = 'hammer'; // 'hammer' | 'gun'
let canDropGifts      = false;    // 일반 아이템 미수집 있을 때만 true
let equipped          = {};       // { '무기': 'w_hammer', '테마': 't_field', ... }

// 캐시된 그리드 (initGrid 후 갱신)
let cachedCells = [];
let cachedMoles = [];
let cachedGifts = [];

// ─── DOM 캐시 ─────────────────────────────────────────────────────────────────
const grid             = document.getElementById('grid');
const elScore          = document.getElementById('score');
const elPrevRtWrap     = document.getElementById('prevRtWrap');
const elPrevRtVal      = document.getElementById('prevRtVal');
const elElapsed        = null; // 미연결 (moleAppearTime으로 내부 추적)
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
        // 뒤로가기 버튼 또는 메인메뉴 버튼: history 엔트리를 intro로 교체
        showPage('intro');
        history.replaceState({ page: 'intro' }, '');
    } else {
        history.pushState({ page }, '');
        showPage(page);
    }
}

// 브라우저/기기 뒤로가기
window.addEventListener('popstate', (e) => {
    const page = e.state?.page;
    if (!page) return; // 앱 진입 이전 히스토리 → 실제 브라우저 뒤로가기

    if (gameActive) {
        // 게임 중 뒤로가기 → 게임 종료 후 인트로
        endGame('게임을 나갔습니다.');
        history.replaceState({ page: 'intro' }, '');
    }
    showPage(page);
});

// ─── 콜렉션 데이터 ────────────────────────────────────────────────────────────
const COLLECTION_DATA = {
    normal: [
        { id: 'w_hammer', cat: '무기',   emoji: '🔨', name: '뿅망치',      unlocked: true  },
        { id: 'w_gun',    cat: '무기',   emoji: '🔫', name: '물총',        unlocked: false },
        { id: 'w_net',       cat: '무기',   emoji: '🪤', name: '그물',        unlocked: false },
        { id: 'w_lightning', cat: '무기',   emoji: '⚡', name: '번개',        unlocked: false },
        { id: 'w_bomb',      cat: '무기',   emoji: '💣', name: '폭탄',        unlocked: false },
        { id: 'w_balloon',   cat: '무기',   emoji: '🎈', name: '물풍선',      unlocked: false },
        { id: 'w_spotlight', cat: '무기',   emoji: '🔦', name: '핀조명',      unlocked: false },
        { id: 'w_ufo',       cat: '무기',   emoji: '🛸', name: 'UFO빔',       unlocked: false },
        { id: 'w_target',    cat: '무기',   emoji: '🎯', name: '타겟',        unlocked: false },
        { id: 't_field',  cat: '테마',   emoji: '🌿', name: '들판 테마',   unlocked: true  },
        { id: 't_snow',   cat: '테마',   emoji: '❄️', name: '설원 테마',   unlocked: false },
        { id: 't_night',  cat: '테마',   emoji: '🌙', name: '야간 테마',   unlocked: false },
        { id: 's_brown',  cat: '스킨',   emoji: '🟤', name: '기본 갈색',   unlocked: true  },
        { id: 's_gray',   cat: '스킨',   emoji: '⬜', name: '회색 두더지', unlocked: false },
        { id: 's_orange', cat: '스킨',   emoji: '🟠', name: '주황 두더지', unlocked: false },
        { id: 'h_cap',    cat: '모자',   emoji: '🧢', name: '야구모자',    unlocked: false },
        { id: 'h_tophat', cat: '모자',   emoji: '🎩', name: '실크햇',      unlocked: false },
        { id: 'h_bow',    cat: '모자',   emoji: '🎀', name: '리본',        unlocked: false },
        { id: 'h_crown',  cat: '모자',   emoji: '👑', name: '왕관',        unlocked: false },
        { id: 'g_spy',    cat: '안경',   emoji: '🕶️', name: '클래식 선글', unlocked: true  },
        { id: 'g_round',  cat: '안경',   emoji: '👓', name: '동글 안경',   unlocked: false },
        { id: 'c_scarf',  cat: '의상',   emoji: '🧣', name: '목도리',      unlocked: false },
        { id: 'c_coat',   cat: '의상',   emoji: '🧥', name: '코트',        unlocked: false },
        { id: 'a_tie',    cat: '장신구', emoji: '👔', name: '넥타이',      unlocked: false },
        { id: 'a_star',   cat: '장신구', emoji: '⭐', name: '별 브로치',   unlocked: false },
        { id: 'e_water',  cat: '효과',   emoji: '💧', name: '물방울',      unlocked: true  },
        { id: 'e_spark',  cat: '효과',   emoji: '✨', name: '별빛',        unlocked: false },
    ],
    hidden: [
        { id: 'hw_gold',    cat: '무기',   emoji: '🌟', name: '황금 물총',     unlocked: false },
        { id: 'hh_skull',   cat: '모자',   emoji: '💀', name: '해골 모자',     unlocked: false },
        { id: 'hg_vip',     cat: '안경',   emoji: '🕶️', name: 'VIP 선글라스',  unlocked: false },
        { id: 'ha_diamond', cat: '장신구', emoji: '💎', name: '다이아 브로치', unlocked: false },
        { id: 'he_rainbow', cat: '효과',   emoji: '🌈', name: '무지개 이펙트', unlocked: false },
    ],
};

let collState = { tab: 'normal', cat: '전체' };

function renderCollection() {
    const { tab, cat } = collState;
    const items = COLLECTION_DATA[tab];
    const cats  = ['전체', ...new Set(items.map(i => i.cat))];

    // 카테고리 필터 렌더
    const catsEl = document.getElementById('collCats');
    if (catsEl) {
        catsEl.innerHTML = '';
        cats.forEach(c => {
            const btn = document.createElement('button');
            btn.className   = 'coll-cat' + (c === cat ? ' active' : '');
            btn.textContent = c;
            btn.onclick = () => { collState.cat = c; renderCollection(); };
            catsEl.appendChild(btn);
        });
    }

    // 아이템 그리드 렌더
    const gridEl = document.getElementById('collGrid');
    if (!gridEl) return;
    const filtered = cat === '전체' ? items : items.filter(i => i.cat === cat);
    gridEl.innerHTML = '';
    filtered.forEach(item => {
        const isEquipped = equipped[item.cat] === item.id;
        const div = document.createElement('div');
        div.className = 'coll-item'
            + (item.unlocked ? ' unlocked' : '')
            + (tab === 'hidden' ? ' hidden-item' : '')
            + (isEquipped ? ' equipped' : '');
        div.innerHTML = `
            <div class="coll-item-emoji">${item.unlocked ? item.emoji : '🔒'}</div>
            <div class="coll-item-name">${item.unlocked ? item.name : '???'}</div>
            ${isEquipped ? '<div class="coll-item-badge">장착 중</div>' : ''}
        `;
        if (item.unlocked) div.addEventListener('click', () => equipItem(item));
        gridEl.appendChild(div);
    });

    // 탭 버튼 active 상태 업데이트
    document.querySelectorAll('.coll-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
}

function switchCollTab(tab) {
    collState.tab = tab;
    collState.cat = '전체';
    renderCollection();
}

// ─── 콜렉션 저장소 ────────────────────────────────────────────────────────────
const COLLECTION_KEY = 'molemole_collection';

function loadCollection() {
    try {
        const saved = JSON.parse(localStorage.getItem(COLLECTION_KEY));
        if (!saved) return;
        const ids = new Set(saved);
        [...COLLECTION_DATA.normal, ...COLLECTION_DATA.hidden].forEach(item => {
            if (ids.has(item.id)) item.unlocked = true;
        });
    } catch { /* 저장 데이터 없거나 손상 시 기본값 유지 */ }
}

function saveCollection() {
    const ids = [...COLLECTION_DATA.normal, ...COLLECTION_DATA.hidden]
        .filter(i => i.unlocked)
        .map(i => i.id);
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(ids));
}

// 아직 못 받은 일반 아이템 목록
function getLockedNormalItems() {
    return COLLECTION_DATA.normal.filter(i => !i.unlocked);
}

// ─── 장착 시스템 ──────────────────────────────────────────────────────────────
const EQUIPPED_KEY  = 'molemole_equipped';
const WEAPON_ID_MAP = {
    'w_hammer':    'hammer',
    'w_gun':       'gun',
    'w_net':       'net',
    'w_lightning': 'lightning',
    'w_bomb':      'bomb',
    'w_balloon':   'balloon',
    'w_spotlight': 'spotlight',
    'w_ufo':       'ufo',
    'w_target':    'target',
};

function loadEquipped() {
    try { equipped = JSON.parse(localStorage.getItem(EQUIPPED_KEY)) || {}; }
    catch { equipped = {}; }
    if (!equipped['무기']) equipped['무기'] = 'w_hammer'; // 기본 무기
    applyEquipped();
}

function saveEquipped() {
    localStorage.setItem(EQUIPPED_KEY, JSON.stringify(equipped));
}

function equipItem(item) {
    if (!item.unlocked) return;
    equipped[item.cat] = item.id;
    saveEquipped();
    applyEquipped();
    renderCollection();
}

function applyEquipped() {
    equippedWeapon = WEAPON_ID_MAP[equipped['무기']] || 'hammer';
    // TODO: 테마/스킨/모자 등 적용
}

// ─── 히든 아이템 해금 ─────────────────────────────────────────────────────────
// 조건 충족 시 호출: unlockHidden('hw_gold', score >= 50) 형식
function unlockHidden(id, condition) {
    if (!condition) return;
    const item = COLLECTION_DATA.hidden.find(i => i.id === id);
    if (item && !item.unlocked) {
        item.unlocked = true;
        saveCollection();
    }
}

function checkHiddenConditions() {
    // TODO: 각 히든 아이템 해금 조건 구현 예시:
    // unlockHidden('hw_gold',    score >= 50);
    // unlockHidden('hh_skull',   score >= 100);
    // unlockHidden('hg_vip',     reactionTimes.length > 0 && Math.min(...reactionTimes) < 100);
    // unlockHidden('ha_diamond', score >= 30);
    // unlockHidden('he_rainbow', score >= 20);
}

// ─── 유틸 ────────────────────────────────────────────────────────────────────
const getNextDelay = () => TURN_DELAY_MIN + Math.random() * TURN_DELAY_RNG;

// ─── 보드 스케일 ──────────────────────────────────────────────────────────────
function scaleBoard() {
    if (!gameHeader || !boardWrapper || !gameContainer) return;
    const headerH = gameHeader.getBoundingClientRect().height;
    const availW  = window.innerWidth - 0;  // -0은 여백
    const availH  = document.body.clientHeight - headerH - GUN_AREA_H;
    const scale   = Math.min(availW / BOARD_SIZE, availH / BOARD_SIZE);
    gameContainer.style.transform = `scale(${scale}) rotateX(${BOARD_TILT_DEG}deg)`;
    // rotateX로 수직 압축되므로 실제 점유 높이 보정 (cos(θ) ≈ 0.95 @ 18deg)
    boardWrapper.style.height     = `${BOARD_SIZE * scale * Math.cos(BOARD_TILT_DEG * Math.PI / 180)}px`;
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
            <div class="mole-ear left"></div>
            <div class="mole-ear right"></div>
            <div class="mole-body"></div>
            <div class="mole-head">
              <div class="spy-glasses">
                <div class="glass left"></div>
                <div class="glass-bridge"></div>
                <div class="glass right"></div>
              </div>
              <div class="mole-eye left"><div class="pupil"></div></div>
              <div class="mole-eye right"><div class="pupil"></div></div>
              <div class="mole-snout"><div class="mole-nose"></div></div>
              <div class="mole-teeth"><div class="mole-tooth"></div><div class="mole-tooth"></div></div>
            </div>
          </div>`;

        const gift = document.createElement('div');
        gift.className   = 'gift';
        gift.textContent = '🎁';

        const hole = document.createElement('div');
        hole.className = 'mole-hole';
        hole.appendChild(gift);  // 선물 먼저 (두더지 뒤)
        hole.appendChild(mole);  // 두더지가 선물 위에

        cell.appendChild(hole);
        cell.addEventListener('click', () => handleClick(i));
        grid.appendChild(cell);

        cachedCells.push(cell);
        cachedMoles.push(mole);
        cachedGifts.push(gift);
    }
}

// ─── 난이도 ───────────────────────────────────────────────────────────────────
// score 0(1탄)=2.0s, 매 탄 0.1s 감소, score 15(16탄)=0.5s 도달 후 0.01s씩 감소, 최소 0.1s
function getTimeLimit() {
    if (score <= 15) return parseFloat((2.0 - score * 0.1).toFixed(2));
    return Math.max(0.1, parseFloat((0.5 - (score - 15) * 0.01).toFixed(3)));
}

// ─── 두더지 구성 (탄 수에 따라 나중에 확장) ──────────────────────────────────
function getMoleConfig() {
    // TODO: 탄 수(score)에 따라 total/spies 늘리기
    // 예) score >= 30: { total: 4, spies: 2 }
    //     score >= 50: { total: 4, spies: 3 }
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
    // 스파이 위치: positions 중 앞 spies개
    const spySet = new Set(
        [...positions].sort(() => Math.random() - 0.5).slice(0, spies)
    );

    // 전체 리셋
    cachedMoles.forEach(m => {
        m.classList.remove('show', 'spy', 'normal');
        m.dataset.type = '';
    });
    cachedGifts.forEach(g => {
        g.classList.remove('show');
        g.style.pointerEvents = '';
    });

    // 등장 (두더지 + 선물 같이 올라옴)
    positions.forEach((pos) => {
        const mole = cachedMoles[pos];
        mole.classList.add('show');
        cachedGifts[pos].classList.add('show'); // 두더지 뒤에서 같이 올라옴
        if (spySet.has(pos)) {
            mole.classList.add('spy');
            mole.dataset.type = 'spy';
        } else {
            mole.classList.add('normal');
            mole.dataset.type = 'normal';
        }
    });

    moleAppearTime = Date.now();
    startElapsedDisplay();
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
    stopElapsedDisplay();

    const reactionTime = Date.now() - moleAppearTime;
    const isSpy        = mole.dataset.type === 'spy';
    const cell         = cachedCells[index];

    cell.style.zIndex = '100';
    isSlowMo = true; // 중복 클릭 방지 (무기 무관)

    const slowDown = () => { document.getAnimations().forEach(a => { a.playbackRate = SLOW_RATE; }); SFX.setBGMRate(SLOW_RATE); };
    const slowUp   = () => { document.getAnimations().forEach(a => { a.playbackRate = 1; }); SFX.setBGMRate(1); };
    const onHit    = () => { isSpy ? SFX.hitSpy() : SFX.hitNormal(); };

    switch (equippedWeapon) {

        case 'gun':
            shootWater(cell);
            slowMoTimers = [
                setTimeout(slowDown, SLOW_START_MS),
                setTimeout(() => { slowUp(); onHit(); }, HIT_WALL_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), HIT_WALL_MS + 900),
            ];
            break;

        case 'lightning':
            strikeLightning(cell, index);
            slowMoTimers = [
                setTimeout(slowDown, LIGHTNING_SLOWSTART_MS),
                setTimeout(() => { slowUp(); onHit(); }, LIGHTNING_HIT_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), LIGHTNING_RESOLVE_MS),
            ];
            break;

        case 'bomb':
        case 'balloon':
            throwProjectile(cell, index, equippedWeapon);
            slowMoTimers = [
                setTimeout(slowDown, THROW_SLOWSTART_MS),
                setTimeout(() => { slowUp(); onHit(); }, THROW_HIT_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), THROW_RESOLVE_MS),
            ];
            break;

        case 'spotlight':
            strikeSpotlight(cell, index);
            slowMoTimers = [
                setTimeout(slowDown, SPOT_SLOWSTART_MS),
                setTimeout(() => { slowUp(); onHit(); }, SPOT_HIT_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), SPOT_RESOLVE_MS),
            ];
            break;

        case 'ufo':
            strikeUFO(cell, index);
            slowMoTimers = [
                setTimeout(slowDown, UFO_SLOWSTART_MS),
                setTimeout(() => { slowUp(); onHit(); }, UFO_HIT_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), UFO_RESOLVE_MS),
            ];
            break;

        case 'target':
            strikeTarget(cell, index);
            slowMoTimers = [
                setTimeout(slowDown, TARGET_SLOWSTART_MS),
                setTimeout(() => { slowUp(); onHit(); }, TARGET_HIT_MS),
                setTimeout(() => resolveHit(index, isSpy, reactionTime, cell), TARGET_RESOLVE_MS),
            ];
            break;

        default: // hammer (+ w_net 등 미구현 무기 fallback)
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
    cell.style.zIndex = '';
    cachedMoles.forEach(m => {
        m.classList.remove('show', 'spy', 'normal');
        m.dataset.type = '';
    });
    // 맞은 칸 제외한 나머지 선물은 내림
    cachedGifts.forEach((g, idx) => {
        if (idx !== index) {
            g.classList.remove('show');
            g.style.pointerEvents = '';
        }
    });

    if (isSpy) {
        cachedGifts[index].classList.remove('show');
        SFX.gameOver();
        endGame('스파이 두더지를 클릭했습니다!', reactionTime);
        return;
    }

    score++;
    elScore.textContent = score;
    reactionTimes.push(reactionTime);
    if (elPrevRtWrap && elPrevRtVal) {
        elPrevRtVal.textContent = reactionTime;
        elPrevRtWrap.classList.remove('hidden');
    }

    const startNext = () => {
        const delay = getNextDelay();
        nextTurnTimerEndTime = Date.now() + delay;
        nextTurnTimer = setTimeout(showMoles, delay);
    };

    // 선물 드롭: 미수집 일반 아이템이 없으면 확률 자체가 0
    if (!canDropGifts) {
        cachedGifts[index].classList.remove('show');
        startNext();
    } else {
        const locked = getLockedNormalItems();
        if (locked.length === 0) {
            // 게임 중 마지막 아이템까지 모두 수집 완료
            canDropGifts = false;
            cachedGifts[index].classList.remove('show');
            startNext();
        } else {
            // 탄 × 0.5% 확률로 미수집 아이템 중 랜덤 드롭
            const giftChance = score * 0.005;
            if (Math.random() < giftChance) {
                const item = locked[Math.floor(Math.random() * locked.length)];
                showGift(index, item, startNext);
            } else {
                cachedGifts[index].classList.remove('show');
                startNext();
            }
        }
    }
}

// ─── 선물 ─────────────────────────────────────────────────────────────────────
function showGift(index, item, onCollect) {
    const giftEl = cachedGifts[index];
    giftEl.textContent         = '🎁';
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
    gameActive           = true;
    isSlowMo             = false;
    isPaused             = false;
    moleAppearTime       = 0;
    pauseData            = null;
    turnTimerEndTime     = 0;
    nextTurnTimerEndTime = 0;
    turnResolved         = false;
    canDropGifts         = getLockedNormalItems().length > 0;
    applyEquipped();

    elScore.textContent = '0';
    if (elPrevRtWrap) elPrevRtWrap.classList.add('hidden');

    // 모든 오버레이 숨기고 게임 상태 push
    Object.values(PAGE_SCREENS).forEach(el => el && el.classList.add('hidden'));
    history.pushState({ page: 'game' }, '');
    currentPage = 'game';

    initGrid();
    SFX.playBGM();

    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = '⏸ 일시정지';

    // 무기 UI: 물총은 장착 시에만 표시
    document.querySelector('.gun-wrap')?.classList.toggle('hidden', equippedWeapon !== 'gun');

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

    checkHiddenConditions();
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

// ─── 망치 이펙트 ──────────────────────────────────────────────────────────────
function swingHammer(cell, moleIndex) {
    const cr = cell.getBoundingClientRect();
    const cx = cr.left + cr.width / 2;

    const hammer = document.createElement('div');
    hammer.className = 'hammer';
    hammer.innerHTML = `<div class="hammer-handle"></div><div class="hammer-head"></div>`;

    // 다른 무기들과 동일하게 body에 fixed 배치
    hammer.style.position = 'fixed';
    hammer.style.top  = `${cr.top - 50}px`;
    hammer.style.left = `${cx}px`;

    document.body.appendChild(hammer);

    // 스윙 애니메이션: 왼쪽 위에서 오른쪽으로 내려치기
    hammer.animate([
        { transform: 'translateX(-50%) rotate(-65deg)', offset: 0,    easing: 'cubic-bezier(0.4,0,1,1)' },
        { transform: 'translateX(-50%) rotate(20deg)',  offset: 0.55, easing: 'ease-out' },
        { transform: 'translateX(-50%) rotate(-8deg)',  offset: 0.75 },
        { transform: 'translateX(-50%) rotate(5deg)',   offset: 0.9  },
        { transform: 'translateX(-50%) rotate(-2deg)',  offset: 1    },
    ], { duration: 280, fill: 'forwards' });

    // 히트 시점 (약 150ms): 두더지 찌그러짐
    setTimeout(() => {
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px) scaleY(1)',    offset: 0,   easing: 'ease-out' },
                { transform: 'translateY(38px) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translateY(24px) scaleY(1)',    offset: 1 },
            ], { duration: 250 });
        }
    }, 150);

    setTimeout(() => hammer.remove(), 650);
}

// ─── 번개 이펙트 ──────────────────────────────────────────────────────────────
function strikeLightning(cell, moleIndex) {
    const cr = cell.getBoundingClientRect();
    const tx = cr.left + cr.width  / 2;
    const ty = cr.top  + cr.height / 2;

    // 지그재그 SVG 경로 생성 (매번 랜덤)
    function makeBoltPath(spread, segs = 7) {
        const pts = [[tx, 0]];
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            pts.push([tx + (Math.random() - 0.5) * spread, ty * t]);
        }
        pts.push([tx, ty]);
        return 'M ' + pts.map(p => p.join(',')).join(' L ');
    }

    // ── SVG 번개 줄기 ───────────────────────────────────────────────
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

    // ── 히트 시점: 플래시 + 찌그러짐 + 전기 파티클 ─────────────────
    setTimeout(() => {
        // 화면 플래시
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(255, 248, 130, 0.45)',
            pointerEvents: 'none', zIndex: '90',
        });
        document.body.appendChild(flash);
        flash.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 180, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => flash.remove();

        // 두더지 찌그러짐
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px) scaleY(1)',    offset: 0,   easing: 'ease-out' },
                { transform: 'translateY(38px) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translateY(24px) scaleY(1)',    offset: 1 },
            ], { duration: 250 });
        }

        // 전기 파티클 (노란/주황 불꽃)
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
    const arcH = Math.max(120, (sy - ty) * 0.6 + 80); // 포물선 높이

    // ── 투사체 DOM ───────────────────────────────────────────────────
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
        // 물풍선: 랜덤 밝은 색
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

    // ── 포물선 키프레임 (수식: arcH × 4t(1-t)) ─────────────────────
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

    // ── 착탄 ─────────────────────────────────────────────────────────
    setTimeout(() => {
        proj.remove();

        // 두더지 찌그러짐 (공통)
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px) scaleY(1)',    offset: 0,   easing: 'ease-out' },
                { transform: 'translateY(38px) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translateY(24px) scaleY(1)',    offset: 1 },
            ], { duration: 250 });
        }

        if (type === 'bomb') {
            // 폭발 플래시 (주황)
            const flash = document.createElement('div');
            Object.assign(flash.style, {
                position: 'fixed', inset: '0',
                background: 'rgba(255,100,0,0.28)',
                pointerEvents: 'none', zIndex: '90',
            });
            document.body.appendChild(flash);
            flash.animate([{ opacity: 1 }, { opacity: 0 }],
                { duration: 220, easing: 'ease-out', fill: 'forwards' })
                .onfinish = () => flash.remove();

            // 폭발 파티클 (노랑/주황/빨강)
            for (let i = 0; i < 18; i++) {
                const sz  = 5 + Math.random() * 14;
                const hue = 15 + Math.random() * 45; // 15~60: red→yellow
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
            // 물풍선: 하늘색 물방울 (waterSplash 재활용)
            waterSplash(tx, ty);
            waterSplash(tx, ty); // 2번 → 더 풍성한 물 이펙트
        }
    }, THROW_HIT_MS);
}

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

// ─── 핀조명 이펙트 ────────────────────────────────────────────────────────────
function strikeSpotlight(cell, moleIndex) {
    const cr = cell.getBoundingClientRect();
    const cx = cr.left + cr.width  / 2;
    const cy = cr.top  + cr.height / 2;
    const startR = 160;

    // box-shadow trick: 원 내부 투명 + 외부 어두운 오버레이
    const spot = document.createElement('div');
    Object.assign(spot.style, {
        position: 'fixed',
        width:  `${startR * 2}px`,
        height: `${startR * 2}px`,
        borderRadius: '50%',
        left: `${cx - startR}px`,
        top:  `${cy - startR}px`,
        boxShadow: '0 0 0 9999px rgba(0,0,0,0.9)',
        pointerEvents: 'none',
        zIndex: '80',
        transformOrigin: 'center center',
        opacity: '0',
    });
    document.body.appendChild(spot);

    // 페이드인 후 서서히 좁아지는 스포트라이트
    const narrowAnim = spot.animate([
        { transform: 'scale(1)',    opacity: 0 },
        { transform: 'scale(1)',    opacity: 1, offset: 0.06 },
        { transform: 'scale(0.28)', opacity: 1 },
    ], { duration: SPOT_HIT_MS * 1.3, easing: 'ease-in', fill: 'forwards' });

    // 조명 링 (두더지 위 강조)
    const ring = document.createElement('div');
    Object.assign(ring.style, {
        position: 'fixed',
        width: '90px', height: '90px',
        borderRadius: '50%',
        left: `${cx - 45}px`, top: `${cy - 45}px`,
        border: '3px solid rgba(255,255,180,0.0)',
        pointerEvents: 'none', zIndex: '81',
    });
    document.body.appendChild(ring);
    ring.animate([
        { borderColor: 'rgba(255,255,180,0)',   transform: 'scale(1.4)' },
        { borderColor: 'rgba(255,255,180,0.7)', transform: 'scale(1)',   offset: 0.3 },
        { borderColor: 'rgba(255,255,180,0.7)', transform: 'scale(1)' },
    ], { duration: SPOT_HIT_MS, fill: 'forwards' });

    // 히트 시점
    setTimeout(() => {
        narrowAnim.cancel();

        // 밝은 플래시
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(255,255,210,0.55)',
            pointerEvents: 'none', zIndex: '90',
        });
        document.body.appendChild(flash);
        flash.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 200, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => flash.remove();

        // 두더지 찌그러짐
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px) scaleY(1)',    offset: 0   },
                { transform: 'translateY(38px) scaleY(0.62)', offset: 0.3 },
                { transform: 'translateY(24px) scaleY(1)',    offset: 1   },
            ], { duration: 250 });
        }

        // 오버레이 & 링 제거
        spot.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 320, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => spot.remove();
        ring.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 200, fill: 'forwards' })
            .onfinish = () => ring.remove();
    }, SPOT_HIT_MS);
}

// ─── UFO 이펙트 ───────────────────────────────────────────────────────────────
function strikeUFO(cell, moleIndex) {
    const cr  = cell.getBoundingClientRect();
    const cx  = cr.left + cr.width  / 2;
    const cy  = cr.top  + cr.height / 2;
    const ufoW = 110;

    // 어두운 우주 오버레이
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,18,0.85)',
        pointerEvents: 'none', zIndex: '78',
    });
    document.body.appendChild(overlay);
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' });

    // UFO 최종 정지 위치 (두더지 위 130px)
    const ufoEndTop  = Math.max(20, cy - 140);
    const ufoStartTop = -130;  // 화면 위에서 시작

    const ufo = document.createElement('div');
    Object.assign(ufo.style, {
        position: 'fixed',
        left: `${cx - ufoW / 2}px`,
        top:  `${ufoStartTop}px`,
        width: `${ufoW}px`,
        pointerEvents: 'none', zIndex: '82',
    });

    const beamH = ufoEndTop - ufoStartTop + 120;
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
                        border-left:32px solid transparent;
                        border-right:32px solid transparent;
                        border-top:${beamH}px solid rgba(120,220,255,0.13);
                        margin:0 auto;filter:blur(7px);position:relative;z-index:-1"></div>
        </div>`;
    document.body.appendChild(ufo);

    // UFO 내려오기 → 대기 → 올라가기
    const dy = ufoEndTop - ufoStartTop;
    ufo.animate([
        { transform: 'translateY(0)',         opacity: 0 },
        { transform: `translateY(${dy}px)`,   opacity: 1, offset: 0.32, easing: 'ease-out' },
        { transform: `translateY(${dy}px)`,   opacity: 1, offset: 0.65, easing: 'ease-in' },
        { transform: `translateY(${dy - 160}px)`, opacity: 0 },
    ], { duration: UFO_HIT_MS + 600, fill: 'forwards' })
        .onfinish = () => ufo.remove();

    // 히트 시점
    setTimeout(() => {
        // 하늘색 플래시
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(100,200,255,0.28)',
            pointerEvents: 'none', zIndex: '90',
        });
        document.body.appendChild(flash);
        flash.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 260, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => flash.remove();

        // 두더지 빨려올라가기
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px)  scale(1)',   opacity: 1 },
                { transform: 'translateY(-15px) scale(0.7)', opacity: 0.6, offset: 0.4 },
                { transform: 'translateY(-65px) scale(0.2)', opacity: 0 },
            ], { duration: 380, easing: 'ease-in', fill: 'forwards' });
        }

        // 별빛 파티클 (UFO 주변)
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

        // 오버레이 제거
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

    // 표적 DOM (동심원 + 십자선)
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

    // 이동: 화면 아래 중앙 → 두더지 위치
    target.animate([
        { transform: 'translate(0,0) scale(1.5)', opacity: 0 },
        { transform: 'translate(0,0) scale(1)',   opacity: 1, offset: 0.12 },
        { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.88)` },
    ], { duration: TARGET_HIT_MS, easing: 'cubic-bezier(0.25,0,0.35,1)', fill: 'forwards' });

    // 히트 시점
    setTimeout(() => {
        // 빨간 플래시
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(255,40,40,0.22)',
            pointerEvents: 'none', zIndex: '90',
        });
        document.body.appendChild(flash);
        flash.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 180, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => flash.remove();

        // 두더지 찌그러짐
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            moleChar.animate([
                { transform: 'translateY(24px) scaleY(1)',    offset: 0   },
                { transform: 'translateY(38px) scaleY(0.62)', offset: 0.3 },
                { transform: 'translateY(24px) scaleY(1)',    offset: 1   },
            ], { duration: 250 });
        }

        // 표적 히트: 확장 + 투명화
        target.animate([
            { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.88)`, opacity: 1 },
            { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(2.2)`,  opacity: 0 },
        ], { duration: 380, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => target.remove();

        // 충격파 링
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

// ─── 초기화 ───────────────────────────────────────────────────────────────────
loadCollection();
loadEquipped();
history.replaceState({ page: 'intro' }, '');
showPage('intro');
initGrid();
scaleBoard();
