package com.kafka.backend.naverarchive;
public class ArchiveException extends RuntimeException {
 final int status;
 ArchiveException(int status,String message){super(message);this.status=status;}
}
