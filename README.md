# Learning Stats (크레버스 온라인 학습 통계)

ERP·콘텐츠 학습 raw 엑셀을 올리면 **브랜드·학기·주차·월·직/가맹·학원·알파/4.0·프로그램·레벨·학년·반·콘텐츠·학습유형** 어느 조합으로든
**온라인 수강률**과 **학습 완료율**을 바로 잘라 보는 사내 웹 서비스입니다. 화면 스타일은 Content Checker(Creverse QC)와 같습니다.

- 소유 계정: **ulcdap@gmail.com** (GitHub · Vercel · Supabase · Resend 모두 이 계정으로 만듭니다)
- 슈퍼어드민: kykim@creverse.com, jy_cha@creverse.com (마이그레이션에서 등록)
- 그 밖의 사람: 회사 이메일로 가입 신청 → 슈퍼어드민이 [관리 > 계정]에서 승인해야 로그인

## 아키텍처 (Content Checker와 같은 구성)

```
브라우저 ──▶ web (Next.js 14 / Vercel) ──▶ Supabase Postgres (stat_* 테이블 + stat_* SQL 함수)
   │                                   └─▶ Resend (가입 승인 요청·승인 안내·비밀번호 설정 메일)
   └ 엑셀은 브라우저에서 읽고(SheetJS), 정규화된 숫자만 3,000행씩 API로 보냄
```

| | Content Checker | Learning Stats |
|---|---|---|
| 프론트/API | Next.js 14 App Router + Tailwind, Vercel | 같음 (globals.css, tailwind 설정, PointerField 그대로) |
| DB | Supabase, 서비스 롤 키는 서버에서만 | 같음. 테이블·함수는 모두 `stat_` 접두사 → 한 Supabase 프로젝트에 여러 서비스를 같이 둘 수 있음 |
| 세션 | iron-session 쿠키 | 같음 (`creverse_stats_session`) |
| 메일 | Resend | 같음 |
| 업로드 | 브라우저 → Storage 직접 PUT (4.5MB 제한 회피) | 브라우저에서 파싱 → 숫자만 청크 전송 (원본 파일은 서버에 남지 않음) |
| 워커 | Railway | 필요 없음 (집계는 Postgres 함수) |

모든 DB 접근은 `supabase/migrations/0001_init.sql`의 `stat_*` 함수(jsonb 하나 받고 jsonb 반환)를 `supabase.rpc()`로 부릅니다.
그래서 같은 SQL이 **로컬에서는 PGlite(프로세스 안 Postgres)**, 운영에서는 Supabase에서 똑같이 돕니다 (`web/lib/db.ts`).

## 데이터 모델

샘플 자료를 분석해 보면 모든 보고서가 두 지표의 피벗입니다.

| 지표 | 분모 | 분자 | 원천 |
|---|---|---|---|
| 온라인 수강률 (`enroll`) | 현원생(재원생) | 수강생(학습대상자) | ERP > Report > i-Learning 수강률, 주간 집계 시트 |
| 학습 완료율 (`complete`) | 학습해야 할 건수 (`total`) | 학습 완료 건수 (`complete_total`) | ERP > i-Learning 학습률, 콘텐츠 학습 raw (CV, Buff, MeMe, Vena Talk …) |

- `stat_facts` 한 행 = (브랜드, 학기, 주차, 주 시작일, 직/가맹, 학원, 알파, 프로그램, 레벨, 레벨그룹, 학년, 반, 콘텐츠, 학습유형) × (분모, 분자)
- 비율은 항상 **분자 합 ÷ 분모 합** (가중 평균). 수강률의 현원생·수강생은 여러 주를 묶으면 **주 평균**으로 보여 줍니다(브랜드별로 평균 낸 뒤 합산).
- 월별 보기는 업로드 때 "1주차 시작일"을 넣었거나 주차 이름에 날짜(`Week 1 08-31~09-06`)가 있을 때 생깁니다.
- `stat_branches`(학원 정보): 직/가맹·알파 여부·예전 이름. 업로드할 때 자동으로 채워지고, 학원별 표에 직/가맹 열이 없는 파일(i-GARTEN 등)에 채워 넣습니다. 이름이 바뀐 학원(예: 강릉제1 → 강릉)은 별칭으로 묶습니다.
- 같은 브랜드·학기·주차·콘텐츠를 다시 올리면 "기존 행 대체"를 물어봐서 이중 집계를 막습니다.

### 업로드가 알아보는 형식 (`web/lib/ingest.ts`)

| 형식 | 예 | 처리 |
|---|---|---|
| 머리글 한 줄짜리 raw | `25CDI_CV…원본raw data`, `25년 buff`, `MeMe raw`, `AP_v-class 24봄` | 열 이름으로 자동 매핑 (`brch_name`, `week_name`, `total`, `complete_total`, `학습해야할 건수` …) |
| ERP 피벗 내보내기 | `i-Learning 수강률w1~w9` | 머리글 행 찾기, 병합 셀(Week·구분) 아래로 채우기, `가맹 Total`·`Week 9 Total` 행 제외, "구분" 열은 값(직영/가맹)으로 판별 |
| 표가 나란히 있는 작업 시트 | `April … 26_가을학기_Week9` (학원별 A–F, 레벨별 H–M) | 왼쪽 raw 표를 기본 선택, 다른 표도 고를 수 있음 |
| 시트가 주차/학기별로 나뉜 파일 | `26_가을학기_Week1..9`, `26' 2학기 Week10`, `봄/여름/가을/겨울` | 시트 여러 개를 한 번에, 학기·주차는 시트·파일 이름에서 (`25년 buff` + `봄` → 25 봄) |

샘플로 검증한 결과: April 26 가을 9주차 = 현원생 22,766 / 수강생 18,695 / **82.1%**, 116개 학원 중 80% 미만 42곳·60% 미만 27곳 — 기존 주간 보고와 일치.

이미 가공된 교차표(예: `CD_…_2026_가을`의 초/중/고 × 직영/가맹 표, `학기별 통계`, 월별 요약)는 **결과물**이라 올리지 않습니다. 그 원본인 ERP 내보내기를 올리면 같은 표가 분석 화면에서 나옵니다.
e-Library 구간별 완독 분포(학생 단위 분포)는 이번 범위에 없습니다.

## 화면

- **분석**: 지표 전환, 브랜드·학기·주차 범위 + 원하는 차원 필터, 행/열 자유 배치, 추이(선)·순위(막대) 차트, 80%/60% 미만 강조 표, 엑셀 내보내기, 링크 공유, 보고서 저장
  - 기본 보기 10종: 학원별 수강률(최신 주), 학기별 주차 추이, 직/가맹·레벨별 주차 추이, 브랜드별 월간·학기 추이, 직/가맹·레벨별 완료율 추이(Vena Talk 보고 형식), 프로그램·레벨 완료율, 콘텐츠별 주차 완료율
- **데이터 올리기**: 파일 → 시트 선택 → 열 맞추기(자동) → 브랜드·학기 등 확인 → 미리보기(합계·비율 즉시 계산) → 올리기
- **데이터셋**: 올린 묶음 목록, 이름·메모 수정, 삭제 (올린 사람 또는 슈퍼어드민)
- **관리** (슈퍼어드민): 가입 승인/거절, 권한·사용 중지·비밀번호 초기화, 학원 정보(직/가맹·알파·별칭), 내 비밀번호

## 로컬 개발

```bash
cd web
npm install
npm run dev          # .env.local이 없으면 web/.pglite에 로컬 Postgres를 만들고 마이그레이션을 자동 실행
npm run set-password -- kykim@creverse.com   # 로컬(또는 .env.local의 Supabase) 계정 비밀번호 직접 지정
```

메일 키가 없으면 메일 내용과 링크가 서버 콘솔에 찍힙니다.

## 배포 (회사 계정 ulcdap@gmail.com)

1. **GitHub**: ulcdap 계정(또는 그 조직)에 저장소를 만들고 이 폴더(`projects/statistics`)를 올립니다. `sample/`은 .gitignore로 제외됩니다.
2. **Supabase**: 새 프로젝트 → SQL Editor에서 `supabase/migrations/0001_init.sql` 실행. 이 파일은 다시 실행해도 안전합니다(함수만 갱신).
   - 다른 사내 서비스도 같은 프로젝트로 옮길 계획이면 하나의 프로젝트에 접두사(`stat_`, QC는 기존 테이블명)로 나눠 두면 됩니다.
3. **Resend**: 발신 도메인 인증 후 API 키 발급.
4. **Vercel**: 저장소 import, Root Directory = `web`. 환경 변수는 `web/.env.example` 기준
   (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `APP_URL`, `SIGNUP_ALLOWED_DOMAINS`).
5. 첫 로그인: 두 슈퍼어드민은 로그인 화면 **비밀번호 찾기**로 메일을 받아 비밀번호를 정합니다 (메일 연결 전이면 `npm run set-password`).

## 기존 프로젝트 마이그레이션 메모

Content Checker도 같은 조합(Vercel + Supabase + Resend, 워커만 Railway)이라 ulcdap 계정으로 옮길 때는
① 새 Supabase 프로젝트에 각 서비스 마이그레이션 실행 → ② 데이터 이관(pg_dump/restore 또는 CSV) → ③ Vercel 프로젝트 재연결·환경 변수 교체 → ④ Resend 도메인 이전 순서로 하면 됩니다.
이 프로젝트는 테이블이 모두 `stat_` 접두사라 같은 Supabase 프로젝트에 함께 둬도 충돌하지 않습니다.
