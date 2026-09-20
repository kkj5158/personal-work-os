package com.kafka.backend.diet;

import com.kafka.backend.common.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.io.IOException;
import java.util.*;

@Service
@Transactional
public class DietBoardService {
    public record Section(UUID id,String title,String description,Integer sortOrder) {}
    public record Column(UUID id,UUID sectionId,String title,Integer sortOrder) {}
    public record Block(UUID id,UUID columnId,String type,UUID mediaId,String text,Integer sortOrder) {}
    public record Identity(UUID id,String title,String body,Integer sortOrder) {}
    public record Board(List<Section> sections,List<Column> columns,List<Block> blocks,List<Identity> identities) {}
    public record Order(UUID parentId,List<UUID> ids) {}
    public record Move(UUID columnId,int index) {}
    public record Upload(UUID columnId,String data) {}
    private final JdbcTemplate db;
    private final CurrentUserProvider users;
    public DietBoardService(JdbcTemplate db,CurrentUserProvider users){this.db=db;this.users=users;}
    private UUID owner(){return users.getCurrentUserId();}
    // Serialize only this owner's Phase 2 writes, without touching Phase 1 records.
    private void lock(){db.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))","diet-board:"+owner());}
    private static void require(boolean ok,String message){if(!ok)throw new InvalidRequestException(message);}
    private static String text(String value,int max,boolean required){String s=Objects.requireNonNullElse(value,"").trim();require(s.length()<=max&&(!required||!s.isEmpty()),"텍스트 길이와 필수 항목을 확인하세요.");return s;}
    private String table(String kind){return switch(kind){case "sections"->"diet_gallery_sections";case "columns"->"diet_gallery_columns";case "blocks"->"diet_gallery_blocks";case "identities"->"diet_identity_blocks";default->throw new InvalidRequestException("잘못된 항목입니다.");};}
    private boolean exists(String table,UUID id){return id!=null&&db.queryForObject("select count(*) from "+table+" where owner_id=? and id=?",Integer.class,owner(),id)>0;}
    private void owned(String table,UUID id){if(!exists(table,id))throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");}
    private int next(String table){return db.queryForObject("select coalesce(max(sort_order),-1)+1 from "+table+" where owner_id=?",Integer.class,owner());}
    private void upsert(String table,UUID id,String columns,Object... values){
        var names=columns.split(",");var args=new ArrayList<Object>();args.add(id);args.add(owner());args.addAll(Arrays.asList(values));
        var updates=Arrays.stream(names).map(n->n+"=excluded."+n).toList();
        int count=db.update("insert into "+table+"(id,owner_id,"+columns+") values("+String.join(",",Collections.nCopies(args.size(),"?"))+") on conflict(id) do update set "+String.join(",",updates)+" where "+table+".owner_id=excluded.owner_id",args.toArray());
        if(count==0)throw new ResourceNotFoundException("항목을 찾을 수 없습니다.");
    }
    @Transactional(readOnly=true)
    public Board read(){
        var sections=db.query("select * from diet_gallery_sections where owner_id=? order by sort_order,id",(r,n)->new Section(r.getObject("id",UUID.class),r.getString("title"),r.getString("description"),r.getInt("sort_order")),owner());
        var columns=db.query("select * from diet_gallery_columns where owner_id=? order by sort_order,id",(r,n)->new Column(r.getObject("id",UUID.class),r.getObject("section_id",UUID.class),r.getString("title"),r.getInt("sort_order")),owner());
        var blocks=db.query("select * from diet_gallery_blocks where owner_id=? order by sort_order,id",(r,n)->new Block(r.getObject("id",UUID.class),r.getObject("column_id",UUID.class),r.getString("type"),r.getObject("media_id",UUID.class),r.getString("text"),r.getInt("sort_order")),owner());
        var identities=db.query("select * from diet_identity_blocks where owner_id=? order by sort_order,id",(r,n)->new Identity(r.getObject("id",UUID.class),r.getString("title"),r.getString("body"),r.getInt("sort_order")),owner());
        return new Board(sections,columns,blocks,identities);
    }
    public void section(UUID id,Section in){
        String title=text(in.title(),200,true),description=text(in.description(),2000,false);lock();
        boolean fresh=!exists(table("sections"),id);
        upsert(table("sections"),id,"title,description,sort_order",title,description,fresh?next(table("sections")):orderOf(table("sections"),id));
        if(fresh)upsert(table("columns"),UUID.randomUUID(),"section_id,title,sort_order",id,"새 열",0);
    }
    private int orderOf(String table,UUID id){return db.queryForObject("select sort_order from "+table+" where owner_id=? and id=?",Integer.class,owner(),id);}
    public void column(UUID id,Column in){
        String title=text(in.title(),200,true);lock();owned(table("sections"),in.sectionId());
        if(exists(table("columns"),id))require(db.queryForObject("select section_id from diet_gallery_columns where owner_id=? and id=?",UUID.class,owner(),id).equals(in.sectionId()),"열은 같은 섹션 안에서 정렬하세요.");
        upsert(table("columns"),id,"section_id,title,sort_order",in.sectionId(),title,exists(table("columns"),id)?orderOf(table("columns"),id):next(table("columns")));
    }
    public void block(UUID id,Block in){
        require("TEXT".equals(in.type())&&in.mediaId()==null,"텍스트 블록만 편집할 수 있습니다.");String value=text(in.text(),4000,true);lock();owned(table("columns"),in.columnId());
        if(exists(table("blocks"),id))require(db.queryForObject("select type='TEXT' and column_id=? from diet_gallery_blocks where owner_id=? and id=?",Boolean.class,in.columnId(),owner(),id),"블록 이동 기능을 사용하세요.");
        upsert(table("blocks"),id,"column_id,type,text,sort_order",in.columnId(),"TEXT",value,exists(table("blocks"),id)?orderOf(table("blocks"),id):next(table("blocks")));
    }
    public void upload(Upload in)throws IOException{
        var image=RasterMedia.decode(in.data());lock();owned(table("columns"),in.columnId());UUID media=UUID.randomUUID();
        db.update("insert into journal_media(id,diet_owner_id,mime_type,width,height,data) values(?,?,?,?,?,?)",media,owner(),image.mimeType(),image.width(),image.height(),image.data());
        upsert(table("blocks"),UUID.randomUUID(),"column_id,type,media_id,sort_order",in.columnId(),"IMAGE",media,next(table("blocks")));
    }
    public void identity(UUID id,Identity in){
        String title=text(in.title(),200,true),body=text(in.body(),6000,false);lock();
        boolean fresh=!exists(table("identities"),id);
        if(fresh)require(db.queryForObject("select count(*) from diet_identity_blocks where owner_id=?",Integer.class,owner())<3,"블록은 최대 3개입니다.");
        upsert(table("identities"),id,"title,body,sort_order",title,body,fresh?next(table("identities")):orderOf(table("identities"),id));
    }
    private List<UUID> ids(String kind,UUID parent){
        String table=table(kind);String field=switch(kind){case "columns"->"section_id";case "blocks"->"column_id";default->null;};
        if(field==null){require(parent==null,"상위 항목이 필요하지 않습니다.");return db.queryForList("select id from "+table+" where owner_id=? order by sort_order,id",UUID.class,owner());}
        owned(table(kind.equals("columns")?"sections":"columns"),parent);
        return db.queryForList("select id from "+table+" where owner_id=? and "+field+"=? order by sort_order,id",UUID.class,owner(),parent);
    }
    private void writeOrder(String table,List<UUID> ids){for(int i=0;i<ids.size();i++)db.update("update "+table+" set sort_order=? where owner_id=? and id=?",i,owner(),ids.get(i));}
    public void reorder(String kind,Order in){
        lock();var current=ids(kind,in.parentId());
        require(in.ids()!=null&&in.ids().size()==current.size()&&new HashSet<>(in.ids()).equals(new HashSet<>(current)),"목록이 변경되었습니다. 새로고침 후 다시 정렬하세요.");
        writeOrder(table(kind),in.ids());
    }
    public void move(UUID id,Move in){
        lock();owned(table("blocks"),id);var destination=new ArrayList<>(ids("blocks",in.columnId()));destination.remove(id);
        require(in.index()>=0&&in.index()<=destination.size(),"이동 위치를 확인하세요.");destination.add(in.index(),id);
        db.update("update diet_gallery_blocks set column_id=? where owner_id=? and id=?",in.columnId(),owner(),id);writeOrder(table("blocks"),destination);
    }
    public void delete(String kind,UUID id){
        lock();String table=table(kind);owned(table,id);
        if(kind.equals("columns"))require(db.queryForObject("select count(*) from diet_gallery_columns where owner_id=? and section_id=(select section_id from diet_gallery_columns where owner_id=? and id=?)",Integer.class,owner(),owner(),id)>1,"섹션에는 열이 하나 이상 필요합니다.");
        db.update("delete from "+table+" where owner_id=? and id=?",owner(),id);
        db.update("delete from journal_media m where diet_owner_id=? and not exists(select 1 from diet_gallery_blocks b where b.media_id=m.id)",owner());
    }
}
