// ─── 콜렉션 상태 ──────────────────────────────────────────────────────────────
let collState = { tab: 'normal', cat: '전체' };

// ─── 콜렉션 저장소 ────────────────────────────────────────────────────────────
const COLLECTION_KEY = 'molemole_collection';

function loadCollection() {
    // 먼저 전부 false 초기화 (코드 기본값 무시)
    [...COLLECTION_DATA.normal, ...COLLECTION_DATA.hidden].forEach(item => item.unlocked = false);
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

let equipped       = {};
let equippedWeapon = 'hammer';

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
    document.body.className = document.body.className
        .replace(/\bequipped-\S+/g, '').trim();
    const accId = equipped['악세사리'];
    if (accId) document.body.classList.add(`equipped-${accId}`);
}

// ─── 히든 아이템 해금 ─────────────────────────────────────────────────────────
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
        // TODO: unlockHidden('spy_pact', score === 10);
        return;
    }

    // TODO: unlockHidden('expert_100',   (stats?.totalCaught || 0) >= 100);
    // TODO: unlockHidden('lucky_777', reactionTime === 777);

    if (reactionTimes.length >= 3) {
        // TODO: unlockHidden('consistent_rt', ...);
    }
    if (lastHitIndices.length >= 3) {
        // TODO: unlockHidden('consistent_pos', ...);
    }
}

// ─── 콜렉션 렌더 ──────────────────────────────────────────────────────────────
function renderCollection() {
    const { tab, cat } = collState;
    const items = COLLECTION_DATA[tab];
    const cats  = ['전체', '보유중', ...new Set(items.map(i => i.cat))];

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
    const filtered = cat === '전체'   ? items
                   : cat === '보유중' ? items.filter(i => i.unlocked)
                   :                   items.filter(i => i.cat === cat);
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
