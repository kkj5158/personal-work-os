package com.kafka.backend.common;

import javax.imageio.ImageIO;
import java.io.*;
import java.util.*;

/** Shared NOTE SYS / WORK FLOW raster validation. MIME is detected from bytes. */
public final class RasterMedia {
    private RasterMedia() {}
    public record Image(byte[] data,String mimeType,int width,int height) {}
    public static Image decode(String encoded) throws IOException {
        if(encoded==null||encoded.length()>13981016)throw new InvalidRequestException("이미지는 최대 10MB입니다.");
        byte[] data;try{data=Base64.getDecoder().decode(encoded);}catch(IllegalArgumentException e){throw new InvalidRequestException("이미지 데이터가 올바르지 않습니다.");}
        if(data.length==0||data.length>10485760)throw new InvalidRequestException("이미지는 최대 10MB입니다.");
        String mime;int width,height;
        try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(data))){
            var readers=ImageIO.getImageReaders(stream);if(!readers.hasNext())throw new InvalidRequestException("PNG, JPEG, GIF 이미지를 사용하세요. WebP는 브라우저에서 PNG로 변환됩니다.");
            var reader=readers.next();try{reader.setInput(stream);width=reader.getWidth(0);height=reader.getHeight(0);mime=switch(reader.getFormatName().toLowerCase(Locale.ROOT)){case "png"->"image/png";case "jpeg","jpg"->"image/jpeg";case "gif"->"image/gif";default->throw new InvalidRequestException("지원하지 않는 이미지 형식입니다.");};}finally{reader.dispose();}
        }
        if(width<1||height<1||(long)width*height>40000000)throw new InvalidRequestException("이미지 해상도가 너무 큽니다 (최대 40MP).");
        return new Image(data,mime,width,height);
    }
}
