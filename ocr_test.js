// 팀원 C: 성분표 사진 → (전처리) → OCR → 알레르기 분석
//
// 터미널에서 실행:
//   node ocr_test.js              (food.png 분석)
//   node ocr_test.js 라면.png      (다른 사진 분석)
//
// 다른 파일(서버)에서 사용:
//   const { analyzeImage } = require("./ocr_test");
//   const result = await analyzeImage("사진경로 또는 Buffer", ["마늘", "토마토"]);

const sharp = require("sharp");
const { createWorker } = require("tesseract.js");
const { analyzeText } = require("./allergy_analyzer");

const DEFAULT_ALLERGIES = ["마늘", "토마토"];

// ========================================
// OCR 엔진 (한 번만 켜 두고 계속 재사용 → 두 번째 사진부터 빨라짐)
// kor/eng.traineddata 파일을 이 폴더에서 읽는다 (인터넷 없이 동작)
// ========================================

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker("kor+eng", 1, {
      langPath: __dirname,
      cachePath: __dirname,
      gzip: false
    });
  }
  return workerPromise;
}

async function closeWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

// ========================================
// 사진 전처리 (휴대폰 사진 대응)
// 1) 크기 맞추기 + 흑백
// 2) 그림자 제거: 원본 ÷ 크게 흐린 배경 → 조명이 고르지 않아도 글씨만 남음
// 3) 기울기 보정: -12° ~ +12° 돌려 보며 글씨 줄이 가장 가지런한 각도 찾기
// ========================================

async function toGray(image) {
  const meta = await sharp(image).rotate().metadata(); // rotate(): 휴대폰 사진 방향(EXIF) 바로잡기
  const w = (meta.autoOrient && meta.autoOrient.width) || meta.width || 1800;
  const width = Math.min(3000, Math.max(1800, w)); // 작으면 키우고, 너무 크면 줄임(속도)
  return sharp(image).rotate().removeAlpha().grayscale().resize({ width }).png().toBuffer();
}

async function removeShadow(gray) {
  const { width } = await sharp(gray).metadata();
  const backgroundInverted = await sharp(gray)
    .blur(Math.max(10, width / 50))
    .negate({ alpha: false })
    .png()
    .toBuffer();
  // colour-dodge 합성 = 원본 ÷ 배경
  return sharp(gray)
    .composite([{ input: backgroundInverted, blend: "colour-dodge" }])
    .grayscale()
    .png()
    .toBuffer();
}

async function findSkewAngle(image) {
  const small = await sharp(image).resize({ width: 700 }).normalize().threshold(150).png().toBuffer();
  let bestAngle = 0;
  let bestScore = -1;

  for (let angle = -12; angle <= 12; angle += 0.5) {
    const { data, info } = await sharp(small)
      .rotate(angle, { background: "#ffffff" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 줄마다 검은 점 개수의 제곱 합: 글씨 줄이 수평일수록 커진다
    let score = 0;
    for (let y = 0; y < info.height; y++) {
      let count = 0;
      for (let x = 0; x < info.width; x++) if (data[y * info.width + x] < 128) count++;
      score += count * count;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAngle = angle;
    }
  }
  return bestAngle;
}

// ========================================
// 어두운 배경 + 흰 글씨 줄 찾기
// "알레르기 유발 물질" 칸처럼 검은 띠에 흰 글씨로 적힌 줄은
// 일반 OCR이 못 읽으므로, 그 부분만 잘라서 색을 뒤집어 다시 읽는다.
// ========================================

async function findDarkBands(image) {
  const { data: px, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const C = info.channels;
  const at = (x, y) => px[(y * W + x) * C];

  // "어둡다"의 기준을 사진 밝기에 맞춰 정한다 (밝은 쪽 상위 10% 밝기의 45%)
  const samples = [];
  for (let i = 0; i < 5000; i++) samples.push(px[Math.floor(Math.random() * W * H) * C]);
  samples.sort((a, b) => a - b);
  const DARK = samples[Math.floor(samples.length * 0.9)] * 0.45;

  const bands = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    let count = 0;
    if (y < H) for (let x = 0; x < W; x++) if (at(x, y) < DARK) count++;
    if (count / W > 0.3) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= H / 150) bands.push([start, y]);
      start = -1;
    }
  }

  return bands.map(([top, bottom]) => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < W; x++) {
      let count = 0;
      for (let y = top; y < bottom; y++) if (at(x, y) < DARK) count++;
      if (count / (bottom - top) > 0.5) {
        if (left < 0) left = x;
        right = x;
      }
    }
    return { left, top, width: right - left + 1, height: bottom - top };
  }).filter(b => b.left >= 0 && b.width > W * 0.1);
}

async function readDarkBands(worker, image) {
  const texts = [];
  for (const band of await findDarkBands(image)) {
    const buffer = await sharp(image)
      .extract(band)
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: "#000000" })
      .negate({ alpha: false })
      .normalize()
      .png()
      .toBuffer();
    const { data } = await worker.recognize(buffer);
    texts.push(data.text.trim());
  }
  return texts.filter(Boolean);
}

// ========================================
// 사진 → OCR 글자
// ========================================

async function readImage(image) {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: "6", user_defined_dpi: "300" });

  const gray = await toGray(image);
  const flat = await removeShadow(gray);
  const angle = await findSkewAngle(flat);

  const straightFlat = await sharp(flat).rotate(angle, { background: "#ffffff" }).normalize().png().toBuffer();
  const straightGray = await sharp(gray).rotate(angle, { background: "#ffffff" }).png().toBuffer();

  const { data } = await worker.recognize(straightFlat);
  const bandTexts = await readDarkBands(worker, straightGray);

  // 뒤집어 읽은 줄은 마침표로 끝내서 앞뒤 문장과 섞이지 않게 한다
  return [data.text.trim(), ...bandTexts.map(t => t.replace(/\.?$/, "."))].join("\n");
}

// ========================================
// 사진 한 장 분석
// 반환: { ocrText, status, statusText, directMatches, facilityMatches }
// ========================================

async function analyzeImage(image, allergies = DEFAULT_ALLERGIES) {
  const ocrText = await readImage(image);
  const result = analyzeText(ocrText, allergies);
  return { ocrText, ...result };
}

// ========================================
// 결과 출력
// ========================================

function printResult(result, allergies) {
  console.log("\n================================");
  console.log("           OCR 결과");
  console.log("================================\n");
  console.log(result.ocrText);

  console.log("\n================================");
  console.log("      최종 알레르기 분석 결과");
  console.log("================================");

  for (const allergy of allergies) {
    console.log(`\n[${allergy}]`);

    if (result.directMatches.includes(allergy)) {
      console.log(`🔴 위험: 원재료에 ${allergy} 성분이 들어 있습니다.`);
    } else if (result.facilityMatches.includes(allergy)) {
      console.log(`🟡 주의: ${allergy} 사용 제품과 같은 제조시설에서 제조됩니다.`);
    } else {
      console.log(`✅ OCR 결과에서 ${allergy} 성분이 확인되지 않았습니다.`);
    }
  }

  console.log(`\n종합 판정: ${result.status}`);
  console.log(result.statusText);
}

// ========================================
// 프로그램 실행
// ========================================

if (require.main === module) {
  const imagePath = process.argv[2] || "./food.png";

  console.log(`OCR 시작... (${imagePath})`);

  analyzeImage(imagePath, DEFAULT_ALLERGIES)
    .then(result => {
      printResult(result, DEFAULT_ALLERGIES);
      console.log("\n================================");
      console.log("OCR + 알레르기 분석 완료");
      console.log("================================");
    })
    .catch(error => {
      console.error("분석 중 오류가 발생했습니다:", error.message);
      process.exitCode = 1;
    })
    .finally(closeWorker);
}

module.exports = { analyzeImage, readImage, closeWorker };
