package com.kafka.backend.shareddesk.storage;

import org.junit.jupiter.api.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import static org.assertj.core.api.Assertions.*;
import static com.kafka.backend.shareddesk.storage.StorageFailure.Code.*;

class FilePolicyTest {
    static String hash(byte[] bytes) throws Exception { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes)); }
    static FilePolicy.Claim claim(String name, String mime, byte[] bytes) throws Exception { return new FilePolicy.Claim(name,bytes.length,hash(bytes),mime); }
    static void failure(Runnable action, StorageFailure.Code code) {
        assertThatThrownBy(action::run).isInstanceOfSatisfying(StorageFailure.class, e -> assertThat(e.code()).isEqualTo(code));
    }
    @Test void koreanMarkdownAndFinalNewlineAreVerifiedExactly() throws Exception {
        byte[] bytes="제목\n\n```json\n{\"값\":1}\n```\n".getBytes(StandardCharsets.UTF_8);
        var result=FilePolicy.verify(new ByteArrayInputStream(bytes),claim("검증 문서.md","text/markdown",bytes));
        assertThat(result.sha256()).isEqualTo(hash(bytes));assertThat(result.sizeBytes()).isEqualTo(bytes.length);
        assertThat(result.detectedMime()).isEqualTo("text/markdown");
    }
    @Test void utf8SpanningBufferBoundaryWorksAndInvalidSequencesFail() throws Exception {
        byte[] bytes=("a".repeat(65535)+"한글\n").getBytes(StandardCharsets.UTF_8);
        assertThat(FilePolicy.verify(new ByteArrayInputStream(bytes),claim("large.txt","text/plain",bytes)).sha256()).isEqualTo(hash(bytes));
        byte[] invalid={(byte)0xc0,(byte)0xaf};
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream(invalid),claim("invalid.txt","text/plain",invalid)))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(TYPE_MISMATCH));
    }
    @Test void namesRejectTraversalControlsBidiAndUnsupportedExtension() {
        for(String name:new String[]{"../a.txt","x\\a.txt","a\r\n.txt","a\u202E.txt","a.txt."," a.txt","a:b.txt"})
            failure(()->FilePolicy.safeName(name),INVALID_FILE);
        failure(()->new FilePolicy.Claim("image.svg",10,"0".repeat(64),"image/svg+xml"),TYPE_MISMATCH);
        failure(()->new FilePolicy.Claim("page.html",10,"0".repeat(64),"text/html"),TYPE_MISMATCH);
        failure(()->new FilePolicy.Claim("too-big.zip",FilePolicy.MAX_BYTES+1,"0".repeat(64),"application/zip"),INVALID_FILE);
    }
    @Test void claimedMimeAndDetectedBytesMustAgree() throws Exception {
        byte[] html="<!doctype html><html>test</html>".getBytes(StandardCharsets.UTF_8);
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream(html),claim("spoof.txt","text/plain",html)))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(TYPE_MISMATCH));
        byte[] png={ (byte)0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0};
        assertThat(FilePolicy.verify(new ByteArrayInputStream(png),claim("image.png","image/png",png)).detectedMime()).isEqualTo("image/png");
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream(png),claim("fake.pdf","application/pdf",png)))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(TYPE_MISMATCH));
        failure(()->new FilePolicy.Claim("image.png",10,"0".repeat(64),"text/plain"),TYPE_MISMATCH);
    }
    @Test void actualDigestAndExactLengthAreRequired() throws Exception {
        byte[] bytes="test\n".getBytes(StandardCharsets.UTF_8);
        var wrongDigest=new FilePolicy.Claim("test.txt",bytes.length,"0".repeat(64),"text/plain");
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream(bytes),wrongDigest))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(DIGEST_MISMATCH));
        var correct=claim("test.txt","text/plain",bytes);
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream("test\n!".getBytes(StandardCharsets.UTF_8)),correct))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(SIZE_MISMATCH));
        assertThatThrownBy(()->FilePolicy.verify(new ByteArrayInputStream("test".getBytes(StandardCharsets.UTF_8)),correct))
            .isInstanceOfSatisfying(StorageFailure.class,e->assertThat(e.code()).isEqualTo(SIZE_MISMATCH));
    }
    @Test void readsOnlyOneByteBeyondClaimAndNeverBuffersWholeObject() throws Exception {
        var claim=new FilePolicy.Claim("bounded.txt",17,"0".repeat(64),"text/plain");
        int[] read={0};
        InputStream source=new InputStream(){
            public int read(){read[0]++;return 'a';}
            public int read(byte[] b,int off,int len){java.util.Arrays.fill(b,off,off+len,(byte)'a');read[0]+=len;return len;}
        };
        assertThatThrownBy(()->FilePolicy.verify(source,claim)).isInstanceOf(StorageFailure.class);
        assertThat(read[0]).isEqualTo(18);
    }
    @Test void signatureAllowlistHandlesZipApkPdfJpegAndWebpWithoutExtracting() throws Exception {
        String[] names={"a.zip","a.apk","a.pdf","a.jpeg","a.webp"};
        String[] mimes={"application/zip","application/vnd.android.package-archive","application/pdf","image/jpeg","image/webp"};
        byte[][] bytes={{0x50,0x4b,0x03,0x04},{0x50,0x4b,0x03,0x04},{0x25,0x50,0x44,0x46,0x2d},{(byte)0xff,(byte)0xd8,(byte)0xff},{0x52,0x49,0x46,0x46,0,0,0,0,'W','E','B','P'}};
        for(int i=0;i<names.length;i++) assertThat(FilePolicy.verify(new ByteArrayInputStream(bytes[i]),claim(names[i],mimes[i],bytes[i])).detectedMime()).isEqualTo(mimes[i]);
    }
}
