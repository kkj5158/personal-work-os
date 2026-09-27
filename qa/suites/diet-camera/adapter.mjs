import path from 'node:path';
export default {
 system:'diet-camera',readyPath:'/api/diet/camera-media/session',route:'/diet',
 testMatch:'**/release.spec.mjs',scenarios:['camera.release.diet-reads','camera.release.native-note'],
 apiChecks:['/api/diet/camera-media/session','/api/diet/camera-media','/api/diet','/api/diet/note-sync','/api/diet/notes/latest?limit=1'],
 backgroundValidation:'Accepted Batch 4 Flip 6 WorkManager offline/restart/background recovery evidence; release reuses unchanged server lifecycle contract. No unrelated schedulers.',
 setup:{fixtures:[],runtime:[],cleanup:[]},
 async prepare(ctx){
  await ctx.run('camera-release-safety','cmd.exe',['/d','/c','gradlew.bat','--no-daemon','--console=plain','test','--rerun',
   '--tests','*DietCameraSecurityTest','--tests','*DietCameraPostgresTest','--tests','*DietCameraImagesTest',
   '--tests','*DietNoteProjectionTest','--tests','*ProdCurrentUserProviderTest','--tests','*ProdSecurityConfigJwtDecoderTest',
   '--tests','*SecurityProfileIsolationTest'],path.join(ctx.target,'backend'),{...ctx.javaEnv,CAMERA_DB_TESTS:'1'},300000);
  return {};
 },
 async cleanup(){ /* PostgreSQL test owns and rolls back its only fixture transaction. */ }
};
