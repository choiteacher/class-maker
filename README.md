# 수업 PPT 요청서 만들기

교사가 수업 정보, 디자인 분위기, 페이지별 내용을 정리해 미리캔버스 수업 PPT 제작 요청서(.md / .txt)를 내려받는 정적 웹앱입니다. 요청서는 `@미리캔버스`로 시작하며, Claude가 템플릿과 폰트를 먼저 추천하고 선택받은 뒤 제작하도록 안내합니다.

## 사용법

1. **수업 정보와 디자인 입력:** 수업 대상·과목·수업 목표를 적고 분위기를 골라 주세요. 폰트·메인 색 등은 선택 사항입니다.
2. **페이지 구성:** 각 쪽의 제목과 내용을 적어 주세요. 최대 40쪽까지 추가·복제·이동할 수 있고, 제목 외의 세부 항목은 선택 사항입니다.
3. **미리보기와 내려받기:** 네 번째 단계에서 .md 또는 .txt를 고르고 ‘생성’을 누르세요. 내려받은 요청서를 미리캔버스 커넥터를 사용할 수 있는 Claude 또는 Claude Code 대화창에 올려 주세요. ‘복사’로 내용을 옮겨도 됩니다.

단계는 언제든 이동할 수 있습니다. 필수 입력이 빠졌다면 만들기 단계에서 안내와 수정할 단계로 가는 링크를 보여 줍니다.

입력은 현재 브라우저의 `localStorage`에 자동 저장되며 외부로 전송되지 않습니다. 공유 컴퓨터에서는 사용 후 ‘새로 쓰기’로 초안을 지워 주세요. 저장이 차단된 환경에서는 자동 저장이 되지 않아도 입력과 내려받기를 사용할 수 있습니다. 실제 학생 이름 등 개인정보를 입력하지 마세요.

글꼴 출처: 학교안심 그림일기 (KERIS, 헤움디자인) — 한글·영문 범위만 남겨 woff2로 변환

같은 github.io 주소의 다른 프로젝트와 브라우저 저장 공간을 공유하므로 개인정보를 입력하지 마세요.

## 접속 비밀번호 잠금

접속하면 비밀번호를 먼저 확인합니다. 로그인한 브라우저는 ‘로그아웃’을 누르기 전까지 로그인 상태를 기억하며, 로그아웃해도 작성 중인 초안은 남습니다. 저장 공간이 차단된 브라우저에서는 현재 방문 동안만 이용할 수 있습니다. 비밀번호가 연속 5회 틀리면 30초 뒤 다시 입력할 수 있습니다.

이 잠금은 브라우저에서만 비밀번호를 확인하는 간단한 잠금입니다. 코드를 아는 사람은 우회할 수 있으므로 중요한 정보를 보호하는 인증 수단으로 사용하지 마세요.

비밀번호를 변경하려면 Node.js 24에서 새 salt와 PBKDF2-HMAC-SHA256 해시(32바이트)를 만든 뒤 `js/auth.js`의 `DEFAULT_PARAMS`에 있는 `saltHex`, `iterations`, `hashHex` 세 값을 교체하세요. 비밀번호 문자열은 UTF-8로 처리하며 앞뒤 공백도 그대로 사용합니다. 다음 PowerShell 명령의 `새비밀번호`는 자리표시자입니다. 실제 비밀번호 원문을 소스나 문서에 저장하지 마세요.

```powershell
$env:CLASS_MAKER_NEW_PASSWORD = '새비밀번호'
@'
import { randomBytes, pbkdf2Sync } from "node:crypto";
const password = process.env.CLASS_MAKER_NEW_PASSWORD;
const salt = randomBytes(16);
const iterations = 210000;
console.log(JSON.stringify({
  saltHex: salt.toString("hex"),
  iterations,
  hashHex: pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("hex"),
}, null, 2));
'@ | node --input-type=module
Remove-Item Env:\CLASS_MAKER_NEW_PASSWORD
```

해시가 바뀌면 기존 브라우저에서도 새 비밀번호로 다시 로그인해야 합니다. 이 절차는 서버로 비밀번호를 보내지 않습니다. Web Crypto를 사용하므로 HTTPS 또는 로컬의 `http://localhost`에서 실행하세요.

## 로컬 실행

프로젝트 폴더에서 PowerShell로 실행합니다. Python과 Node.js는 별도로 설치되어 있어야 합니다. npm 설치나 빌드는 필요 없습니다.

```powershell
Set-Location 'D:\Program\웹앱\class_maker'
python -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 `http://localhost:8000`에 접속하세요. ES 모듈을 사용하므로 `index.html`을 `file://` 주소로 직접 열면 동작하지 않습니다. 서버 종료는 `Ctrl+C`입니다. 클립보드가 지원되지 않거나 권한이 거부되면 미리보기의 글을 직접 선택해서 복사할 수 있습니다.

## 테스트

프로젝트 폴더에서 실행합니다.

```powershell
node --check js/app.js
node --check js/auth.js
node --test
```

브라우저에서는 360px 너비와 데스크톱에서 네 단계 입력, .md/.txt 첫 줄 `@미리캔버스`, 자동 저장 복원, 페이지 0개·40개, 클립보드 거부, 키보드 포커스와 다크 모드를 확인합니다. `js/generator.js`는 요청서 생성 모듈이며 화면을 실행할 때 함께 있어야 합니다.

잠금 화면에서는 비밀번호 입력 전 탭으로 작성 화면에 접근할 수 없는지, 로그인 후 새로고침·브라우저 재실행 시 유지되는지, 로그아웃 후 초안이 남는지, 연속 5회 실패 시 30초 동안 입력이 막히는지 확인합니다. 저장소를 차단한 경우에도 로그인 후 안내 문구가 보이고 현재 방문 동안 작성할 수 있어야 합니다.

## GitHub Pages 배포

파일을 GitHub 저장소의 `main` 브랜치 루트에 올린 뒤 **Settings → Pages → Build and deployment → Source: Deploy from a branch → main / (root) → Save**를 선택합니다. 배포가 끝나면 Pages에 표시된 주소로 접속하세요. `.nojekyll`을 포함한 폴더 구조를 그대로 유지합니다. 별도 백엔드나 API 키는 필요 없습니다.
