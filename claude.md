게임 이름: 몰래몰레 (molemole)

## 게임 개요

4x4 그리드의 커튼 뒤에 숨은 인물을 찾는 게임.
매 턴 커튼 3개가 열리며 "사람" 2명과 "스파이" 1명이 등장.
일반 사람을 클릭하면 점수 획득, 스파이 클릭 또는 시간 초과 시 게임 종료.

---

## 게임 규칙

### 기본 구조
- 게임 보드: 4×4 그리드 (16칸), 각 칸에 커튼이 달려있음
- 매 턴 랜덤 3칸의 커튼이 열림 (사람 2 + 스파이 1)
- 플레이어는 **일반 사람 1명만** 클릭 (한 번 클릭 시 턴 종료)

### 등장 타이밍
- 이전 턴 성공 후 2~5초 랜덤 딜레이
- 첫 등장도 동일

### 실패 조건
- 제한시간 내에 아무도 클릭하지 못함
- 스파이를 클릭함

### 점수 시스템
- 점수 = 성공한 턴 수
- localStorage에 최고 기록 저장

### 난이도 (점수별 제한시간)
- 0~5점:  1.5초
- 6~10점: 1.0초
- 11~15점: 0.8초
- 16~20점: 0.5초
- 21~30점: 0.4초
- 31점~: 0.4 - (점수-30) × 0.001초 (최소 0.1초)

### 게임 종료 시 표시 데이터
- 총 점수, 최고 기록
- 평균 반응속도(ms), 최고 반응속도(ms)
- 해당 스테이지 제한시간, 두더지 등장 후 경과시간

---

## 파일 구조

```
index2.html   ← 메인 게임 파일
style2.css    ← 스타일
script.js     ← 게임 로직
```

순수 HTML/CSS/JS, 라이브러리 없음. 폰트: Pretendard CDN (jsdelivr)

---

## 구현 상세

### 테마: 커튼 시스템
- 각 셀에 `.mole-hole` (overflow: hidden) 안에 `.mole` 배치
- `.mole` 안에 `.curtain-left` / `.curtain-right` + `.person-content`
- 닫힘: 커튼이 셀 전체를 덮음
- 열림 (`.mole.show`): `translateX(-100%)` / `translateX(100%)` 으로 좌우로 열림
- 스파이 구분: `.person-text` 색상 (사람: `#2ecc71` 초록, 스파이: `#e74c3c` 빨강)

### 클릭 이펙트: 물총 (물총이 망치를 대체)
- 화면 하단 중앙에 물총(`.gun`) 고정 배치
- 클릭 시 `shootWater(cell)` 호출:
  1. 총구를 클릭한 셀 방향으로 회전 (`Math.atan2(ty-cy, tx-cx)`)
  2. 2 프레임 후 실제 총구 위치(`.muzzle-point`) 읽기 (`getBoundingClientRect`)
  3. 물줄기(`.water-stream`) 생성 후 높이 애니메이션 (0.13s)
  4. 145ms 후 `waterSplash()`: 물방울 12개 퍼짐 (Web Animations API)
- `isShooting` 플래그로 중복 발사 방지

### 슬로우 모션 (클릭 순간)
- **Web Animations API** (`document.getAnimations()`, `anim.playbackRate`) 사용
- 흐름:
  - 클릭 → 즉시 물총 발사 + `isSlowMo = true`
  - 117ms 후: `playbackRate = 0.1` (슬로우)
  - HIT_WALL(~347ms) 후: `playbackRate = 1` (정상 복귀)
  - HIT_WALL + 900ms 후: 커튼 닫기 + 게임 로직 (스파이면 오버, 아니면 다음 턴)
- `isSlowMo` 플래그로 슬로우 중 재클릭 방지
- 타이밍 상수: `SLOW_RATE=0.1`, `SLOW_START=117`, `HIT_WALL = 117 + ceil(23/0.1) ≈ 347`

### 주요 JS 전역 변수
```
score, reactionTimes, moleAppearTime
gameActive, isSlowMo, isShooting
turnTimer, nextTurnTimer, slowMoTimers[]
```

### 주요 함수
- `initGrid()`: 16칸 생성 (mole-hole > mole > 커튼 + person-content)
- `showMoles()`: 랜덤 3칸 선택, 스파이 1 배정, 커튼 열기, 제한시간 타이머 설정
- `handleClick(index)`: 물총 발사 + 슬로우모션 제어
- `getTimeLimit()`: 점수별 제한시간 반환
- `shootWater(targetEl)` / `waterSplash(cx, cy)`: 물총 이펙트
- `startGame()` / `endGame(reason, elapsedMs)`: 게임 시작/종료
- `loadBest()` / `saveBest(score)` / `updateBestDisplay()`: 최고기록 관리
