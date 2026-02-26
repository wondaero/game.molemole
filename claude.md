게임 이름: 몰래몰레 (molemole)

## 게임 개요

4×4 그리드에서 구멍 밖으로 올라오는 두더지를 잡는 게임.
매 턴 랜덤 3칸에서 일반 두더지 2마리 + 스파이 1마리가 팝업.
일반 두더지 클릭 → 점수 획득. 스파이 클릭 또는 시간 초과 → 게임 종료.

---

## 파일 구조

```
index.html   ← 메인 게임
style.css    ← 스타일
script.js    ← 게임 로직
```

순수 HTML/CSS/JS, 라이브러리 없음. 폰트: Pretendard CDN (jsdelivr)

---

## 화면 구조 (index.html)

| 화면 | id | 설명 |
|---|---|---|
| 인트로(메인메뉴) | `introScreen` | 게임시작 / 콜렉션 / 설정 |
| 게임 방법 | `startScreen` | 규칙 설명 + 게임시작 버튼 |
| 콜렉션 | `collectionScreen` | 일반/히든 탭, 카테고리 필터, 아이템 그리드 |
| 설정 | `settingsScreen` | 미구현 |
| 게임 오버 | `endScreen` | 점수/반응속도 통계 |
| 게임 | `gameHeader` + `boardWrapper` | HUD + 4×4 그리드 |

네비게이션: `navigateTo(page)` / `history.pushState` 기반 뒤로가기 지원

---

## 게임 규칙

### 등장 타이밍
- 게임 시작 / 이전 턴 성공 후 2~5초 랜덤 딜레이

### 실패 조건
- 제한시간 내에 아무도 클릭하지 못함
- 스파이를 클릭함

### 점수 시스템
- 점수 = 성공한 턴 수 / localStorage(`molemole_best`)에 최고 기록 저장

### 난이도 (점수별 제한시간) — `getTimeLimit()`
- score 0~15: `2.0 - score × 0.1` 초 (선형 감소, 0탄=2.0s → 16탄=0.5s)
- score 16~: `0.5 - (score - 15) × 0.01` 초 (최소 0.1초)

### HUD (게임 중 표시)
- `N탄` (현재 점수)
- `이전 Xms` (직전 턴 반응속도, 클릭 시 갱신·고정)

### 게임 종료 화면
- 총 점수, 최고 기록, 신기록 여부
- 평균/최고 반응속도(ms), 스테이지 제한시간, 등장 후 경과시간

---

## 구현 상세

### 팝업 애니메이션
- 구조: `.cell > .mole-hole(overflow:hidden) > [.gift, .mole]`
- 기본: `transform: translateY(100%)` → 구멍 아래 숨김
- 등장: `.show` 클래스 추가 → `translateY(0)`, 0.18s ease-out
- 선물(.gift)도 동일한 애니메이션으로 두더지 뒤에서 같이 올라옴

### 무기 시스템
- `equippedWeapon = 'hammer' | 'gun'` (현재 기본값: `'hammer'`)
- `handleClick()` → 무기에 따라 `swingHammer()` 또는 `shootWater()` 호출
- `resolveHit(index, isSpy, reactionTime, cell)`: 무기 공통 게임 로직 처리

### 뿅망치 이펙트 (`swingHammer`)
- `.hammer` DOM을 `.cell`에 append, `transform-origin: 50% 0px` (손잡이 꼭대기 기준 회전)
- 스윙 280ms → 150ms 시점에 두더지 찌그러짐(`.mole-char` Web Animations)
- 650ms 후 DOM 제거
- `resolveHit()` 호출: 500ms 후

### 물총 이펙트 (`shootWater`) — gun 장착 시
- `.gun-wrap`: `position: fixed; bottom: 77px; left: 50%; transform: translateX(-100%)`
  → 총구(오른쪽 끝)가 viewport 가로 정중앙에 고정
- `.gun`: `transform-origin: 100% 25px` (총구 기준 회전)
- 물줄기: `.water-stream` DOM, `height: 0 → dist px` (0.13s), 145ms 후 `waterSplash()`
- 슬로우모션: `SLOW_START_MS(117ms)` 후 `playbackRate=0.1`, `HIT_WALL_MS(≈347ms)` 후 복귀
- `resolveHit()` 호출: `HIT_WALL_MS + 900ms` 후

### 타이머 race condition 방지
- `turnResolved = false` → `showMoles()` 시작 시 리셋
- 클릭 시: `turnResolved = true` + `clearTimeout(turnTimer)` (이중 차단)
- 타이머 콜백: `if (gameActive && !turnResolved)` 확인 후 게임오버
- 이유: 타이머 발화 후 클릭 이벤트가 처리되더라도 `turnResolved`로 게임오버 차단

### 보드 스케일
- 기준: `BOARD_SIZE = 550px` (cell 120×4 + gap 10×3 + pad 20×2)
- `scaleBoard()`: `(viewport - 헤더 - GUN_AREA_H(110px)) / BOARD_SIZE` 로 scale 계산
- `gameContainer.style.transform = scale()` + `boardWrapper.style.height` 동적 설정

### 일시정지
- 두더지 등장 중 또는 `isSlowMo` 중 불가
- `pauseData`에 `turnRemaining`, `nextRemaining`, `moleElapsed` 저장
- 재개 시 남은 시간 복원, `moleAppearTime = Date.now() - moleElapsed` 보정
- 단축키: Esc / P

### 콜렉션 시스템
- `COLLECTION_DATA.normal` (21개): 무기/테마/스킨/모자/안경/의상/장신구/효과
- `COLLECTION_DATA.hidden` (5개): 특수 조건 해금 (조건 구현 예정)
- `collState = { tab, cat }` 로 탭·카테고리 필터 상태 관리
- `renderCollection()`: 카테고리 버튼 + 아이템 그리드 동적 렌더

---

## DOM 캐시 (script.js 상단)

```js
cachedCells[]      // 16개 .cell
cachedMoles[]      // 16개 .mole
cachedGifts[]      // 16개 .gift
grid, elScore
elPrevRtWrap, elPrevRtVal   // 이전 반응속도 표시
elElapsed          // null (미연결, 향후 경과시간 표시용)
startScreen, endScreen, pauseOverlay, pauseBtn
gun, muzzlePt, boardWrapper, gameHeader, gameContainer
introScreen, collectionScreen, settingsScreen
```

---

## 주요 함수

| 함수 | 역할 |
|---|---|
| `initGrid()` | 16칸 생성, cachedCells/Moles/Gifts 채움 |
| `showMoles()` | 랜덤 3칸 팝업, 타이머 설정, `turnResolved=false` |
| `handleClick(index)` | `turnResolved=true` + 무기별 이펙트 실행 |
| `resolveHit(...)` | 무기 공통: 점수처리·선물·다음턴 |
| `getTimeLimit()` | 점수별 제한시간 계산 |
| `swingHammer(cell, idx)` | 망치 스윙 + 두더지 찌그러짐 |
| `shootWater(targetEl)` | 물총 조준·발사·물줄기 |
| `waterSplash(cx, cy)` | 물방울 12개 퍼짐 이펙트 |
| `scaleBoard()` | 보드 scale 계산·적용 |
| `togglePause()` | 일시정지 토글 |
| `startGame()` / `endGame()` | 게임 시작/종료 |
| `renderCollection()` | 콜렉션 화면 렌더 |
| `navigateTo(page)` | history 기반 화면 전환 |

---

## 배경·색상 (현재)

- body: `linear-gradient(to bottom, #131a08, #1c2a0c, #131a08)` (진한 녹색)
- game-container: `rgba(0,0,0,0.25)`
- cell: `#2e1a08` (어두운 갈색 원형)
- 두더지: 갈색 계열 CSS 캐릭터 (mole-char, mole-head, mole-body 등)
