package com.kafka.backend.workflow.attention;

import java.time.Instant;
import java.util.*;

public final class AttentionTypes {
    private AttentionTypes(){}
    public record Source(String kind,String reference,String url,String producer,String intent,String generation,String completionPolicy,Instant authoredAt,String summary,String summaryOrigin){
        public Source(String kind,String reference,String url,String producer,String intent,String generation,String completionPolicy,Instant authoredAt){this(kind,reference,url,producer,intent,generation,completionPolicy,authoredAt,null,null);}
    }
    public record Lane(UUID id,String name,int order,long revision){}
    public record Item(UUID id,String action,UUID projectId,String projectLabel,String displayTitle,UUID workTaskId,String status,UUID laneId,int stackOrder,int laneOrder,long attentionSequence,long revision,Source source,String sourceKey,Instant seenAt,Instant createdAt,Instant updatedAt,Instant completedAt,Instant dismissedAt,String memo,Long memoRevision,String summary,String summaryOrigin){
        public Item {
            memo=Objects.requireNonNullElse(memo,"");memoRevision=Objects.requireNonNullElse(memoRevision,0L);
            if(source!=null&&source.summary()!=null&&!source.summary().isBlank()&&"SOURCE_PROVIDED".equals(source.summaryOrigin())){summary=source.summary();summaryOrigin="SOURCE_PROVIDED";}
            else {summary=action;summaryOrigin="TITLE_FALLBACK";}
        }
        public Item(UUID id,String action,UUID projectId,String projectLabel,String displayTitle,UUID workTaskId,String status,UUID laneId,int stackOrder,int laneOrder,long attentionSequence,long revision,Source source,String sourceKey,Instant seenAt,Instant createdAt,Instant updatedAt,Instant completedAt,Instant dismissedAt){this(id,action,projectId,projectLabel,displayTitle,workTaskId,status,laneId,stackOrder,laneOrder,attentionSequence,revision,source,sourceKey,seenAt,createdAt,updatedAt,completedAt,dismissedAt,"",0L,null,null);}
    }
    public record Snapshot(long queueRevision,List<Lane> lanes,List<Item> items,Instant serverTime,Map<String,Boolean> capabilities){}
    public record History(List<Item> items,String nextCursor){}
    public record Mutation(UUID operationId,long queueRevision,Item item,List<Lane> lanes){}
    public record Create(UUID operationId,UUID id,String action,UUID projectId,String projectLabel,UUID workTaskId,Source source,UUID laneId){}
    public record Action(UUID operationId,Long expectedRevision,String expectedGeneration){}
    public record Memo(UUID operationId,Long expectedMemoRevision,String memo){}
    public record Move(UUID operationId,Long expectedRevision,Long expectedQueueRevision,String mode,UUID laneId,UUID beforeItemId){}
    public record Target(UUID operationId,Long expectedRevision,String expectedGeneration,Source source){}
    public record LaneCreate(UUID operationId,Long expectedQueueRevision,String name){}
    public record LaneRename(UUID operationId,Long expectedRevision,String name){}
    public record LaneOrder(UUID operationId,Long expectedQueueRevision,List<UUID> laneIds){}
    public record LaneRemove(UUID operationId,Long expectedQueueRevision,UUID destinationLaneId){}
    public record Resolution(UUID operationId,String sourceKey,String generation,String resolvedSourceRevision){}
}
