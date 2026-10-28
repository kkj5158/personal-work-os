package com.kafka.backend.shareddesk.storage;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.*;
import static com.kafka.backend.shareddesk.storage.StorageFailure.Code.*;

/**
 * Private S3-compatible storage. Only staging keys receive PUT URLs. Final snapshots are copied
 * first and streamed independently before READY, so replaying a staging PUT cannot alter READY bytes.
 * No bucket creation, ACL change, CORS or lifecycle configuration is performed by this adapter.
 */
public final class S3ObjectStorage implements ObjectStorage {
    public static final Duration UPLOAD_TTL = Duration.ofMinutes(10), DOWNLOAD_TTL = Duration.ofSeconds(60);
    private final StorageSettings settings;
    private final S3Client client;
    private final S3Presigner presigner;
    private final Clock clock;

    public S3ObjectStorage(StorageSettings settings) {
        this.settings = settings;
        var credentials = StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.accessKeyId(), settings.secretAccessKey()));
        var config = S3Configuration.builder().pathStyleAccessEnabled(settings.pathStyle()).build();
        this.client = S3Client.builder().endpointOverride(settings.endpoint()).region(Region.of(settings.region()))
            .credentialsProvider(credentials).serviceConfiguration(config)
            .httpClientBuilder(UrlConnectionHttpClient.builder().connectionTimeout(Duration.ofSeconds(10)).socketTimeout(Duration.ofSeconds(30)))
            .overrideConfiguration(ClientOverrideConfiguration.builder().apiCallTimeout(Duration.ofMinutes(5)).apiCallAttemptTimeout(Duration.ofMinutes(3)).build())
            .build();
        this.presigner = S3Presigner.builder().endpointOverride(settings.endpoint()).region(Region.of(settings.region()))
            .credentialsProvider(credentials).serviceConfiguration(config).build();
        this.clock = Clock.systemUTC();
    }
    S3ObjectStorage(StorageSettings settings, S3Client client, S3Presigner presigner, Clock clock) {
        this.settings = settings; this.client = client; this.presigner = presigner; this.clock = clock;
    }
    public boolean enabled() { return true; }
    public String newStagingKey(UUID owner) { return prefix(owner) + "staging/" + UUID.randomUUID(); }
    public String newFinalKey(UUID owner) { return prefix(owner) + "final/" + UUID.randomUUID(); }
    private String prefix(UUID owner) {
        Objects.requireNonNull(owner);
        return "shared-desk/" + settings.environment() + "/" + owner + "/";
    }
    private void key(UUID owner, String key, String state) {
        String prefix = prefix(owner) + state + "/";
        if (key == null || !key.startsWith(prefix)) throw new StorageFailure(NOT_FOUND);
        try {
            String tail = key.substring(prefix.length());
            if (!UUID.fromString(tail).toString().equals(tail)) throw new IllegalArgumentException();
        } catch (IllegalArgumentException ex) { throw new StorageFailure(NOT_FOUND); }
    }
    public SignedTicket presignPut(UUID owner, String stagingKey, FilePolicy.Claim claim) {
        key(owner, stagingKey, "staging");
        try {
            var request = PutObjectRequest.builder().bucket(settings.bucket()).key(stagingKey)
                .contentType(claim.claimedMime()).contentLength(claim.sizeBytes())
                .checksumSHA256(Base64.getEncoder().encodeToString(HexFormat.of().parseHex(claim.sha256())))
                .build();
            var signed = presigner.presignPutObject(PutObjectPresignRequest.builder().signatureDuration(UPLOAD_TTL).putObjectRequest(request).build());
            return ticket(signed.url(), signed.signedHeaders(), UPLOAD_TTL);
        } catch (RuntimeException ex) { throw new StorageFailure(UNAVAILABLE); }
    }
    public FilePolicy.Verified promoteAndVerify(UUID owner, String stagingKey, String finalKey, FilePolicy.Claim claim) {
        key(owner, stagingKey, "staging");key(owner, finalKey, "final");
        boolean ownsFreshDestination = false;
        try {
            // Caller persists a freshly generated finalKey for this attempt before calling; never reuse a READY key.
            // An existing destination is a conflict, not permission to overwrite it.
            try {
                client.headObject(HeadObjectRequest.builder().bucket(settings.bucket()).key(finalKey).build());
                throw new StorageFailure(INVALID_FILE);
            } catch (NoSuchKeyException absent) { /* expected fresh namespace */ }
            catch (S3Exception absent) { if (absent.statusCode() != 404) throw absent; }
            ownsFreshDestination = true;
            String source = URLEncoder.encode(settings.bucket()+"/"+stagingKey, StandardCharsets.UTF_8).replace("+", "%20").replace("%2F", "/");
            client.copyObject(CopyObjectRequest.builder().bucket(settings.bucket()).key(finalKey).copySource(source)
                .metadataDirective(MetadataDirective.REPLACE).contentType("application/octet-stream")
                .contentDisposition(disposition(claim.displayName())).cacheControl("private, no-store")
                .build());
            try (ResponseInputStream<GetObjectResponse> input = client.getObject(GetObjectRequest.builder().bucket(settings.bucket()).key(finalKey).build())) {
                if (input.response().contentLength() != claim.sizeBytes()) throw new StorageFailure(SIZE_MISMATCH);
                return FilePolicy.verify(input, claim);
            } catch (IOException ex) { throw new StorageFailure(UNAVAILABLE); }
            catch (RuntimeException ex) { throw ex; }
        } catch (RuntimeException ex) {
            // Remove only this attempt's unverified final snapshot; never scan or delete a prefix.
            if (ownsFreshDestination) {
                try { client.deleteObject(DeleteObjectRequest.builder().bucket(settings.bucket()).key(finalKey).build()); }
                catch (RuntimeException cleanupFailure) { /* domain reconciliation retains finalKey for a safe retry */ }
            }
            if (ex instanceof StorageFailure sf) throw sf;
            throw new StorageFailure(UNAVAILABLE);
        }
    }
    public SignedTicket presignGet(UUID owner, String finalKey, String displayName) {
        key(owner, finalKey, "final");
        String disposition = disposition(displayName);
        try {
            var get = GetObjectRequest.builder().bucket(settings.bucket()).key(finalKey)
                .responseContentDisposition(disposition).responseContentType("application/octet-stream")
                .responseCacheControl("private, no-store").build();
            var signed = presigner.presignGetObject(GetObjectPresignRequest.builder().signatureDuration(DOWNLOAD_TTL).getObjectRequest(get).build());
            return ticket(signed.url(), signed.signedHeaders(), DOWNLOAD_TTL);
        } catch (RuntimeException ex) { throw new StorageFailure(UNAVAILABLE); }
    }
    /** Backend proxy path when provider response headers cannot enforce nosniff. Does not close caller's stream. */
    public void download(UUID owner, String finalKey, long expectedSize, OutputStream destination) {
        key(owner,finalKey,"final");
        if(expectedSize<1 || expectedSize>FilePolicy.MAX_BYTES) throw new StorageFailure(INVALID_FILE);
        try(ResponseInputStream<GetObjectResponse> input=client.getObject(GetObjectRequest.builder().bucket(settings.bucket()).key(finalKey).build())) {
            if(input.response().contentLength()!=expectedSize) throw new StorageFailure(SIZE_MISMATCH);
            byte[] buffer=new byte[64*1024];long total=0;
            for(;;) {
                int count=input.read(buffer,0,(int)Math.min(buffer.length,expectedSize-total+1));
                if(count<0) break;
                if(count==0) continue;
                total+=count;if(total>expectedSize) throw new StorageFailure(SIZE_MISMATCH);
                destination.write(buffer,0,count);
            }
            if(total!=expectedSize) throw new StorageFailure(SIZE_MISMATCH);
        } catch(IOException ex) { throw new StorageFailure(UNAVAILABLE); }
        catch(RuntimeException ex) { if(ex instanceof StorageFailure sf)throw sf;throw new StorageFailure(UNAVAILABLE); }
    }
    private SignedTicket ticket(URL url, Map<String,List<String>> headers, Duration ttl) {
        Map<String,String> required = new LinkedHashMap<>();
        headers.forEach((name, values) -> {
            // Browsers control Host and Content-Length. Signature still binds their actual values.
            if (!name.equalsIgnoreCase("host") && !name.equalsIgnoreCase("content-length")) required.put(name, String.join(",", values));
        });
        try { return new SignedTicket(url.toURI(), clock.instant().plus(ttl), required); }
        catch (URISyntaxException ex) { throw new StorageFailure(UNAVAILABLE); }
    }
    public void delete(UUID owner, String objectKey) {
        if (objectKey != null && objectKey.startsWith(prefix(owner)+"staging/")) key(owner, objectKey, "staging");
        else key(owner, objectKey, "final");
        try { client.deleteObject(DeleteObjectRequest.builder().bucket(settings.bucket()).key(objectKey).build()); }
        catch (RuntimeException ex) { throw new StorageFailure(UNAVAILABLE); }
    }
    public static String disposition(String displayName) {
        String name = FilePolicy.safeName(displayName);
        String encoded = URLEncoder.encode(name, StandardCharsets.UTF_8).replace("+", "%20").replace("*", "%2A");
        return "attachment; filename=\"download\"; filename*=UTF-8''" + encoded;
    }
    @Override public void close() { try { presigner.close(); } finally { client.close(); } }
}
