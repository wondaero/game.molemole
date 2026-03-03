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

// ─── 상수 ────────────────────────────────────────────────────────────────────
const BOARD_SIZE       = 550;   // --cell:120×4 + gap:10×3 + pad:20×2
const GUN_AREA_H       = 110;   // 물총 영역 높이 (보드 스케일 계산 시 제외)
const TURN_DELAY_MIN   = 800;
const TURN_DELAY_RNG   = 1200;
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

// ── 갈고리 타이밍 ─────────────────────────────────────────────────────────────
const CLAW_SLOWSTART_MS  = 130;
const CLAW_HIT_MS        = 480;
const CLAW_RESOLVE_MS    = CLAW_HIT_MS + 850;

// ── 물총 조준점 (구멍 내 상대 위치, 0.0~1.0) ─────────────────────────────────
// x: 0.5 = 수평 중앙 / y: 0.5 = 수직 중앙, 0.6 = 중앙보다 20% 아래
const GUN_AIM = { x: 0.5, y: 0.6 };

// ─── 게임 상태 ────────────────────────────────────────────────────────────────
let score             = 0;
let reactionTimes     = [];
let lastHitIndices    = []; // 일관성2: 최근 클릭한 셀 인덱스 (최대 3개)
let moleAppearTime    = 0;
let gameActive        = false;
let turnTimer         = null;
let turnResolved      = false; // 클릭으로 이미 처리됐으면 true → 타이머 게임오버 차단
let nextTurnTimer     = null;
let isSlowMo          = false;
let slowMoTimers      = [];
let isShooting        = false;
let isPaused          = false;
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
        { id: 'w_gun',    cat: '무기',   emoji: '🔫', name: '물총',        unlocked: true},
        { id: 'w_lightning', cat: '무기',   emoji: '⚡', name: '번개',        unlocked: true},
        { id: 'w_bomb',      cat: '무기',   emoji: '💣', name: '폭탄',        unlocked: true},
        { id: 'w_balloon',   cat: '무기',   emoji: '🎈', name: '물풍선',      unlocked: true},
        { id: 'w_spotlight', cat: '무기',   emoji: '🔦', name: '핀조명',      unlocked: true},
        { id: 'w_ufo',       cat: '무기',   emoji: '🛸', name: 'UFO빔',       unlocked: true},
        { id: 'w_target',    cat: '무기',   emoji: '🎯', name: '타겟',        unlocked: true},
        { id: 'w_claw',      cat: '무기',   emoji: '🦾', name: '인형뽑기',    unlocked: true},
        { id: 't_field',  cat: '테마',   emoji: '🌿', name: '들판 테마',   unlocked: true  },
        { id: 't_snow',   cat: '테마',   emoji: '❄️', name: '설원 테마',   unlocked: true},
        { id: 't_night',  cat: '테마',   emoji: '🌙', name: '야간 테마',   unlocked: true},
        { id: 's_brown',  cat: '스킨',   emoji: '🟤', name: '기본 갈색',   unlocked: true  },
        { id: 's_gray',   cat: '스킨',   emoji: '⬜', name: '회색 두더지', unlocked: true},
        { id: 's_orange', cat: '스킨',   emoji: '🟠', name: '주황 두더지', unlocked: true},
        { id: 'h_cap',    cat: '모자',   emoji: '🧢', name: '야구모자',    unlocked: true},
        { id: 'h_tophat', cat: '모자',   emoji: '🎩', name: '실크햇',      unlocked: true},
        { id: 'pin-ribbon1',  cat: '모자',   emoji: '🎀', name: '리본 삔',     unlocked: true},
        { id: 'tie-ribbon1',  cat: '모자',   emoji: '🪢', name: '보타이',      unlocked: true},
        { id: 'crown1',   cat: '모자',   emoji: '👑', name: '왕관',        unlocked: true},
        { id: 'g_spy',    cat: '안경',   emoji: '🕶️', name: '클래식 선글', unlocked: true  },
        { id: 'g_round',  cat: '안경',   emoji: '👓', name: '동글 안경',   unlocked: true},
        { id: 'a_tie',    cat: '장신구', emoji: '👔', name: '넥타이',      unlocked: true},
        { id: 'a_star',   cat: '장신구', emoji: '⭐', name: '별 브로치',   unlocked: true},
        { id: 'e_water',  cat: '효과',   emoji: '💧', name: '물방울',      unlocked: true  },
        { id: 'e_spark',  cat: '효과',   emoji: '✨', name: '별빛',        unlocked: true},
    ],
    hidden: [
        { id: 'hw_gold',    cat: '무기',   emoji: '🌟', name: '황금 물총',     unlocked: true},
        { id: 'hh_skull',   cat: '모자',   emoji: '💀', name: '해골 모자',     unlocked: true},
        { id: 'hg_vip',     cat: '안경',   emoji: '🕶️', name: 'VIP 선글라스',  unlocked: true},
        { id: 'ha_diamond', cat: '장신구', emoji: '💎', name: '다이아 브로치', unlocked: true},
        { id: 'he_rainbow', cat: '효과',   emoji: '🌈', name: '무지개 이펙트', unlocked: true},
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
        const slot = item.cat === '무기' ? '무기' : '악세사리';
        const isEquipped = equipped[slot] === item.id;
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
    'w_lightning': 'lightning',
    'w_bomb':      'bomb',
    'w_balloon':   'balloon',
    'w_spotlight': 'spotlight',
    'w_ufo':       'ufo',
    'w_target':    'target',
    'w_claw':      'claw',
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
    const slot = item.cat === '무기' ? '무기' : '악세사리';
    equipped[slot] = item.id;
    saveEquipped();
    applyEquipped();
    renderCollection();
}

function applyEquipped() {
    equippedWeapon = WEAPON_ID_MAP[equipped['무기']] || 'hammer';

    // 악세사리: body에 equipped-{id} 클래스 하나만 관리
    // CSS: body.equipped-h_cap .item { ... } 형식으로 스타일 작성
    document.body.className = document.body.className
        .replace(/\bequipped-\S+/g, '').trim();
    const accId = equipped['악세사리'];
    if (accId) document.body.classList.add(`equipped-${accId}`);
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

function checkHiddenConditions(reactionTime, _hitIndex, isSpy, _stats) {
    if (reactionTime === undefined) return;

    if (isSpy) {
        // 스파이와의 약속: score가 10일 때 스파이 클릭 (score는 아직 increment 전)
        // TODO: unlockHidden('spy_pact', score === 10);
        return;
    }

    // 두더지전문가: 누적 포획 100 / 1000 / 10000
    // TODO: unlockHidden('expert_100',   (stats?.totalCaught || 0) >= 100);
    // TODO: unlockHidden('expert_1000',  (stats?.totalCaught || 0) >= 1000);
    // TODO: unlockHidden('expert_10000', (stats?.totalCaught || 0) >= 10000);

    // 럭키가이: 반응속도 정확히 777ms
    // TODO: unlockHidden('lucky_777', reactionTime === 777);

    // 일관성1: 연속 3턴 반응속도 완전히 동일
    if (reactionTimes.length >= 3) {
        // TODO: unlockHidden('consistent_rt', reactionTimes.at(-3) === reactionTimes.at(-2) && reactionTimes.at(-2) === reactionTimes.at(-1));
    }

    // 일관성2: 연속 3턴 같은 셀 클릭
    if (lastHitIndices.length >= 3) {
        // TODO: unlockHidden('consistent_pos', lastHitIndices[0] === lastHitIndices[1] && lastHitIndices[1] === lastHitIndices[2]);
    }
}

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

    // 보드를 아래쪽(엄지존)으로 이동: 남는 세로 공간의 65%를 헤더 위 여백으로
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
        clip.appendChild(gift);  // 선물 먼저 (두더지 뒤)
        clip.appendChild(mole);  // 두더지가 선물 위에

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
// score 0(1탄)=2.0s, 매 탄 0.1s 감소, score 15(16탄)=0.5s 도달 후 0.01s씩 감소, 최소 0.1s
function getTimeLimit() {
    if (score <= 15) return parseFloat((2.0 - score * 0.1).toFixed(2));
    return Math.max(0.1, parseFloat((0.5 - (score - 15) * 0.01).toFixed(3)));
}

// ─── 두더지 구성 ──────────────────────────────────────────────────────────────
// score  0~ 9: 3/1 (일반 2)
// score 10~19: 4/2 (일반 2)
// score 20~29: 4/3 (일반 1)
// score 30~39: 5/3 (일반 2)
// score 40~  : 5/4 (일반 1)
// TODO: 30탄+ 아이디어 — 소수파(minority) 클릭 룰로 전환
//   5마리 중 더 적은 쪽(일반/스파이)을 클릭. 예) 일반3+스파이2 → 스파이 클릭
//   단, 규칙화면 안내 문구 변경 + 전환 알림 필요
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

    // 등장: 일반 두더지 위치에 선물도 같이 올라옴 (스파이는 선물 없음)
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
    isSlowMo = true; // 중복 클릭 방지 (무기 무관)

    const slowDown = () => { document.getAnimations().forEach(a => { a.playbackRate = SLOW_RATE; }); SFX.setBGMRate(SLOW_RATE); };
    const slowUp   = () => { document.getAnimations().forEach(a => { a.playbackRate = 1; }); SFX.setBGMRate(1); };
    const onHit    = () => { isSpy ? SFX.hitSpy() : SFX.hitNormal(); };

    // 슬로우모션 3단계 타이머 공통 헬퍼
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
        case 'lightning':  setWeaponTimers(() => strikeLightning(cell, index),    LIGHTNING_SLOWSTART_MS, LIGHTNING_HIT_MS,  LIGHTNING_RESOLVE_MS); break;
        case 'bomb':
        case 'balloon':    setWeaponTimers(() => throwProjectile(cell, index, equippedWeapon), THROW_SLOWSTART_MS, THROW_HIT_MS, THROW_RESOLVE_MS); break;
        case 'spotlight':  setWeaponTimers(() => strikeSpotlight(cell, index),    SPOT_SLOWSTART_MS,   SPOT_HIT_MS,          SPOT_RESOLVE_MS);      break;
        case 'ufo':        setWeaponTimers(() => strikeUFO(cell, index),          UFO_SLOWSTART_MS,    UFO_HIT_MS,           UFO_RESOLVE_MS);       break;
        case 'target':     setWeaponTimers(() => strikeTarget(cell, index),       TARGET_SLOWSTART_MS, TARGET_HIT_MS,        TARGET_RESOLVE_MS);    break;
        case 'claw':       setWeaponTimers(() => strikeClaw(cell, index),         CLAW_SLOWSTART_MS,   CLAW_HIT_MS,          CLAW_RESOLVE_MS);      break;
        default:           // hammer (+ net 등 미구현 fallback)
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
        checkHiddenConditions(reactionTime, index, true);
        SFX.gameOver();
        endGame('스파이 두더지를 클릭했습니다!', reactionTime);
        return;
    }

    score++;
    elScore.textContent = score;
    reactionTimes.push(reactionTime);

    // ── 히든 미션 통계 기록 ──
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

    // 선물 드롭: 미수집 일반 아이템이 없으면 확률 자체가 0
    if (!canDropGifts) {
        cachedGifts[index].classList.remove('show');
        startNext();
    } else {
        // TODO: 릴리즈 전 locked 체크 복원 + 확률 복원 (탄 × 0.5%)
        // 테스트: 3종 풀에서 랜덤 드롭 (unlocked 무시)
        {
            const TEST_POOL = ['pin-ribbon1', 'tie-ribbon1', 'crown1'];
            const allNormal = COLLECTION_DATA.normal;
            const pool = allNormal.filter(i => TEST_POOL.includes(i.id));
            const item = pool[Math.floor(Math.random() * pool.length)];
            if (true) {
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
    // 선물은 showMoles()에서 이미 올라와 있음 — 클릭만 활성화
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

    // 모든 오버레이 숨기고 게임 상태 push
    Object.values(PAGE_SCREENS).forEach(el => el && el.classList.add('hidden'));
    history.pushState({ page: 'game' }, '');
    currentPage = 'game';

    initGrid();
    applyEquipped(); // initGrid() 이후에 호출해야 게임 셀 .mole-hat에 적용됨
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
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.add('hidden');

    const avgReaction  = reactionTimes.length > 0
        ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length) : 0;
    const bestReaction = reactionTimes.length > 0 ? Math.min(...reactionTimes) : 0;

    const isNewRecord = score > 0 && saveBest(score);
    const best        = loadBest();

    // 역대 최고 반응속도 갱신
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

// ─── 탭 이탈 ─────────────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameActive) endGame('게임 화면을 벗어났습니다.');
});

// ─── 게임 중단 ────────────────────────────────────────────────────────────────
function quitGame() {
    gameActive = false;
    isSlowMo   = false;
    isPaused   = false;
    pauseData  = null;
    clearTimeout(turnTimer);
    clearTimeout(nextTurnTimer);
    slowMoTimers.forEach(clearTimeout);
    slowMoTimers = [];
    document.getAnimations().forEach(a => { a.playbackRate = 1; });
    SFX.stopBGM();
    pauseOverlay.classList.add('hidden');
    pauseBtn.classList.add('hidden');
    cachedMoles.forEach(m => m.classList.remove('show'));
    if (score > 0) saveBest(score);
    navigateTo('intro');
}

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
    const cr = cell.getBoundingClientRect();
    const tx = cr.left + cr.width  / 2;
    const ty = cr.top  + cr.height / 2;

    // ── 어두운 오버레이: 어두워짐 → 히트 플래시 → 다시 어두워짐 → 사라짐 ──
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
        { opacity: 1,   offset: 0.13 },           // 빠르게 어두워짐
        { opacity: 1,   offset: hitRatio },        // 히트 직전까지 어두운 상태 유지
        { opacity: 0,   offset: hitRatio + 0.06 }, // 번개 히트 → 순간 밝아짐
        { opacity: 0.8, offset: hitRatio + 0.18 }, // 다시 어두워짐
        { opacity: 0,   offset: 1 },               // 서서히 사라짐
    ], { duration: LIGHTNING_RESOLVE_MS, fill: 'forwards' })
        .onfinish = () => overlay.remove();

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
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 0,   easing: 'ease-out' },
                { transform: 'translate(-50%, calc(-50% + 14px)) scaleY(0.62)', offset: 0.3, easing: 'ease-in'  },
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 1 },
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

    // 발사 시에만 총 등장
    const gunWrap = gun.parentElement;
    gunWrap.style.opacity = '1';

    const wr = targetEl.getBoundingClientRect();
    const tx = wr.left + wr.width  * GUN_AIM.x;
    const ty = wr.top  + wr.height * GUN_AIM.y;

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

    // 램프 고정 위치: 화면 좌측 상단
    const lampX = window.innerWidth * 0.18;
    const lampY = 14;
    const W = window.innerWidth, H = window.innerHeight;

    // 빔 방향 벡터 & 법선
    const dx = mx - lampX, dy = my - lampY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / dist, ny = dx / dist;

    // 빔 사다리꼴 꼭짓점 (램프 출구 startR → 타겟 endR)
    const startR = 8, endR = cr.width * 0.65;
    const pts = [
        [lampX + nx * startR, lampY + ny * startR],
        [lampX - nx * startR, lampY - ny * startR],
        [mx   - nx * endR,   my   - ny * endR  ],
        [mx   + nx * endR,   my   + ny * endR  ],
    ];

    // ── 어두운 오버레이 ──────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0',
        background: 'rgba(0,0,0,0.96)',
        pointerEvents: 'none', zIndex: '80', opacity: '0',
    });
    document.body.appendChild(overlay);
    overlay.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, fill: 'forwards' });

    // ── SVG: 사다리꼴 빔 + 타원 조명 ─────────────────────────────────────────
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    Object.assign(svg.style, {
        position: 'fixed', left: '0', top: '0',
        pointerEvents: 'none', zIndex: '81', opacity: '0',
    });
    document.body.appendChild(svg);

    // 그라디언트: 램프 쪽 진하게 → 타겟 쪽 투명하게
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

    // 빔 사다리꼴
    const beam = document.createElementNS(svgNS, 'polygon');
    beam.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    beam.setAttribute('fill', 'url(#spot-beam-grad)');
    svg.appendChild(beam);

    // 타겟 타원 (원근감 있는 조명 풀)
    const ell = document.createElementNS(svgNS, 'ellipse');
    ell.setAttribute('cx', mx); ell.setAttribute('cy', my + 6);
    ell.setAttribute('rx', endR * 0.95); ell.setAttribute('ry', endR * 0.5);
    ell.setAttribute('fill', 'rgba(255,255,200,0.22)');
    ell.setAttribute('opacity', '0'); // TODO: 테스트용 — 원 숨김
    svg.appendChild(ell);

    svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 40, fill: 'forwards' });

    // ── 램프 픽스처 ───────────────────────────────────────────────────────────
    // CW 회전량: 램프 기본 방향(아래) → 타겟 방향
    // CSS rotate(θ)에서 발광부(0,40)의 x' = -40·sin(θ) 이므로 dx 부호 반전
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

    // ── 히트 ─────────────────────────────────────────────────────────────────
    // 빔·오버레이 먼저 fade-out → 램프는 그 이후 fade-out
    // (동시에 사라지면 반투명 램프 뒤로 빔이 비치는 현상 발생)
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
    const targetY = cr.top + cr.height * 0.3; // 갈고리 목표: 셀 상단~중앙

    const wireH = 140;
    const clawH = 50;
    const wrapH = wireH + clawH;
    const startY      = -wrapH - 5;           // wrap 하단이 화면 위 5px에 걸침
    const descendDist = targetY - startY - wrapH; // = targetY + 5

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

    // ── DOM ───────────────────────────────────────────────────────────────────
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

    // ── 내려오기 → 정지 → 위로 올라가기 (단일 애니메이션) ────────────────────
    wrap.animate([
        { transform: 'translateX(-50%) translateY(0px)',               offset: 0,           easing: 'ease-in' },
        { transform: `translateX(-50%) translateY(${descendDist}px)`,  offset: descendFrac, easing: 'linear'  },
        { transform: `translateX(-50%) translateY(${descendDist}px)`,  offset: pauseFrac,   easing: 'ease-in' },
        { transform: 'translateX(-50%) translateY(-700px)',            offset: 1            },
    ], { duration: totalDur, fill: 'forwards' })
        .onfinish = () => wrap.remove();

    // ── 갈고리 닫힘 + 두더지 잡기 ───────────────────────────────────────────
    setTimeout(() => {
        clawEl.innerHTML = closedSVG;

        // 두더지 잡혀 올라감: clone을 claw와 동일한 viewport 좌표계에 고정
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            const charRect = moleChar.getBoundingClientRect();
            const clone    = moleChar.cloneNode(true);
            Object.assign(clone.style, {
                position: 'fixed',
                left: `${charRect.left + charRect.width  / 2}px`,
                top:  `${charRect.top  + charRect.height / 2}px`,
                width: '84px', height: '84px',
                transform: `translate(-50%, -50%) scale(${boardScale})`,
                margin: '0', zIndex: '86', pointerEvents: 'none',
            });
            document.body.appendChild(clone);
            moleChar.style.opacity = '0';

            // wrap 상승 시작(PAUSE_DUR 후)에 맞춰 claw와 동일 속도로 올라감
            const upDist = Math.round(descendDist + 700); // viewport px
            const upDur  = totalDur - CLAW_HIT_MS - PAUSE_DUR;
            setTimeout(() => {
                clone.animate([
                    { transform: `translate(-50%, -50%) scale(${boardScale})`,              opacity: 1 },
                    { transform: `translate(-50%, calc(-50% - ${upDist}px)) scale(${boardScale * 0.15})`, opacity: 0 },
                ], { duration: upDur, easing: 'ease-in', fill: 'forwards' });
            }, PAUSE_DUR);

            setTimeout(() => {
                try { clone.remove(); moleChar.style.opacity = ''; } catch(e) {}
            }, CLAW_RESOLVE_MS - CLAW_HIT_MS + 250);
        }

        // 잡는 순간 플래시
        const flash = document.createElement('div');
        Object.assign(flash.style, {
            position: 'fixed', inset: '0',
            background: 'rgba(255,240,180,0.38)',
            pointerEvents: 'none', zIndex: '90',
        });
        document.body.appendChild(flash);
        flash.animate([{ opacity: 1 }, { opacity: 0 }],
            { duration: 180, easing: 'ease-out', fill: 'forwards' })
            .onfinish = () => flash.remove();
    }, CLAW_HIT_MS);
}

// ─── UFO 이펙트 ───────────────────────────────────────────────────────────────
function strikeUFO(cell, moleIndex) {
    const cr  = cell.getBoundingClientRect();
    const cx  = cr.left + cr.width  / 2;
    const ufoW = 110;
    const UFO_BODY_H = 50; // 돔(20) + 본체(22) + 조명(6) + 여유(2)

    // UFO 최종 위치: 셀 상단 기준으로 위로 올라가되 화면 상단 10px 이상 확보
    const ufoEndTop  = Math.max(10, cr.top - 200);
    const ufoStartTop = -120;

    // 빔 높이: UFO 하단(ufoEndTop + UFO_BODY_H)에서 셀 상단(cr.top)까지 딱 맞게
    const beamH = cr.top - ufoEndTop - UFO_BODY_H;

    // 어두운 우주 오버레이
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

    // UFO 내려오기 → 대기 → 올라가기
    const dy = ufoEndTop - ufoStartTop;
    ufo.animate([
        { transform: 'translateY(0)',             opacity: 0 },
        { transform: `translateY(${dy}px)`,       opacity: 1, offset: 0.32, easing: 'ease-out' },
        { transform: `translateY(${dy}px)`,       opacity: 1, offset: 0.65, easing: 'ease-in' },
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

        // 두더지 빨려올라가기: clone을 viewport 좌표계에 고정 후 UFO까지 이동
        const moleChar = cachedMoles[moleIndex]?.querySelector('.mole-char');
        if (moleChar) {
            const charRect   = moleChar.getBoundingClientRect();
            const clone      = moleChar.cloneNode(true);
            Object.assign(clone.style, {
                position: 'fixed',
                left: `${charRect.left + charRect.width  / 2}px`,
                top:  `${charRect.top  + charRect.height / 2}px`,
                width: '84px', height: '84px',
                transform: `translate(-50%, -50%) scale(${boardScale})`,
                margin: '0', zIndex: '83', pointerEvents: 'none',
            });
            document.body.appendChild(clone);
            moleChar.style.opacity = '0';

            // 두더지 중심 → UFO 하단까지 viewport 픽셀 이동
            const travelDist = Math.round((charRect.top + charRect.height / 2) - (ufoEndTop + UFO_BODY_H));
            const midDist    = Math.round(travelDist * 0.5);
            clone.animate([
                { transform: `translate(-50%, -50%) scale(${boardScale})`,                                          opacity: 1   },
                { transform: `translate(-50%, calc(-50% - ${midDist}px)) scale(${boardScale * 0.6})`,               opacity: 0.7, offset: 0.5 },
                { transform: `translate(-50%, calc(-50% - ${travelDist}px)) scale(${boardScale * 0.15})`,           opacity: 0   },
            ], { duration: 380, easing: 'ease-in', fill: 'forwards' });

            setTimeout(() => {
                try { clone.remove(); moleChar.style.opacity = ''; } catch(e) {}
            }, UFO_RESOLVE_MS - UFO_HIT_MS + 250);
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
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 0   },
                { transform: 'translate(-50%, calc(-50% + 14px)) scaleY(0.62)', offset: 0.3 },
                { transform: 'translate(-50%, -50%) scaleY(1)',                 offset: 1   },
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
