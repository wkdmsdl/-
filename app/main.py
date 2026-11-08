from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse

from .analyzer import analyze_label
from .ocr import InvalidImageError, OCRError, decode_image, extract_lines
from .schemas import AnalyzeResponse, ErrorInfo

app = FastAPI(title="Allergy Label API")

MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10MB
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def error_response(status_code: int, code: str, message: str) -> JSONResponse:
    body = AnalyzeResponse(success=False, error=ErrorInfo(code=code, message=message))
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


@app.post("/api/v1/label/analyze", response_model=AnalyzeResponse)
async def analyze(
    image: UploadFile = File(...),
    allergies: str = Form(""),   # 예: "우유,땅콩" (앱의 사용자 알레르기 설정값)
):
    if image.content_type not in ALLOWED_TYPES:
        return error_response(400, "INVALID_IMAGE", "지원하지 않는 이미지 형식입니다. (jpg, png, webp)")
    data = await image.read()
    if not data:
        return error_response(400, "INVALID_IMAGE", "빈 파일입니다.")
    if len(data) > MAX_IMAGE_BYTES:
        return error_response(413, "IMAGE_TOO_LARGE", "이미지 용량은 10MB 이하여야 합니다.")
    try:
        img = decode_image(data)
    except InvalidImageError:
        return error_response(400, "INVALID_IMAGE", "이미지를 읽을 수 없습니다.")

    try:
        lines = extract_lines(img)
    except OCRError:
        return error_response(500, "OCR_FAILED", "글자 인식 중 오류가 발생했습니다. 다시 촬영해 주세요.")
    if not lines:
        return error_response(422, "EMPTY_RESULT", "글자를 찾지 못했습니다. 원재료표가 잘 보이게 다시 촬영해 주세요.")

    user_allergies = [a.strip() for a in allergies.split(",") if a.strip()]
    result = analyze_label(lines, user_allergies)

    return AnalyzeResponse(
        success=True,
        verdict=result.verdict,
        message=result.message,
        findings=result.findings,
        ocr_text="\n".join(lines),
    )