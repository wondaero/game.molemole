게임 이름: 몰래몰레 (molemole)

## 워크플로우 규칙

> **변경사항이 생길 때마다 이 파일(CLAUDE.md)과 spec.md를 항상 함께 업데이트할 것**
> - `CLAUDE.md`: 기술 구현 상세 (AI용)
> - `spec.md`: 기획/기능 현황 (사용자용)

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
| 게임 오버 | `endScreen` | 점수/반응속도 통계 + 메인메뉴 버튼 |
| 게임 | `gameHeader` + `boardWrapper` | HUD + 4×4 그리드 |
| 일시정지 오버레이 | `pauseOverlay` | 계속하기 / 게임중단(intro로 이동) |

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
- score 0~15: `2.0 - score × 0.1` 초 (선형 감소, 0탄=2.0s → 15탄=0.5s)
- score 16~: `0.5 - (score - 15) × 0.01` 초 (최소 0.1초)

### HUD
- `N탄` (현재 점수), `이전 Xms` (직전 턴 반응속도)

---

## 구현 상세

### 팝업 애니메이션
- 구조: `.cell > .mole-hole(overflow:hidden) > [.gift, .mole > .mole-char]`
- 기본: `transform: translateY(100%)` → `.show` 추가 시 `translateY(0)`, 0.18s ease-out

### 무기 시스템
- `equippedWeapon` 문자열로 관리, `handleClick()` → switch → 무기별 strike 함수
- `resolveHit(index, isSpy, reactionTime, cell)`: 무기 공통 게임 로직 (점수·선물·다음턴)
- 무기 이펙트는 전부 `document.body.appendChild` + `position:fixed` 패턴 (body 레이어)
- 셀 위치는 `getBoundingClientRect()`로 획득

### 무기 구현 상태

| 무기 ID | 이름 | 이펙트 | 비고 |
|---|---|---|---|
| `hammer` | 뿅망치 | ✅ `swingHammer()` | body 레이어, transform-origin 손잡이 꼭대기 |
| `gun` | 물총 | ✅ `shootWater()` | 슬로우모션, 물줄기, splash |
| `lightning` | 번개 | ✅ `strikeLightning()` | |
| `bomb` | 폭탄 | ✅ `throwProjectile()` | bomb/balloon 공용 |
| `balloon` | 물풍선 | ✅ `throwProjectile()` | |
| `spotlight` | 핀조명 | ✅ `strikeSpotlight()` | SVG 빔+램프, 램프 회전 atan2(dx,dy) |
| `ufo` | UFO빔 | ✅ `strikeUFO()` | 빔 cr.top에서 끊김, upAnim.cancel() 버그 수정 |
| `target` | 타겟 | ✅ `strikeTarget()` | SVG 십자선 이동 |
| `claw` | 인형뽑기 | ✅ `strikeClaw()` | 단일 keyframe 타임라인, 갈고리 열림→닫힘 |
| `net` | 그물 | ❌ default(hammer) fallback | 이펙트 미구현 |

**fill:'forwards' 주의**: UFO/갈고리처럼 mole-char를 위로 빨아들이는 이펙트는
`upAnim` 참조 저장 → `RESOLVE_MS + 50ms` 후 `upAnim.cancel()` 호출 필수 (미구현 시 다음 턴 두더지 실종)

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
- `.intro-content`: 타이틀(`intro-title`) + 버튼 4개(`intro-nav`) — 상단 72px 패딩으로 위쪽 고정
- `.intro-moles`: 하단에 두더지 구멍 4개 행. `margin-top: auto`로 바닥에 붙임, `margin-bottom: -36px`으로 일부 화면 밖
  - 각 `.intro-mole-hole` 90px 원형, `margin-left: -20px` 겹침, z-index 4→1 (왼쪽이 위)
  - 3번째(`:nth-child(3)`)에 `.spy` 클래스 → 안경 표시
  - 내부 `.mole-char`: `scale(0.75) translateY(18px)`, `transform-origin: top left`

### 보드 스케일
- `BOARD_SIZE = 550px` (cell 120×4 + gap 10×3 + pad 20×2)
- `scaleBoard()`: `min(availW, availH) / BOARD_SIZE` 단순 scale
- `availW = innerWidth - 48` (좌우 24px 여백), `availH = innerHeight - headerH - GUN_AREA_H(110) - 14`
- `gameContainer.style.transform = scale(s)`, `boardWrapper.style.height = BOARD_SIZE * s`
- 엄지존 배치: `freeH = availH - BOARD_SIZE*s` → `gameHeader.style.marginTop = freeH * 0.65` (남는 공간 65% 위로)

### 일시정지 / 게임 중단
- `togglePause()`: 두더지 등장 중·slomo 중 불가. pauseData로 타이머 저장·복원
- `quitGame()`: 상태 정리 + 점수 저장(endScreen 없이) + `navigateTo('intro')`
- 단축키: Esc / P

### 콜렉션 시스템
- `COLLECTION_DATA.normal` (28개): 무기 10 / 테마 3 / 스킨 3 / 모자 4 / 안경 2 / 의상 2 / 장신구 2 / 효과 2
- `COLLECTION_DATA.hidden` (5개): 특수 조건 해금 (조건 미구현, `checkHiddenConditions()` stub)
- localStorage: `molemole_collection` (해금 ID 배열), `molemole_equipped` (카테고리별 장착 ID)
- `unlocked: true`는 현재 테스트용 — 릴리즈 전 false로 변경 필요

---

## DOM 캐시 (script.js 상단)

```js
cachedCells[]      // 16개 .cell
cachedMoles[]      // 16개 .mole
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
| `showMoles()` | 랜덤 3칸 팝업, 타이머 설정, `turnResolved=false` |
| `handleClick(index)` | `turnResolved=true` + 무기별 이펙트 실행 |
| `resolveHit(...)` | 점수처리·선물·다음턴 |
| `getTimeLimit()` | 점수별 제한시간 계산 |
| `swingHammer(cell, idx)` | 망치 스윙 |
| `shootWater(cell)` | 물총 조준·발사·물줄기·splash |
| `strikeLightning(cell, idx)` | 번개 이펙트 |
| `throwProjectile(cell, idx, type)` | 폭탄/물풍선 투척 |
| `strikeSpotlight(cell, idx)` | 핀조명 (SVG 램프+빔) |
| `strikeUFO(cell, idx)` | UFO 납치 이펙트 |
| `strikeTarget(cell, idx)` | 타겟 십자선 이펙트 |
| `strikeClaw(cell, idx)` | 인형뽑기 갈고리 이펙트 |
| `scaleBoard()` | 보드 scale 계산·적용 |
| `togglePause()` | 일시정지 토글 |
| `quitGame()` | 게임 중단 후 intro 이동 |
| `startGame()` / `endGame()` | 게임 시작/종료 |
| `renderCollection()` | 콜렉션 화면 렌더 |
| `navigateTo(page)` | history 기반 화면 전환 |

---

## 미구현 / TODO

- 사운드: `SFX` 객체 stub만 있음 (파일 미연결)
- 그물(`net`) 이펙트 없음 — 현재 hammer fallback
- 콜렉션 아이템 실제 cosmstic 적용 (테마/스킨/모자 등)
- 히든 콜렉션 해금 조건 (`checkHiddenConditions()` 미구현)
- 설정 화면 미구현
- `unlocked: true` 전체 → 릴리즈 시 개별 false로 복원
