package com.kafka.backend.study;

class StudyException extends RuntimeException {
  final int status;
  final String code;

  StudyException(int status, String code, String message) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static StudyException invalid() {
    return new StudyException(400, "INVALID_STUDY_DATA", "학습 데이터 형식 또는 버전 연결을 확인하세요.");
  }

  static void require(boolean condition) {
    if (!condition) throw invalid();
  }

  static StudyException missing() {
    return new StudyException(404, "NOT_FOUND", "학습 항목을 찾을 수 없습니다.");
  }

  static StudyException conflict() {
    return new StudyException(409, "REVISION_CONFLICT", "다른 요청에서 변경되었습니다. 새로고침 후 다시 시도하세요.");
  }
}
