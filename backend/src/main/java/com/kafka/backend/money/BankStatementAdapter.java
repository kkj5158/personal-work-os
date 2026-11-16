package com.kafka.backend.money;

/** Providers implement exact, versioned extractable-table layouts; no catch-all OCR parser. */
public interface BankStatementAdapter {
 boolean supports(String provider,String format);
 MoneyStatementParser.Statement parse(byte[] bytes,String format,String provider);
}
