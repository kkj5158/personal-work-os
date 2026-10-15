package com.kafka.backend.money;

import java.util.Objects;

/** Stable financial reason codes are independent of account resolution and category status. */
final class MoneyAdmissionReasons {
 private MoneyAdmissionReasons(){}
 static String text(String code){return switch(Objects.toString(code,"")){
  case "ACCOUNT_RESOLUTION_REQUIRED","MISSING_OWN_SIDE" -> "내 계좌를 확인할 수 없습니다. 계좌 식별 정보를 확인하세요.";
  case "OPPOSITE_OWNER_ACCOUNT_UNRESOLVED" -> "반대 방향 알림의 소유 계좌가 미확인입니다. 이체 여부를 먼저 확인하세요.";
  case "SAME_ACCOUNT_ROUTE" -> "출발·도착 계좌가 같습니다. 금융 경로를 확인하세요.";
  case "ORDINARY_WORDING_RESTRICTION" -> "기존 일반 거래 문구 조건으로 등록이 제한되었습니다.";
  case "AMBIGUOUS_TRANSFER_PAIR" -> "이체 짝 후보가 여러 건입니다. 연결할 알림을 확인하세요.";
  case "LATE_POSTED_TRANSFER_SOURCE_OVERLAP","LATE_POSTED_TRANSFER_LINK_REQUIRED","LATE_POSTED_TRANSFER_REQUIRES_CONFIRMATION","LATE_TERMINAL_EVIDENCE_REQUIRES_CONFIRMATION" -> "늦게 도착한 이체 근거입니다. 기존 거래를 보존한 채 연결을 확인하세요.";
  case "POSSIBLE_ALREADY_POSTED_ROUTE","INDISTINGUISHABLE_TRANSFER_EVIDENCE","MULTIPLE_ATTEMPTS_SUPPLIED","POSSIBLE_DUPLICATE" -> "이미 기록된 거래와 중복되거나 알림 식별 근거가 충돌합니다.";
  case "MISSING_REQUIRED_FINANCIAL_FACTS","INCOMPLETE_CANDIDATE","MISSING_PARSE_ATTEMPT","UNRECOGNIZED_SHAPE" -> "알림의 금액·방향·시각 또는 금융 형식 확인이 필요합니다.";
  case "UNSUPPORTED_CURRENCY_OR_SOURCE","UNSUPPORTED" -> "지원되는 은행 알림 형식이나 원화 통화를 확인할 수 없습니다.";
  case "DEDICATED_FINANCIAL_OPERATION_REQUIRED","SPECIAL_FINANCIAL_OPERATION_REQUIRED","AUXILIARY_PRIMARY_MISSING_OR_AMBIGUOUS" -> "환불·대출·저축 등 전용 금융 확인이 필요합니다.";
  case "MISSING_ORDINARY_MOVEMENT_CONTEXT","UNMATCHED_OR_EXTERNAL_UNPROVEN","ORDINARY_EVIDENCE_REQUIRED" -> "일반 수입·지출 근거가 부족합니다. 금융 의미를 확인하세요.";
  case "UNRESOLVED_TRANSFER_INTENT","UNRESOLVED_TRANSFER_CANDIDATE" -> "반대 방향 알림과의 이체 여부를 확인하세요.";
  case "NET_GROSS_TRANSFER_CONFLICT" -> "이체 후보의 출금·입금 금액이 다릅니다. 원금·수수료를 확인하세요.";
  default -> "금융 처리가 완료되지 않았습니다. 검토 필요에서 근거를 확인하세요.";
 };}
}
