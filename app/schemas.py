from enum import Enum
from typing import Optional
from pydantic import BaseModel


class Level(str, Enum):
    CONTAINS = "contains"            # 알레르기 표시 문구에 포함
    INGREDIENT = "ingredient"        # 원재료명에서 발견
    CROSS_CONTACT = "cross_contact"  # 같은 제조시설 등 혼입 가능성


class Verdict(str, Enum):
    DANGER = "danger"              # 내 알레르기 성분 포함
    CAUTION = "caution"            # 혼입 가능성
    NOT_DETECTED = "not_detected"  # 인식 범위에서는 발견 안 됨
    UNREADABLE = "unreadable"      # 인식 실패 (재촬영 필요)
    INFO = "info"                  # 사용자 알레르기 설정이 없을 때


class AllergenFinding(BaseModel):
    allergen: str
    level: Level
    evidence: str              # OCR 텍스트 중 근거 부분
    is_user_allergen: bool


class ErrorInfo(BaseModel):
    code: str
    message: str


class AnalyzeResponse(BaseModel):
    success: bool
    verdict: Optional[Verdict] = None
    message: str = ""
    findings: list[AllergenFinding] = []
    ocr_text: str = ""         # 확인/디버그용 OCR 원문
    error: Optional[ErrorInfo] = None
    