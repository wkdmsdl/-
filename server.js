// 서버: 휴대폰 화면(public/index.html)과 OCR·알레르기 분석 코드를 연결
//
// 실행:  npm start
// 접속:  PC → http://localhost:3000
//        휴대폰 → 터미널에 뜨는 QR 코드를 카메라로 찍기 (PC와 같은 와이파이여야 함)

const express = require("express");
const multer = require("multer");
const os = require("os");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");

const { analyze, ALIAS } = require("./allergy_analyzer");
const { analyzeImage } = require("./ocr_test");

const PORT = process.env.PORT || 3000;
const app = express();

// 업로드 사진은 디스크에 저장하지 않고 메모리에서만 분석 후 버린다 (이미지 보관 정책: 분석 후 즉시 삭제)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/"))
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// "마늘,토마토" 또는 ["마늘","토마토"] → ["마늘","토마토"]
function parseAllergies(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(",");
  return [...new Set(list.map(v => String(v).trim()).filter(Boolean))].slice(0, 20);
}

function loadMenus() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "food_data.json"), "utf-8")).foods;
}

// 선택할 수 있는 알레르기 목록
app.get("/api/allergies", (req, res) => {
  res.json({ allergies: Object.keys(ALIAS) });
});

// 메뉴판: 사용자 알레르기 기준으로 메뉴마다 위험/주의/안전 판정
app.get("/api/menus", (req, res) => {
  const allergies = parseAllergies(req.query.allergies);

  const menus = loadMenus().map(food => ({
    id: food.id,
    name: food.name,
    product: food.product,
    ingredientsText: food.ingredients_text,
    facilityText: food.facility_text,
    ...analyze({
      ingredientsText: food.ingredients_text,
      facilityText: food.facility_text,
      allergies
    })
  }));

  res.json({ allergies, menus });
});

// 성분표 사진 분석
app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "사진 파일을 올려 주세요." });
  }

  const allergies = parseAllergies(req.body.allergies);
  if (allergies.length === 0) {
    return res.status(400).json({ error: "알레르기를 하나 이상 선택해 주세요." });
  }

  try {
    const started = Date.now();
    const result = await analyzeImage(req.file.buffer, allergies);
    res.json({ allergies, ...result, elapsedMs: Date.now() - started });
  } catch (error) {
    console.error("분석 오류:", error);
    res.status(500).json({ error: "사진을 분석하지 못했습니다. 다른 사진으로 다시 시도해 주세요." });
  }
});

// 같은 와이파이에 있는 휴대폰이 접속할 PC 주소 찾기
function getLocalAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

app.listen(PORT, "0.0.0.0", () => {
  const url = `http://${getLocalAddress()}:${PORT}`;

  console.log("\n================================");
  console.log(" 알레르기 탐지 서버 실행 중");
  console.log("================================");
  console.log(` PC에서 열기:     http://localhost:${PORT}`);
  console.log(` 휴대폰에서 열기: ${url}`);
  console.log(" (휴대폰은 PC와 같은 와이파이에 연결되어 있어야 합니다)\n");
  qrcode.generate(url, { small: true });
  console.log("\n 끄려면 Ctrl + C");
});
