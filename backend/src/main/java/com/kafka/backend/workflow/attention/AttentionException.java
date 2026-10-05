package com.kafka.backend.workflow.attention;

/** Fixed safe error codes; never exception-derived source contents. */
public final class AttentionException extends RuntimeException {
    private final int status;private final String code;private final AttentionTypes.Item latest;private final Long queueRevision;
    public AttentionException(int status,String code){this(status,code,null,null);}
    public AttentionException(int status,String code,AttentionTypes.Item latest,Long queueRevision){super(code);this.status=status;this.code=code;this.latest=latest;this.queueRevision=queueRevision;}
    public int status(){return status;}public String code(){return code;}public AttentionTypes.Item latest(){return latest;}public Long queueRevision(){return queueRevision;}
}
