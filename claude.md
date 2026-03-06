게임 이름: 몰래몰레 (molemole)

## 워크플로우 규칙

> **변경사항이 생길 때마다 이 파일(CLAUDE.md)과 spec.md를 항상 함께 업데이트할 것**
> - `CLAUDE.md`: 기술 구현 상세 (AI용)
> - `spec.md`: 기획/기능 현황 (사용자용)

---

## 파일 구조

```
index.html      ← 메인 게임 (script 로드 순서: data→collection→effects→script)
style.css       ← 스타일
data.js         ← COLLECTION_DATA (콜렉션 아이템 데이터)
collection.js   ← 콜렉션/장착 시스템 (loadCollection, renderCollection, equipItem 등)
effects.js      ← 무기 이펙트 + 타이밍 상수 (makeFlash, swingHammer, shootWater, ... strikeTarget)
script.js       ← 게임 핵심 (상태, 로직, 네비게이션, 스케일, initGrid)
```

순수 HTML/CSS/JS, 라이브러리 없음. 멀티 script 태그 (전역 스코프 공유). 폰트: Pretendard CDN (jsdelivr)

**전역 의존 관계 (로드 순서 기준)**
- `data.js` → 의존 없음
- `collection.js` → `COLLECTION_DATA` (data.js), 런타임에 `reactionTimes`, `lastHitIndices` (script.js)
- `effects.js` → 런타임에 `boardScale`, `cachedMoles`, `gun`, `muzzlePt`, `isShooting` (script.js)
- `script.js` → `COLLECTION_DATA` (data.js), `equippedWeapon`, `loadCollection`, `loadEquipped`, `applyEquipped`, `renderCollection`, `checkHiddenConditions` (collection.js), 모든 이펙트 함수 + 타이밍 상수 (effects.js)

---

## 화면 구조 (index.html)

| 화면 | id | 설명 |
|---|---|---|
| 인트로(메인메뉴) | `introScreen` | 게임시작 / 콜렉션 / 설정 + 디버그 버튼 |
| 게임 방법 | `startScreen` | 규칙 설명 + 게임시작 버튼 |
| 콜렉션 | `collectionScreen` | 일반/히든 탭, 카테고리+보유중 필터, 아이템 그리드 |
| 설정 | `settingsScreen` | 미구현 |
| 게임 오버 | `endScreen` | 점수/반응속도 통계 + 메인메뉴 버튼 |
| 게임 | `gameHeader` + `boardWrapper` | HUD + 4×4 그리드 |
| 일시정지 오버레이 | `pauseOverlay` | 계속하기 / 게임중단(intro로 이동) |

네비게이션: `navigateTo(page)` / `history.pushState` 기반 뒤로가기 지원

---

## 게임 규칙

### 등장 타이밍
- 게임 시작 / 이전 턴 성공 후 0.8~2초 랜덤 딜레이
- 상수: `TURN_DELAY_MIN = 800`, `TURN_DELAY_RNG = 1200` (ms)

### 실패 조건
- 제한시간 내에 아무도 클릭하지 못함
- 스파이를 클릭함

### 점수 시스템
- 점수 = 성공한 턴 수 / localStorage(`molemole_best`)에 최고 기록 저장

### 난이도 (점수별 제한시간) — `getTimeLimit()`
- score 0~15: `2.0 - score × 0.1` 초 (선형 감소, 0탄=2.0s → 15탄=0.5s)
- score 16~: `0.5 - (score - 15) × 0.01` 초 (최소 0.1초)

### 두더지 구성 — `getMoleConfig()`
| score | total | spies | 일반 |
|---|---|---|---|
| 0~9 | 3 | 1 | 2 |
| 10~19 | 4 | 2 | 2 |
| 20~29 | 4 | 3 | 1 |
| 30~39 | 5 | 3 | 2 |
| 40~ | 5 | 4 | 1 |

### HUD
- `N탄` (현재 점수), `이전 Xms` (직전 턴 반응속도)

---

## 구현 상세

### 두더지 캐릭터 구조
- **HTML**: `.mole-char > [.spy-glasses, .mole-eyes, .mole-snout > (.mole-nose + .mole-mouse), .mole-item > div]`
- `.mole-char`: `position:absolute; top:50%; left:50%; transform:translate(-50%,-50%)`, opacity transition으로 등장
- **스파이 안경**: `.spy-glasses` (기본 `display:none`, CSS pseudo `:before/:after`로 렌즈 표현) → `.mole-hole.spy`일 때 `display:flex`
- **악세사리**: `body.equipped-{id} .mole-item { display:block; ... }` 방식으로 CSS 작성

### 팝업 애니메이션
- **구조**: `.cell > .mole-hole > [.mole-clip(overflow:hidden, border-radius:50%) > [.gift, .mole(빈 컨테이너)], .mole-char]`
- `.mole-hole`: `position:absolute; inset:0` (overflow 없음)
- `.mole-clip`: `position:absolute; inset:0; border-radius:50%; overflow:hidden` — 실제 클리핑 담당
- `.mole` (빈 컨테이너): `::after` 가상 요소로 갈색 원형 팝업 시각 제공. `translateY(100%)` → `.mole-hole.show .mole::after` → `translateY(0)`, 0.18s ease-out
- `.mole-char`: **`.mole-clip` 밖** `.mole-hole`의 직접 자식 → overflow 클리핑 없이 위로 자유롭게 이동 가능
  - `opacity:0` 기본 → `.mole-hole.show .mole-char { opacity:1 }` (0.18s transition)
- show/spy 선택자: `.mole-hole.show`, `.mole-hole.spy` (구 `.mole.show`, `.mole.spy` 아님)
- `cachedMoles[]`: `.mole-hole` 요소 저장 (이전: `.mole`)

### 선물 시스템
- **등장**: `showMoles()`에서 일반 두더지 위치에 `.gift.show` 동시 추가 (스파이 칸은 선물 없음)
- **클릭 활성화**: `resolveHit()` → `showGift()` 호출 → `giftEl.style.pointerEvents = 'auto'`
- **드롭 풀**: `COLLECTION_DATA.normal` 중 `!unlocked` + `cat in ['무기','모자','안경','장신구','효과']` (테마/스킨 제외)
- 풀이 비면 선물 없이 다음 턴 진행
- **팝업 흐름**: 선물 클릭 → `showGiftPopup()` → "수집하기" 클릭 → `onCollect()` = `startNext()`
- `canDropGifts = true` 테스트 중 (릴리즈 전 `getLockedNormalItems().length > 0` 으로 복원)

### 무기 시스템
- `equippedWeapon` 문자열로 관리, `handleClick()` → switch → 무기별 strike 함수
- `resolveHit(index, isSpy, reactionTime, cell)`: 무기 공통 게임 로직 (점수·선물·다음턴)
- 무기 이펙트는 전부 `document.body.appendChild` + `position:fixed` 패턴 (body 레이어)
- 셀 위치는 `getBoundingClientRect()`로 획득

### 무기 구현 상태

| 무기 ID | 이름 | 이펙트 | 비고 |
|---|---|---|---|
| `hammer` | 뿅망치 | ✅ `swingHammer()` | body 레이어, transform-origin 손잡이 꼭대기 |
| `gun` | 물총 | ✅ `shootWater()` | 슬로우모션, 물줄기, splash. 조준점: `GUN_AIM {x, y}` 상수 |
| `lightning` | 번개 | ✅ `strikeLightning()` | 타깃: `moleChar.getBoundingClientRect()` 머리 상단 (`mcr.top + mcr.height * 0.15`) |
| `bomb` | 폭탄 | ✅ `throwProjectile()` | bomb/balloon 공용 |
| `balloon` | 물풍선 | ✅ `throwProjectile()` | |
| `spotlight` | 핀조명 | ✅ `strikeSpotlight()` | SVG 빔+램프, 램프 회전 atan2(dx,dy). fade-out 순서: 빔·오버레이 먼저, 램프 나중 |
| `ufo` | UFO빔 | ✅ `strikeUFO()` | 실제 `.mole-char`에 직접 애니메이션. `/ boardScale` 좌표 변환 |
| `target` | 타겟 | ✅ `strikeTarget()` | SVG 십자선 이동 |
| `claw` | 인형뽑기 | ✅ `strikeClaw()` | 실제 `.mole-char`에 직접 애니메이션. `/ boardScale` 좌표 변환 |

**직접 애니메이션 방식 (UFO/claw)**: `cachedMoles[idx].querySelector('.mole-char')` 로 실제 요소 참조 → `.animate()` 적용
- `getBoundingClientRect()` 반환값은 화면 픽셀 단위 → `.game-container`가 `scale(boardScale)` 적용 중이므로 이동 거리는 `/ boardScale` 변환 필수
- clone 없이 실제 요소 직접 조작 → spy glasses 별도 처리 불필요

**fill:'forwards' 주의**: UFO/claw처럼 mole-char를 위로 빨아들이는 이펙트는
`upAnim` 참조 저장 → `RESOLVE_MS + 250ms` 후 `upAnim.cancel()` 호출 필수 (미구현 시 다음 턴 두더지 실종)

### 타이밍 상수 (ms)

| 무기 | SLOWSTART | HIT | RESOLVE |
|---|---|---|---|
| gun | 117 | ~347 (HIT_WALL_MS) | HIT_WALL_MS+900 |
| lightning | 80 | 220 | 620 |
| bomb/balloon | 160 | 480 | 1080 |
| spotlight | 100 | 380 | 930 |
| ufo | 150 | 520 | 1220 |
| target | 100 | 420 | 970 |
| claw | 130 | 480 | 1330 |

### 인트로 화면 레이아웃
- `intro-title`: 상단 `padding-top: 72px`, flex 상단 고정
- `.intro-footer`: `position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%)`
  - `.intro-spy-mole`: 스파이 두더지 1마리, `margin-bottom: 20px`
  - `.intro-nav`: 버튼 4개 (240px 너비)
  - `.debug-btns`: 기록 초기화 / 콜렉션 초기화 버튼 (디버그용, 빨간 반투명 스타일)

### 보드 스케일
- `BOARD_SIZE = 550px` (cell 120×4 + gap 10×3 + pad 20×2)
- `scaleBoard()`: `min(availW, availH) / BOARD_SIZE` 단순 scale
- `availW = innerWidth - 48` (좌우 24px 여백), `availH = innerHeight - headerH - GUN_AREA_H(110) - 14`
- `gameContainer.style.transform = scale(s)`, `boardWrapper.style.height = BOARD_SIZE * s`
- 엄지존 배치: `freeH = availH - BOARD_SIZE*s` → `gameHeader.style.marginTop = freeH * 0.65`
- `boardScale` 전역 변수 — UFO/claw `.mole-char` 직접 애니메이션 좌표 변환에 사용 (`screenPx / boardScale` = 로컬 CSS px)

### 일시정지 / 게임 중단
- `togglePause()`: 두더지 등장 중·slomo 중 불가. pauseData로 타이머 저장·복원
- `quitGame()`: 상태 정리 + 점수 저장(endScreen 없이) + `navigateTo('intro')`
- 단축키: Esc / P

### 콜렉션 시스템
- `COLLECTION_DATA.normal` (27개): 무기 9 / 테마 3 / 스킨 3 / 모자 6 / 안경 2 / 장신구 2 / 효과 2
- `COLLECTION_DATA.hidden` (5개): 특수 조건 해금 (조건 미구현, `checkHiddenConditions()` stub)
- localStorage: `molemole_collection` (해금 ID 배열), `molemole_equipped` (`무기` + `악세사리` 1슬롯)
- `loadCollection()`: **먼저 전부 false 초기화** 후 localStorage 기반으로 true 복원
- 카테고리 필터: `전체` / `보유중` (unlocked:true만) / 무기·테마·스킨·모자·안경·장신구·효과

### 악세사리 시스템
- 슬롯: `무기` 1개 + `악세사리` 1개 (총 2슬롯)
- `equipItem()`: `cat === '무기'` → `equipped['무기']`, 나머지 → `equipped['악세사리']`
- `applyEquipped()`: `document.body.classList`에 `equipped-{accId}` 추가 (기존 제거 후)
- CSS 작성 방식: `body.equipped-{id} .mole-item { display:block; ... }`

### 악세사리 아이템 ID 현황
| ID | 이름 | CSS 상태 | 비고 |
|---|---|---|---|
| `pin-ribbon1` | 리본 삔 | ✅ 작성됨 | 콜렉션 연결됨 |
| `tie-ribbon1` | 보타이 | ✅ 작성됨 | 콜렉션 연결됨 |
| `crown1` | 왕관 | ✅ 작성됨 | 콜렉션 연결됨 |
| `headset` | 헤드셋 | ✅ 작성됨 | 콜렉션 연결됨 (모자 카테고리) |
| `h_cap` | 야구모자 | ✅ 작성됨 | 빨간 돔+챙 |
| `h_tophat` | 실크햣 | ✅ 작성됨 | 검정 실크햣 |

### 디버그 유틸
- `debugResetStats()`: `molemole_best` + `molemole_stats` localStorage 삭제
- `debugResetCollection()`: `molemole_collection` + `molemole_equipped` 삭제 + 전체 `unlocked:false` + `loadEquipped()` 호출

---

## DOM 캐시 (script.js 상단)

```js
cachedCells[]      // 16개 .cell
cachedMoles[]      // 16개 .mole-hole  ← .mole 아님 (구조 변경)
cachedGifts[]      // 16개 .gift
grid, elScore
elPrevRtWrap, elPrevRtVal
startScreen, endScreen, pauseOverlay, pauseBtn
gun, muzzlePt, boardWrapper, gameHeader, gameContainer
introScreen, collectionScreen, settingsScreen
```

---

## 주요 함수

| 함수 | 역할 |
|---|---|
| `initGrid()` | 16칸 생성, cachedCells/Moles/Gifts 채움 |
| `showMoles()` | 랜덤 N칸 팝업, 일반 두더지 칸에 선물도 함께 등장 |
| `handleClick(index)` | `turnResolved=true` + 무기별 이펙트 실행 |
| `resolveHit(...)` | 점수처리·선물 클릭 활성화·다음턴 |
| `showGift(index, item, onCollect)` | 선물 클릭 활성화 + 클릭 핸들러 등록 |
| `showGiftPopup(item, onCollect)` | 팝업 표시, "수집하기" → onCollect 호출 |
| `getTimeLimit()` | 점수별 제한시간 계산 |
| `getMoleConfig()` | 점수별 두더지 구성 반환 |
| `swingHammer(cell, idx)` | 망치 스윙 |
| `shootWater(cell)` | 물총 조준·발사·물줄기·splash |
| `strikeLightning(cell, moleIndex)` | 번개 이펙트 (mole-char 머리 타깃) |
| `throwProjectile(cell, idx, type)` | 폭탄/물풍선 투척 |
| `strikeSpotlight(cell, moleIndex)` | 핀조명 (SVG 램프+빔) |
| `strikeUFO(cell, idx)` | UFO 납치 이펙트 |
| `strikeTarget(cell, idx)` | 타겟 십자선 이펙트 |
| `strikeClaw(cell, idx)` | 인형뽑기 갈고리 이펙트 |
| `scaleBoard()` | 보드 scale 계산·적용, `boardScale` 전역 갱신 |
| `togglePause()` | 일시정지 토글 |
| `quitGame()` | 게임 중단 후 intro 이동 |
| `cleanupGame()` | 타이머 정리, 두더지 숨김 등 공통 정리 (`endGame`/`quitGame` 공용) |
| `startGame()` / `endGame()` | 게임 시작/종료 |
| `renderCollection()` | 콜렉션 화면 렌더 |
| `navigateTo(page)` | history 기반 화면 전환 |
| `debugResetStats()` | 기록 초기화 (디버그) |
| `debugResetCollection()` | 콜렉션 초기화 (디버그) |

---

## 미구현 / TODO

- 사운드: `SFX` 객체 stub만 있음 (파일 미연결)

- 콜렉션 아이템 실제 cosmetic 적용 (테마/스킨 등)
- 히든 콜렉션 해금 조건 (`checkHiddenConditions()` 미구현)
- 설정 화면 미구현
- 릴리즈 전: `canDropGifts` 조건 복원, 모든 아이템 `unlocked:false` 설정
