package com.kafka.backend.shareddesk.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import java.io.*;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import static org.assertj.core.api.Assertions.*;

/** Explicit DEV-only provider qualification. Credentials enter via process environment, never files. */
@EnabledIfEnvironmentVariable(named="SHARED_DESK_PROVIDER_PROBE", matches="true")
class S3ProviderProbeTest {
    @Test void actualDevProviderTransferAndHeaders() throws Exception {
        Map<String,Object> evidence=new LinkedHashMap<>();
        Set<String> owned=new LinkedHashSet<>();UUID owner=UUID.randomUUID();
        assertThat(System.getenv("SHARED_DESK_STORAGE_ENVIRONMENT")).isEqualTo("DEV");
        var settings=new StorageSettings("DEV",URI.create(required("SHARED_DESK_STORAGE_ENDPOINT")),required("SHARED_DESK_STORAGE_REGION"),required("SHARED_DESK_STORAGE_BUCKET"),required("SHARED_DESK_STORAGE_ACCESS_KEY_ID"),required("SHARED_DESK_STORAGE_SECRET_ACCESS_KEY"),false);
        var http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NEVER).build();
        try(var storage=new S3ObjectStorage(settings)) {
            try {
                if ("true".equals(System.getenv("SHARED_DESK_PROVIDER_CONFIGURE_CORS"))) configureCors(settings,evidence);
                byte[] bytes="Shared Desk DEV fixture — 정확한 원문\n\n마지막 줄\n".getBytes(StandardCharsets.UTF_8);
                var claim=new FilePolicy.Claim("shared-desk-provider-fixture.md",bytes.length,hash(bytes),"text/markdown");
                String staging=storage.newStagingKey(owner),target=storage.newFinalKey(owner);owned.add(staging);owned.add(target);
                var put=storage.presignPut(owner,staging,claim);
                evidence.put("urlStyleVirtual",put.url().getHost().startsWith(settings.bucket()+"."));
                var preflight=http.send(HttpRequest.newBuilder(put.url()).timeout(Duration.ofSeconds(30))
                    .header("Origin",required("SHARED_DESK_PROVIDER_ORIGIN")).header("Access-Control-Request-Method","PUT")
                    .header("Access-Control-Request-Headers",String.join(",",put.requiredHeaders().keySet()))
                    .method("OPTIONS",HttpRequest.BodyPublishers.noBody()).build(),HttpResponse.BodyHandlers.discarding());
                evidence.put("corsOptionsStatus",preflight.statusCode());
                evidence.put("corsExactOrigin",preflight.headers().firstValue("access-control-allow-origin").orElse("").equals(required("SHARED_DESK_PROVIDER_ORIGIN")));
                evidence.put("corsWildcard",preflight.headers().firstValue("access-control-allow-origin").orElse("").equals("*"));
                evidence.put("corsAllowsPut",preflight.headers().firstValue("access-control-allow-methods").orElse("").contains("PUT"));
                var uploaded=sendPut(http,put,bytes);evidence.put("putStatus",uploaded.statusCode());
                assertThat(uploaded.statusCode()).isBetween(200,299);
                var verified=storage.promoteAndVerify(owner,staging,target,claim);evidence.put("serverFinalDigest",verified.sha256().equals(claim.sha256()));
                var download=storage.presignGet(owner,target,claim.displayName());
                var fetched=http.send(HttpRequest.newBuilder(download.url()).timeout(Duration.ofSeconds(30)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
                evidence.put("getStatus",fetched.statusCode());evidence.put("downloadDigest",hash(fetched.body()).equals(claim.sha256()));
                evidence.put("attachment",fetched.headers().firstValue("content-disposition").orElse("").startsWith("attachment;"));
                evidence.put("octetStream",fetched.headers().firstValue("content-type").orElse("").startsWith("application/octet-stream"));
                evidence.put("nosniff",fetched.headers().firstValue("x-content-type-options").orElse("").equalsIgnoreCase("nosniff"));
                evidence.put("privateNoStore",fetched.headers().firstValue("cache-control").orElse("").contains("no-store"));
                byte[] modified=bytes.clone();modified[0]='X';var tampered=sendPut(http,put,modified);
                evidence.put("tamperedSignedPutStatus",tampered.statusCode());
                var after=http.send(HttpRequest.newBuilder(download.url()).timeout(Duration.ofSeconds(30)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
                evidence.put("finalUnaffectedByStagingReplay",hash(after.body()).equals(claim.sha256()));
                try { storage.presignGet(UUID.randomUUID(),target,claim.displayName());evidence.put("wrongOwnerDenied",false); }
                catch(StorageFailure expected) { evidence.put("wrongOwnerDenied",expected.code()==StorageFailure.Code.NOT_FOUND); }
                var unsigned=URI.create(download.url().getScheme()+"://"+download.url().getAuthority()+download.url().getPath());
                var anonymous=http.send(HttpRequest.newBuilder(unsigned).timeout(Duration.ofSeconds(30)).GET().build(),HttpResponse.BodyHandlers.discarding());
                evidence.put("anonymousGetStatus",anonymous.statusCode());
                evidence.put("anonymousDenied",anonymous.statusCode()==403||anonymous.statusCode()==401);
                byte[] active="<html><script>alert(1)</script></html>".getBytes(StandardCharsets.UTF_8);
                String badStaging=storage.newStagingKey(owner),badFinal=storage.newFinalKey(owner);owned.add(badStaging);owned.add(badFinal);
                var fakeClaim=new FilePolicy.Claim("spoof.txt",active.length,hash(active),"text/plain");
                assertThat(sendPut(http,storage.presignPut(owner,badStaging,fakeClaim),active).statusCode()).isBetween(200,299);
                try { storage.promoteAndVerify(owner,badStaging,badFinal,fakeClaim);evidence.put("spoofRejected",false); }
                catch(StorageFailure expected) { evidence.put("spoofRejected",expected.code()==StorageFailure.Code.TYPE_MISMATCH); }
                String backup=storage.newFinalKey(owner),restore=storage.newFinalKey(owner);owned.add(backup);owned.add(restore);
                try(var service=client(settings)) {
                    copy(service,settings.bucket(),target,backup);storage.delete(owner,target);
                    copy(service,settings.bucket(),backup,restore);
                }
                var restored=http.send(HttpRequest.newBuilder(storage.presignGet(owner,restore,claim.displayName()).url()).timeout(Duration.ofSeconds(30)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());
                evidence.put("isolatedSyntheticCopyRestoreDigest",hash(restored.body()).equals(claim.sha256()));
                for(String field:List.of("corsExactOrigin","corsAllowsPut","serverFinalDigest","downloadDigest","attachment","octetStream","privateNoStore","finalUnaffectedByStagingReplay","wrongOwnerDenied","anonymousDenied","spoofRejected","isolatedSyntheticCopyRestoreDigest"))
                    assertThat(evidence.get(field)).as(field).isEqualTo(true);
            } catch(Exception failure) {
                evidence.put("failureClass",failure.getClass().getSimpleName());
                throw new AssertionError("DEV object provider probe failed; sanitized evidence follows");
            } finally {
                boolean cleaned=true;
                for(String key:owned)try { storage.delete(owner,key); } catch(RuntimeException ignored){cleaned=false;}
                evidence.put("ownedObjectDeleteAcks",cleaned);
                // Synthetic fixture outcomes only. Never print URLs, object keys, credentials or provider errors.
                System.out.println("SHARED_DESK_PROVIDER_PROBE " + evidence);
            }
        }
    }
    private static S3Client client(StorageSettings settings) {
        return S3Client.builder().endpointOverride(settings.endpoint()).region(Region.of(settings.region()))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.accessKeyId(),settings.secretAccessKey())))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(false).build())
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(10)).socketTimeout(Duration.ofSeconds(30)))
            .overrideConfiguration(ClientOverrideConfiguration.builder().apiCallTimeout(Duration.ofSeconds(60)).build()).build();
    }
    private static void configureCors(StorageSettings settings,Map<String,Object> evidence) {
        try(var client=client(settings)) {
            List<String> origins=new ArrayList<>();origins.add(required("SHARED_DESK_PROVIDER_ORIGIN"));
            String localOrigin=System.getenv("SHARED_DESK_PROVIDER_LOCAL_ORIGIN");
            if(localOrigin!=null&&!localOrigin.isBlank()) {
                if(!localOrigin.equals("http://127.0.0.1:3187"))throw new IllegalArgumentException("Unapproved local probe origin");
                origins.add(localOrigin);
            }
            var rule=CORSRule.builder().allowedOrigins(origins)
                .allowedMethods("PUT","GET","HEAD").allowedHeaders("content-type","x-amz-checksum-sha256")
                .exposeHeaders("etag","x-amz-checksum-sha256","content-disposition","content-length").maxAgeSeconds(600).build();
            client.putBucketCors(PutBucketCorsRequest.builder().bucket(settings.bucket()).corsConfiguration(CORSConfiguration.builder().corsRules(rule).build()).build());
            evidence.put("corsConfigurationPutAccepted",true);
            var read=client.getBucketCors(GetBucketCorsRequest.builder().bucket(settings.bucket()).build());
            evidence.put("corsConfigurationReadbackExact",read.corsRules().size()==1 && read.corsRules().getFirst().allowedOrigins().equals(rule.allowedOrigins()));
        } catch(S3Exception unsupported) {
            evidence.put("corsConfigurationPutAccepted",false);evidence.put("corsConfigurationStatus",unsupported.statusCode());
        } catch(RuntimeException unavailable) {
            evidence.put("corsConfigurationPutAccepted",false);evidence.put("corsConfigurationUnavailable",true);
        }
    }
    private static void copy(S3Client client,String bucket,String from,String to) {
        String source=URLEncoder.encode(bucket+"/"+from,StandardCharsets.UTF_8).replace("+","%20").replace("%2F","/");
        client.copyObject(CopyObjectRequest.builder().bucket(bucket).key(to).copySource(source).build());
    }
    private static HttpResponse<Void> sendPut(HttpClient http,ObjectStorage.SignedTicket ticket,byte[] bytes) throws Exception {
        var request=HttpRequest.newBuilder(ticket.url()).timeout(Duration.ofSeconds(45));
        ticket.requiredHeaders().forEach(request::header);
        return http.send(request.PUT(HttpRequest.BodyPublishers.ofByteArray(bytes)).build(),HttpResponse.BodyHandlers.discarding());
    }
    private static String required(String key){String value=System.getenv(key);if(value==null||value.isBlank())throw new IllegalStateException("Missing provider probe configuration");return value;}
    private static String hash(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
}
