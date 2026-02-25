게임 이름: 몰래몰레 (molemole)

## 게임 개요

4×4 그리드에서 구멍 밖으로 올라오는 인물을 쏘는 물총 게임.
매 턴 랜덤 3칸에서 "사람" 2명과 "스파이" 1명이 아래서 위로 팝업.
일반 사람을 클릭하면 점수 획득, 스파이 클릭 또는 시간 초과 시 게임 종료.

---

## 파일 구조

```
index.html   ← 메인 게임
style.css    ← 스타일
script.js    ← 게임 로직
```

순수 HTML/CSS/JS, 라이브러리 없음. 폰트: Pretendard CDN (jsdelivr)

---

## 게임 규칙

### 등장 타이밍
- 게임 시작 / 이전 턴 성공 후 2~5초 랜덤 딜레이

### 실패 조건
- 제한시간 내에 아무도 클릭하지 못함
- 스파이를 클릭함

### 점수 시스템
- 점수 = 성공한 턴 수 / localStorage에 최고 기록 저장

### 난이도 (점수별 제한시간)
- 0~5점:  1.5초
- 6~10점: 1.0초
- 11~15점: 0.8초
- 16~20점: 0.5초
- 21~30점: 0.4초
- 31점~: 0.4 - (점수-30) × 0.001초 (최소 0.1초)

### 게임 종료 시 표시
- 총 점수, 최고 기록
- 평균/최고 반응속도(ms), 스테이지 제한시간, 등장 후 경과시간

---

## 구현 상세

### 팝업 애니메이션 (커튼 없음)
- 각 셀: `.cell > .mole-hole(overflow:hidden) > .mole`
- 기본: `.mole { transform: translateY(100%) }` → 셀 아래에 숨겨진 상태
- 등장: `.mole.show { transform: translateY(0) }` → 0.18s ease-out 슬라이드 업
- 배경: `.mole.normal { background: #243d2e }` / `.mole.spy { background: #3d2424 }`
- 스파이 구분: `.person-text` 색상 (사람: `#2ecc71` / 스파이: `#e74c3c`)

### 보드 스케일 (JS)
- 설계 기준: `BOARD_SIZE = 550px` (cell 120×4 + gap 10×3 + pad 20×2)
- `scaleBoard()`: 헤더 높이 + 물총 영역(`GUN_AREA_H=110`) 제외한 가용 공간으로 `transform: scale()` 계산
- `#boardWrapper` 높이를 `BOARD_SIZE * scale`로 동적 설정 (transform-origin: top center)
- `window.addEventListener('resize', scaleBoard)`

### 물총 이펙트
- `.gun-wrap`: `position: fixed; bottom: 77px; left: 50%; transform: translateX(-100%)`
  → 총구(오른쪽 끝)가 viewport 가로 정중앙에 고정
- `.gun`: `transform-origin: 100% 25px` (총구 기준 회전 → 총구 위치 불변)
  - 기본 자세: `rotate(-45deg)` (우상향 45도 대기)
- 좌측 타겟: `scaleX(-1) rotate(${180 - gunAng}deg)` / 우측: `rotate(${gunAng}deg)`
- 총구 위치: `transform-origin`이 총구 → 회전 전 `getBoundingClientRect()` 읽어도 항상 정확
- 물줄기: `.water-stream` DOM 생성, `height: 0 → dist px` (0.13s transition), 145ms 후 `waterSplash()`
- `waterSplash()`: 물방울 12개 Web Animations API로 퍼짐

### 슬로우 모션
- 클릭 → 물총 발사 + `isSlowMo = true`
- 117ms 후: `document.getAnimations()` 전체 `playbackRate = 0.1`
- ~347ms (`HIT_WALL_MS`) 후: `playbackRate = 1` 복귀
- HIT_WALL + 900ms 후: 모든 mole 숨기기 + 게임 로직 처리
- 상수: `SLOW_RATE=0.1`, `SLOW_START_MS=117`, `REMAINING_HIT_MS=23`
- `HIT_WALL_MS = SLOW_START_MS + ceil(REMAINING_HIT_MS / SLOW_RATE)` ≈ 347

### 일시정지
- 두더지 등장 중(`mole.classList.contains('show')`) 또는 슬로우모션 중 불가
- 일시정지 시: 타이머 저장(`turnRemaining`, `nextRemaining`, `moleElapsed`), 모든 animation pause
- 재개 시: 남은 시간 복원, `moleAppearTime = Date.now() - moleElapsed` 보정
- 단축키: Esc / P

### DOM 캐시 (script.js 상단)
```js
cachedCells[]   // 16개 .cell
cachedMoles[]   // 16개 .mole
grid, elScore, elTimeLimit, elBestScore, elElapsed
startScreen, endScreen, pauseOverlay, pauseBtn
gun, muzzlePt, boardWrapper, gameHeader, gameContainer
```

### 주요 함수
- `initGrid()`: 16칸 생성, cachedCells/cachedMoles 채움
- `showMoles()`: 랜덤 3칸, 스파이 1 배정, translateY 팝업, 타이머 설정
- `handleClick(index)`: 물총 발사 + 슬로우모션 + 게임 로직
- `getTimeLimit()`: 점수별 제한시간
- `shootWater(targetEl)` / `waterSplash(cx, cy)`: 물총 이펙트
- `scaleBoard()`: 보드 스케일 계산·적용
- `togglePause()`: 일시정지 토글
- `startElapsedDisplay()` / `stopElapsedDisplay()`: rAF 루프로 경과시간 표시
- `startGame()` / `endGame(reason, elapsedMs)`: 게임 시작/종료
- `getRandomPositions()`: Set 기반 중복없는 3개 위치 선택
- `getNextDelay()`: `2000 + Math.random() * 3000`

### 배경 색상 (현재)
- body: `linear-gradient(135deg, #b3e5fc → #29b6f6 → #0288d1)` (밝은 하늘색)
- game-container: `#0277bd`
- cell: `#01579b`
