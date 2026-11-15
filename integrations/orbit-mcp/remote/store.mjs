import {DatabaseSync} from 'node:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';

// OAuth state only. This store never connects to a POS business database.
export class Store {
 constructor(file,key){
  if(!Buffer.isBuffer(key)||key.length!==32)throw Error('Invalid vault key');
  this.key=key;
  if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  this.db=new DatabaseSync(file);
  this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON; CREATE TABLE IF NOT EXISTS records(model TEXT NOT NULL,id TEXT NOT NULL,value TEXT NOT NULL,expires INTEGER,uid TEXT,user_code TEXT,grant_id TEXT,PRIMARY KEY(model,id)); CREATE INDEX IF NOT EXISTS expires_idx ON records(expires); CREATE INDEX IF NOT EXISTS grant_idx ON records(grant_id);');
  if(file!==':memory:')chmodSync(file,0o600);
 }
 hash(value){return value?createHash('sha256').update(value).digest('hex'):null;}
 seal(value,model,id){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
  cipher.setAAD(Buffer.from(model+':'+id));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
 }
 open(value,model,id){
  const data=Buffer.from(value,'base64url'),decipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));
  decipher.setAAD(Buffer.from(model+':'+id));decipher.setAuthTag(data.subarray(12,28));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));
 }
 put(model,id,value,seconds){
  const expires=seconds?Math.floor(Date.now()/1000)+seconds:null;
  this.db.prepare('INSERT INTO records(model,id,value,expires,uid,user_code,grant_id) VALUES(?,?,?,?,?,?,?) ON CONFLICT(model,id) DO UPDATE SET value=excluded.value,expires=excluded.expires,uid=excluded.uid,user_code=excluded.user_code,grant_id=excluded.grant_id')
   .run(model,this.hash(id),this.seal(value,model,this.hash(id)),expires,this.hash(value.uid),this.hash(value.userCode),this.hash(value.grantId));
  if(!this.lastPrune||Date.now()-this.lastPrune>60000){this.db.prepare('DELETE FROM records WHERE expires IS NOT NULL AND expires<=?').run(Math.floor(Date.now()/1000));this.lastPrune=Date.now();}
 }
 get(model,id){return this.find(model,'id',id);}
 find(model,column,value){
  if(!['id','uid','user_code'].includes(column))throw Error('Invalid index');
  const row=this.db.prepare('SELECT id,value,expires FROM records WHERE model=? AND '+column+'=?').get(model,this.hash(value));
  if(!row||row.expires&&row.expires<=Math.floor(Date.now()/1000))return undefined;
  return this.open(row.value,model,row.id);
 }
 delete(model,id){this.db.prepare('DELETE FROM records WHERE model=? AND id=?').run(model,this.hash(id));}
 take(model,id){const found=this.get(model,id);this.delete(model,id);return found;}
 count(model){return this.db.prepare('SELECT count(*) n FROM records WHERE model=?').get(model).n;}
 adapter(){
  const store=this;
  return class Adapter {
   constructor(model){this.model=model;}
   async upsert(id,payload,expiresIn){store.put(this.model,id,payload,expiresIn);}
   async find(id){return store.get(this.model,id);}
   async findByUid(uid){return store.find(this.model,'uid',uid);}
   async findByUserCode(code){return store.find(this.model,'user_code',code);}
   async destroy(id){store.delete(this.model,id);}
   async consume(id){
    const row=store.db.prepare('SELECT value,expires FROM records WHERE model=? AND id=?').get(this.model,store.hash(id));
    if(!row)return;
    const payload=store.open(row.value,this.model,store.hash(id));payload.consumed=Math.floor(Date.now()/1000);
    store.db.prepare('UPDATE records SET value=? WHERE model=? AND id=?').run(store.seal(payload,this.model,store.hash(id)),this.model,store.hash(id));
   }
   async revokeByGrantId(id){store.db.prepare('DELETE FROM records WHERE grant_id=? OR (model=? AND id=?)').run(store.hash(id),'Grant',store.hash(id));}
  };
 }
 close(){this.db.close();}
}
