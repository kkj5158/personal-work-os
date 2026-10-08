import {loadEnvironment} from '../qa/runtime/environment.mjs';
import {spawnSync} from 'node:child_process';
const {values}=await loadEnvironment(process.cwd());
const r=spawnSync('cmd.exe',['/d','/c','gradlew.bat test --tests com.kafka.backend.sleep.SleepNapPostgresTest.nap* --tests com.kafka.backend.sleep.SleepNapPostgresTest.main* --tests com.kafka.backend.sleep.SleepNapPostgresTest.concurrentMainNapWritesHaveOneWinner bootJar --console=plain'],{cwd:'backend',env:{...process.env,...values,JAVA_HOME:'C:/Program Files/Eclipse Adoptium/jdk-21.0.12.8-hotspot'},stdio:'inherit'});process.exit(r.status??1);
