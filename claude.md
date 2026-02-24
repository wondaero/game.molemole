게임 이름: 몰래몰레 (molemole)


1. 기본 구조

* 게임 보드는 4x4 그리드 (총 16칸)
* 각 턴마다 두더지 3마리가 랜덤 위치에서 등장
* 3마리 중:

  * 2마리: 일반 두더지 (클릭해야 하는 타겟)
  * 1마리: 스파이 두더지 (클릭하면 안됨, 약간 다른 외형)

2. 등장 타이밍

* 게임 시작 또는 이전 턴 성공 후
* 다음 두더지 등장 시간은 랜덤
* 범위: 2초 ~ 5초
* 랜덤은 완전 랜덤(Random 함수 사용)

3. 두더지 등장 규칙

* 4x4 그리드의 서로 다른 3개의 칸에서 등장
* 등장 위치는 매 턴 랜덤

4. 플레이어 행동

* 플레이어는 등장한 두더지 중
  "일반 두더지 1마리만" 클릭해야 함

제한:

* 일반 두더지 2마리를 모두 잡는 것은 불가능
* 한 번 클릭하면 해당 턴은 종료됨

5. 시간 제한

* 두더지가 등장하면
* 0.8초 동안 화면에 나타남
* 0.8초 안에 클릭하지 못하면 게임 종료

6. 실패 조건
   다음 경우 게임 종료:

* 0.8초 안에 아무 두더지도 클릭하지 못함
* 스파이 두더지를 클릭함

7. 성공 조건

* 일반 두더지를 클릭하면 성공
* 점수 +1
* 다음 턴 진행

8. 점수 시스템

* 점수 = 잡은 두더지 수
* 즉, 성공한 턴의 수

9. 난이도 증가 (stage.txt 기준으로 구현됨)

점수별 제한시간:
- 0~5점:  1.5초
- 6~10점: 1.0초
- 11~15점: 0.8초
- 16~20점: 0.5초
- 21~30점: 0.4초
- 31점~:  0.4 - (점수-30) × 0.001초 감소 (최소 0.1초)
  예: 31점→0.399초, 32점→0.398초

10. 추가 데이터 (게임 종료 시 표시)

* 총 점수 (잡은 두더지 수)
* 평균 반응속도(ms)
* 최고 반응속도(ms)


---

## 구현 완료 사항 (대화 이력)

### 파일 구조
- index.html / style.css / script.js (순수 HTML/CSS/JS, 라이브러리 없음)

### 스파이 두더지 구분
- 선글라스 유무만으로 구분 (몸색/얼굴색은 동일)
- 선글라스: `.spy-glasses` → `.mole.spy` 일 때만 `display: block`

### 폰트
- Pretendard CDN 적용 (jsdelivr)
- `font-family: 'Pretendard', 'Segoe UI', ...`

### 모바일 반응형
- CSS 변수 `--cell`, `--gap`, `--container-pad` 사용
- 그리드/두더지 크기가 `--cell` 기준으로 비례 스케일
- `@media (max-width: 540px)`: `--cell: min(100px, calc((100vw - 82px) / 4))`
- 보드가 화면 너비에 맞게 자동 축소됨

### 클릭 이펙트
1. **빨간 망치** (`.hammer`): 클릭 시 위에서 아래로 스윙 애니메이션
   - `@keyframes hammerSwing`: -60deg → 12deg → fade out (0.35s)
   - transform-origin: bottom center
2. **히트 버스트** (`.hit-burst` / `.burst-ray`): 8방향 광선 방사
   - CSS 변수 `--i` (0~7)로 각 광선 각도 계산: `rotate(calc(var(--i) * 45deg))`
   - 딜레이: `0.13s` (망치 히트 타이밍)
3. **별 스핀** (`.spin-stars` / `.star-orbit`): ★ 3개가 두더지 주위를 한 바퀴 공전
   - CSS 변수 `--s` (0~2): `rotate(calc(var(--s) * 120deg))`로 120° 간격 배치
   - `@keyframes starSpin`: 0° → 360° 공전하며 fade out (0.65s)
   - 딜레이: `0.13s`

### 슬로우 모션 (클릭 순간)
- **Web Animations API** (`document.getAnimations()`, `anim.playbackRate`) 사용, 라이브러리 없음
- 흐름: 클릭 → 애니메이션 시작 → **80ms 프리즈** → **0.35배속 슬로우** → 약 2.7초 후 정상 복귀
- `isSlowMo` 플래그로 슬로우 중 재클릭 방지
- 슬로우 종료 후 두더지 숨기기 + 게임 로직 처리 (스파이면 게임오버, 아니면 다음 턴)
- `SLOW_DURATION = FREEZE_MS + ceil(0.78 / SLOW_RATE * 1000) + 400` (ms)

### 주요 JS 전역 변수
```
score, reactionTimes, moleAppearTime, gameActive, turnTimer, nextTurnTimer, isSlowMo
```

### 주요 함수
- `initGrid()`: 16칸 생성 (mole, hammer, burst, stars 각 셀에 추가)
- `showMoles()`: 랜덤 3칸 선택, 스파이 1 배정, 제한시간 타이머 설정
- `handleClick(index)`: 클릭 처리 + 슬로우모션 제어
- `getTimeLimit()`: 점수별 제한시간 반환
- `startGame()` / `endGame(reason)`: 게임 시작/종료
