import os
import re

import cv2
import numpy as np
import pytesseract

TESSERACT_PATH = os.environ.get(
    "TESSERACT_CMD", r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)
if os.path.exists(TESSERACT_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH

MIN_SIDE = 1600   # 작은 이미지는 확대 (라벨 글씨가 작음)
MAX_SIDE = 3000   # 너무 큰 사진은 축소 (속도)
SCORE_KEYWORDS = ["원재료", "알레르기", "함유", "제조", "품목", "원산지", "대두", "우유", "밀"]


class InvalidImageError(Exception):
    pass


class OCRError(Exception):
    pass


def decode_image(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise InvalidImageError("이미지를 읽을 수 없습니다.")
    return img


def _resize(img: np.ndarray) -> np.ndarray:
    side = max(img.shape[:2])
    if side < MIN_SIDE:
        scale = MIN_SIDE / side
        return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    if side > MAX_SIDE:
        scale = MAX_SIDE / side
        return cv2.resize(img, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return img


def _variants(img: np.ndarray) -> dict[str, np.ndarray]:
    gray = cv2.cvtColor(_resize(img), cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    _, otsu = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    adaptive = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
    )
    return {"gray": gray, "otsu": otsu, "adaptive": adaptive}


def _score(text: str) -> int:
    """한글이 많고 라벨 핵심 단어가 많이 보일수록 높은 점수."""
    compact = re.sub(r"\s+", "", text)
    hangul = len(re.findall(r"[가-힣]", compact))
    hits = sum(k in compact for k in SCORE_KEYWORDS)
    return hangul + hits * 30


def extract_lines(img: np.ndarray) -> list[str]:
    best_text, best_score = "", -1
    try:
        for image in _variants(img).values():
            text = pytesseract.image_to_string(image, lang="kor+eng", config="--psm 6")
            score = _score(text)
            if score > best_score:
                best_text, best_score = text, score
    except Exception as e:  # Tesseract 미설치, 언어 데이터 없음 등
        raise OCRError(str(e)) from e
    return [ln.strip() for ln in best_text.splitlines() if ln.strip()]
    