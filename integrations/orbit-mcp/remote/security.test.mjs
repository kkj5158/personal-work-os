import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {generateKeyPair,exportJWK,createLocalJWKSet,SignJWT} from 'jose';
import {Store} from './store.mjs';
import {configFromEnv,redirectAllowed} from './config.mjs';
import {Upstream} from './upstream.mjs';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';

test('encrypted vault reopens with the same key and rejects another key',()=>{
 const directory=mkdtempSync(path.join(tmpdir(),'orbit-vault-')),file=path.join(directory,'oauth.sqlite'),key=randomBytes(32);
 let store=new Store(file,key);
 try{
  store.put('Key','signing',{syntheticPrivateMaterial:'owned-fixture'},86400);store.close();
  store=new Store(file,key);assert.ok(store.get('Key','signing').syntheticPrivateMaterial==='owned-fixture');store.close();
  store=new Store(file,randomBytes(32));assert.throws(()=>store.get('Key','signing'));
 }finally{
  store.close();for(const suffix of ['','-wal','-shm'])try{unlinkSync(file+suffix);}catch(e){if(e.code!=='ENOENT')throw e;}rmdirSync(directory);
 }
});

test('encrypted OAuth state is authenticated, indexed, expiring and consumable',async()=>{
 const key=randomBytes(32),store=new Store(':memory:',key);
 try{
  store.put('RefreshToken','private-token',{secret:'not-in-plaintext',uid:'uid',userCode:'user-code',grantId:'grant'},60);
  const raw=store.db.prepare('SELECT * FROM records').get();
  assert.ok(!JSON.stringify(raw).includes('not-in-plaintext')&&!JSON.stringify(raw).includes('private-token'));
  assert.ok(store.get('RefreshToken','private-token').secret==='not-in-plaintext');
  const Adapter=store.adapter(),adapter=new Adapter('RefreshToken');
  assert.ok((await adapter.findByUid('uid')).secret==='not-in-plaintext');
  assert.ok((await adapter.findByUserCode('user-code')).secret==='not-in-plaintext');
  await adapter.consume('private-token');assert.ok((await adapter.find('private-token')).consumed>0);
  await adapter.revokeByGrantId('grant');assert.ok(!await adapter.find('private-token'));
  store.put('Temporary','expired',{a:1},-1);assert.ok(!store.get('Temporary','expired'));
  store.put('Temporary','single',{a:1},60);assert.ok(store.take('Temporary','single').a===1&&!store.take('Temporary','single'));
  assert.throws(()=>store.open(store.seal({a:1},'A','id'),'B','id'));
 }finally{store.close();}
});

test('production config and callback allowlist fail closed',()=>{
 const base={ORBIT_POS_ENV:'PROD',ORBIT_ISSUER:'https://orbit.example',ORBIT_MASTER_KEY:'a'.repeat(64),ORBIT_UPSTREAM_CLIENT_ID:'id',POS_AUTH_PUBLISHABLE_KEY:'public',POS_AUTH_ISSUER:'https://pos-auth.example/auth/v1'};
 assert.ok(configFromEnv(base).allowLoopback===false);
 for(const edit of [{ORBIT_POS_ENV:'unknown'},{ORBIT_ISSUER:'http://localhost'},{ORBIT_ISSUER:'https://orbit.example/path'},{POS_USER_ACCESS_TOKEN:'unwanted'},{DATABASE_URL:'unwanted'},{DEBUG:'*'},{ORBIT_MASTER_KEY:'short'}])assert.throws(()=>configFromEnv({...base,...edit}));
 assert.ok(redirectAllowed('https://chatgpt.com/connector_platform_oauth_redirect'));
 assert.ok(redirectAllowed('https://chatgpt.com/connector/oauth/abc-123'));
 for(const uri of ['https://evil.example/callback','https://chatgpt.com.evil.example/connector_platform_oauth_redirect','https://chatgpt.com/connector_platform_oauth_redirect?extra=1','https://chatgpt.com/connector_platform_oauth_redirect#x','http://127.0.0.1:1234/callback','javascript:alert(1)'])assert.ok(!redirectAllowed(uri));
 assert.ok(redirectAllowed('http://127.0.0.1:1234/callback',true));
});

test('POS identity verifies ES256 issuer audience expiration nonce client and subject',async()=>{
 const pair=await generateKeyPair('ES256'),pub=await exportJWK(pair.publicKey),jwks=createLocalJWKSet({keys:[{...pub,kid:'qa'}]});
 const config={auth:'https://auth.example/auth/v1',authIssuer:'https://identity.example/auth/v1',upstreamClient:'upstream-client'};
 const store=new Store(':memory:',randomBytes(32)),upstream=new Upstream(config,store,{jwks});
 const sub='00000000-0000-0000-0000-000000000001';
 const mint=(claims={},options={})=>new SignJWT({sub,role:'authenticated',client_id:config.upstreamClient,...claims}).setProtectedHeader({alg:'ES256',kid:'qa'}).setIssuer(options.iss??config.authIssuer).setAudience(options.aud??'authenticated').setIssuedAt().setExpirationTime(options.exp??'5m').sign(pair.privateKey);
 try{
  assert.ok((await upstream.validate(await mint())).sub===sub);
  for(const [claims,options]of [[{}, {iss:'https://wrong.example'}],[{}, {aud:'wrong'}],[{}, {exp:0}],[{sub:'not-a-user'},{}],[{role:'service_role'},{}],[{client_id:'other-client'},{}]])await assert.rejects(()=>mint(claims,options).then(t=>upstream.validate(t)));
  const id=await mint({nonce:'expected'},{aud:config.upstreamClient});
  assert.ok((await upstream.validate(id,{identity:true,nonce:'expected'})).sub===sub);
  await assert.rejects(()=>upstream.validate(id,{identity:true,nonce:'different'}));
 }finally{store.close();}
});
