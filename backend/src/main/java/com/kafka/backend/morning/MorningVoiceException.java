package com.kafka.backend.morning;

/** Only fixed, safe codes cross the API boundary; no upstream exception details. */
public class MorningVoiceException extends RuntimeException {
    private final int status;
    private final String code;
    public MorningVoiceException(int status, String code) { super(code); this.status = status; this.code = code; }
    public int status() { return status; }
    public String code() { return code; }
}
