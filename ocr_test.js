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
// 사진 전처리
// 성분표 글씨는 작아서 그대로 넣으면 대부분 놓친다.
// 1) 확대  2) 흑백  3) 대비 보정  4) 선명하게
// ========================================

async function preprocess(image) {
  const base = sharp(image).rotate().removeAlpha(); // rotate(): 휴대폰 사진 방향 바로잡기
  const { width } = await base.metadata();
  const targetWidth = Math.max(2000, width || 0);

  return sharp(image)
    .rotate()
    .removeAlpha()
    .resize({ width: Math.min(targetWidth, 4000) })
    .grayscale()
    .normalize()
    .sharpen()
    .toBuffer();
}

// ========================================
// 어두운 배경 + 흰 글씨 줄 찾기
// "알레르기 유발 물질" 칸처럼 검은 띠에 흰 글씨로 적힌 줄은
// 일반 OCR이 못 읽으므로, 그 부분만 잘라서 색을 뒤집어 다시 읽는다.
// ========================================

async function findDarkBands(image) {
  const { data: px, info } = await sharp(image)
    .rotate()
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const W = info.width;
  const H = info.height;
  const DARK = 90;

  const darkRatioOfRow = y => {
    let count = 0;
    for (let x = 0; x < W; x++) if (px[y * W + x] < DARK) count++;
    return count / W;
  };

  // 1) 어두운 가로줄 범위 찾기
  const bands = [];
  let start = -1;
  for (let y = 0; y <= H; y++) {
    const ratio = y < H ? darkRatioOfRow(y) : 0;
    if (ratio > 0.4) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      if (y - start >= 8) bands.push([start, y]);
      start = -1;
    }
  }

  // 2) 각 줄에서 어두운 부분의 왼쪽/오른쪽 끝 찾기
  return bands.map(([top, bottom]) => {
    let left = -1;
    let right = -1;
    for (let x = 0; x < W; x++) {
      let count = 0;
      for (let y = top; y < bottom; y++) if (px[y * W + x] < DARK) count++;
      if (count / (bottom - top) > 0.5) {
        if (left < 0) left = x;
        right = x;
      }
    }
    return { left, top, width: right - left + 1, height: bottom - top };
  }).filter(b => b.left >= 0 && b.width > 20);
}

async function readDarkBands(worker, image) {
  const bands = await findDarkBands(image);
  const texts = [];

  for (const band of bands) {
    const buffer = await sharp(image)
      .rotate()
      .removeAlpha()
      .extract(band)
      .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 0, g: 0, b: 0 } })
      .resize({ height: (band.height + 20) * 3 })
      .grayscale()
      .negate({ alpha: false })
      .normalize()
      .threshold(150)
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
  await worker.setParameters({ tessedit_pageseg_mode: "6" });

  const mainBuffer = await preprocess(image);
  const { data } = await worker.recognize(mainBuffer);
  const bandTexts = await readDarkBands(worker, image);

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
