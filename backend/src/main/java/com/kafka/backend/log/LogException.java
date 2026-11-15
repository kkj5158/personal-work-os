package com.kafka.backend.log;

class LogException extends RuntimeException {
  final int status;

  LogException(int status, String message) {
    super(message);
    this.status = status;
  }
}
