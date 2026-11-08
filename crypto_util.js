// crypto_util.js
// 사용자의 알레르기 정보 등 민감한 건강정보를 DB에 넣기 전에 암호화하는 도구 모음

const crypto = require("crypto");

// 1. 암호화 열쇠(KEY) 준비
// .env 파일에 저장된 HEALTH_KEY(64글자)를 가져와서 32바이트 길이의 진짜 열쇠로 만듭니다.
// 코드에 열쇠를 직접 적어두면 깃허브를 통해 털릴 수 있으므로 꼭 환경변수(.env)에서 가져옵니다.
const KEY = Buffer.from(process.env.HEALTH_KEY, "hex");

// ========================================
// 암호화 함수 (DB에 저장할 때 사용)
// ========================================
function encrypt(text) {
  // 매번 똑같은 알레르기를 암호화해도 결과값이 다르게 나오도록 12바이트짜리 무작위 값을 생성합니다 (IV).
  const iv = crypto.randomBytes(12);
  
  // AES-256-GCM 이라는 강력한 암호화 방식을 사용하겠다고 설정합니다.
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  
  // 실제 글자(text)를 암호문으로 바꿉니다.
  const enc = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  
  // 누군가 DB 내용을 몰래 조작했는지 확인할 수 있는 '인증 태그'를 뽑아냅니다.
  const tag = cipher.getAuthTag();

  // 나중에 복호화할 때 필요한 재료들(무작위 값 + 인증 태그 + 암호문)을 하나로 합쳐서
  // DB의 TEXT 컬럼에 쏙 들어가는 깔끔한 문자열(base64)로 만들어 반환합니다.
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

// ========================================
// 복호화 함수 (DB에서 꺼내서 쓸 때 사용)
// ========================================
function decrypt(data) {
  // DB에 저장되어 있던 긴 문자열을 다시 조각조각 나눌 수 있도록 버퍼로 바꿉니다.
  const buf = Buffer.from(data, "base64");
  
  // 암호화할 때 합쳤던 순서대로 다시 잘라냅니다.
  const iv = buf.subarray(0, 12);       // 처음 12바이트는 무작위 값(IV)
  const tag = buf.subarray(12, 28);     // 다음 16바이트는 인증 태그
  const enc = buf.subarray(28);         // 나머지는 진짜 암호문

  // 암호를 풀 준비를 합니다.
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  
  // DB 내용이 조작되지 않았는지 인증 태그를 세팅해서 확인합니다.
  decipher.setAuthTag(tag);
  
  // 암호를 원래의 알아볼 수 있는 글자로 완벽하게 풀어서 반환합니다.
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// 다른 파일(예: 회원가입 API 등)에서 이 두 함수를 가져다 쓸 수 있게 내보냅니다.
module.exports = { encrypt, decrypt };
