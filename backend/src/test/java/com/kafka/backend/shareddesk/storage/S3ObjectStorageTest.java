package com.kafka.backend.shareddesk.storage;

import org.junit.jupiter.api.*;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.http.AbortableInputStream;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static com.kafka.backend.shareddesk.storage.StorageFailure.Code.*;

class S3ObjectStorageTest {
    final UUID owner=UUID.randomUUID(),other=UUID.randomUUID();
    final StorageSettings settings=new StorageSettings("DEV",URI.create("https://objects.example.test"),"auto","dev-bucket","synthetic-test-key","synthetic-test-secret",false);
    final Clock clock=Clock.fixed(Instant.parse("2026-10-28T00:00:00Z"),ZoneOffset.UTC);
    S3Client client;S3Presigner signer;S3ObjectStorage storage;
    @BeforeEach void setup() {
        client=mock(S3Client.class);
        signer=S3Presigner.builder().endpointOverride(settings.endpoint()).region(software.amazon.awssdk.regions.Region.of(settings.region()))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(settings.accessKeyId(),settings.secretAccessKey())))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(false).build()).build();
        storage=new S3ObjectStorage(settings,client,signer,clock);
    }
    @AfterEach void close(){storage.close();}
    @Test void disabledAndIncompleteConfigurationFailClosedWithoutTextStartupFailure() {
        var config=new SharedDeskStorageConfiguration();
        assertThat(config.sharedDeskObjectStorage(new MockEnvironment()).enabled()).isFalse();
        var missing=config.sharedDeskObjectStorage(new MockEnvironment().withProperty("SHARED_DESK_STORAGE_ENABLED","true"));
        assertThat(missing.enabled()).isFalse();
        FilePolicyTest.failure(()->missing.newStagingKey(owner),DISABLED);
        assertThat(settings.toString()).doesNotContain(settings.secretAccessKey()).doesNotContain(settings.accessKeyId());
    }
    @Test void configuredProviderModeControlsVirtualHostAndPathStyle() throws Exception {
        byte[] bytes="signed bytes\n".getBytes(StandardCharsets.UTF_8);
        var claim=FilePolicyTest.claim("원문.txt","text/plain",bytes);
        String staging=storage.newStagingKey(owner);
        var put=storage.presignPut(owner,staging,claim);
        assertThat(put.url().getHost()).isEqualTo("dev-bucket.objects.example.test");
        assertThat(put.requiredHeaders()).containsKey("content-type").containsKey("x-amz-checksum-sha256");
        assertThat(java.net.URLDecoder.decode(put.url().getRawQuery(),StandardCharsets.UTF_8)).contains("content-length");
        assertThat(put.expiresAt()).isEqualTo(clock.instant().plusSeconds(600));
        assertThat(put.toString()).doesNotContain("X-Amz").doesNotContain("Signature");
        FilePolicyTest.failure(()->storage.presignPut(other,staging,claim),NOT_FOUND);
        FilePolicyTest.failure(()->storage.presignPut(owner,storage.newFinalKey(owner),claim),NOT_FOUND);
        verifyNoInteractions(client);
    }
    @Test void explicitLegacyPathStyleAndEnvironmentNamespacesRemainSeparated() throws Exception {
        var legacy=new StorageSettings("PROD",settings.endpoint(),settings.region(),"prod-bucket",settings.accessKeyId(),settings.secretAccessKey(),true);
        try(var pathSigner=S3Presigner.builder().endpointOverride(legacy.endpoint()).region(software.amazon.awssdk.regions.Region.of(legacy.region()))
            .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(legacy.accessKeyId(),legacy.secretAccessKey())))
            .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build()).build()) {
            var pathStorage=new S3ObjectStorage(legacy,client,pathSigner,clock);
            String key=pathStorage.newStagingKey(owner);
            var ticket=pathStorage.presignPut(owner,key,FilePolicyTest.claim("test.txt","text/plain","text\n".getBytes(StandardCharsets.UTF_8)));
            assertThat(ticket.url().getHost()).isEqualTo("objects.example.test");
            assertThat(ticket.url().getPath()).startsWith("/prod-bucket/shared-desk/prod/");
            FilePolicyTest.failure(()->storage.presignGet(owner,pathStorage.newFinalKey(owner),"test.txt"),NOT_FOUND);
        }
    }
    @Test void downloadIsAttachmentOnlyAndNeverSignsAnotherOwnerOrStagingKey() {
        String key=storage.newFinalKey(owner);
        var get=storage.presignGet(owner,key,"한글 문서.txt");
        assertThat(get.url().getRawQuery()).contains("response-content-type=application%2Foctet-stream").contains("response-content-disposition=attachment");
        assertThat(get.expiresAt()).isEqualTo(clock.instant().plusSeconds(60));
        FilePolicyTest.failure(()->storage.presignGet(other,key,"x.txt"),NOT_FOUND);
        FilePolicyTest.failure(()->storage.presignGet(owner,storage.newStagingKey(owner),"x.txt"),NOT_FOUND);
        assertThat(S3ObjectStorage.disposition("한글 문서.txt")).contains("filename*=UTF-8''").doesNotContain("\r").doesNotContain("\n");
    }
    @Test void copiesThenVerifiesFinalSnapshotSoStagingOverwriteCannotChangeReady() throws Exception {
        byte[] original="정확한 원문\n".getBytes(StandardCharsets.UTF_8),tampered="changed later\n".getBytes(StandardCharsets.UTF_8);
        var claim=FilePolicyTest.claim("test.txt","text/plain",original);
        String staging=storage.newStagingKey(owner),target=storage.newFinalKey(owner);
        Map<String,byte[]> objects=new HashMap<>();objects.put(staging,original);
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).build());
        when(client.copyObject(any(CopyObjectRequest.class))).thenAnswer(invocation->{
            objects.put(target,objects.get(staging).clone());objects.put(staging,tampered);return CopyObjectResponse.builder().build();
        });
        when(client.getObject(any(GetObjectRequest.class))).thenAnswer(invocation->{
            GetObjectRequest request=invocation.getArgument(0);assertThat(request.key()).isEqualTo(target);
            byte[] bytes=objects.get(request.key());return new ResponseInputStream<>(GetObjectResponse.builder().contentLength((long)bytes.length).build(),AbortableInputStream.create(new ByteArrayInputStream(bytes)));
        });
        var result=storage.promoteAndVerify(owner,staging,target,claim);
        assertThat(result.sha256()).isEqualTo(claim.sha256());assertThat(objects.get(target)).isEqualTo(original);
        assertThat(objects.get(staging)).isEqualTo(tampered);
        verify(client,never()).deleteObject(any(DeleteObjectRequest.class));
    }
    @Test void corruptSnapshotIsRemovedAndReadyCannotBeOverwritten() throws Exception {
        byte[] good="expected\n".getBytes(StandardCharsets.UTF_8),bad="tampered\n".getBytes(StandardCharsets.UTF_8);
        var claim=FilePolicyTest.claim("test.txt","text/plain",good);
        String staging=storage.newStagingKey(owner),target=storage.newFinalKey(owner);
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(404).build());
        when(client.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().contentLength((long)bad.length).build(),AbortableInputStream.create(new ByteArrayInputStream(bad))));
        FilePolicyTest.failure(()->storage.promoteAndVerify(owner,staging,target,claim),DIGEST_MISMATCH);
        verify(client).deleteObject(argThat((DeleteObjectRequest request)->request.key().equals(target)));
        reset(client);when(client.headObject(any(HeadObjectRequest.class))).thenReturn(HeadObjectResponse.builder().build());
        FilePolicyTest.failure(()->storage.promoteAndVerify(owner,staging,target,claim),INVALID_FILE);
        verify(client,never()).copyObject(any(CopyObjectRequest.class));verify(client,never()).deleteObject(any(DeleteObjectRequest.class));
    }
    @Test void providerFailureBeforeDestinationClaimNeverDeletesPossiblyExistingData() throws Exception {
        var claim=FilePolicyTest.claim("test.txt","text/plain","content\n".getBytes(StandardCharsets.UTF_8));
        when(client.headObject(any(HeadObjectRequest.class))).thenThrow(S3Exception.builder().statusCode(503).message("synthetic private diagnostic").build());
        FilePolicyTest.failure(()->storage.promoteAndVerify(owner,storage.newStagingKey(owner),storage.newFinalKey(owner),claim),UNAVAILABLE);
        verify(client,never()).deleteObject(any(DeleteObjectRequest.class));
        verify(client,never()).copyObject(any(CopyObjectRequest.class));
    }
    @Test void deleteIsNarrowOwnerScopedAndRejectsTraversal() {
        String key=storage.newStagingKey(owner);storage.delete(owner,key);
        verify(client).deleteObject(argThat((DeleteObjectRequest request)->request.key().equals(key)));
        FilePolicyTest.failure(()->storage.delete(other,key),NOT_FOUND);
        FilePolicyTest.failure(()->storage.delete(owner,key+"/../"),NOT_FOUND);
    }
    @Test void backendDownloadStreamsExactBytesWithoutClosingCallerOutput() throws Exception {
        byte[] bytes="proxy-safe original\n".getBytes(StandardCharsets.UTF_8);
        when(client.getObject(any(GetObjectRequest.class))).thenReturn(new ResponseInputStream<>(GetObjectResponse.builder().contentLength((long)bytes.length).build(),AbortableInputStream.create(new ByteArrayInputStream(bytes))));
        var out=new ByteArrayOutputStream();String key=storage.newFinalKey(owner);
        storage.download(owner,key,bytes.length,out);out.write('!');
        assertThat(out.toByteArray()).isEqualTo("proxy-safe original\n!".getBytes(StandardCharsets.UTF_8));
        FilePolicyTest.failure(()->storage.download(other,key,bytes.length,new ByteArrayOutputStream()),NOT_FOUND);
        FilePolicyTest.failure(()->storage.download(owner,key,FilePolicy.MAX_BYTES+1,new ByteArrayOutputStream()),INVALID_FILE);
    }
}
