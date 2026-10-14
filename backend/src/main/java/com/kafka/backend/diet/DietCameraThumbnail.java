package com.kafka.backend.diet;
import com.kafka.backend.common.InvalidRequestException;
import java.awt.image.BufferedImage;
import java.awt.RenderingHints;
import java.io.*;
import javax.imageio.ImageIO;
/** Derived in memory, never another persisted image/source of truth. */
public final class DietCameraThumbnail {
    public static byte[] resize(byte[] bytes,int edge)throws IOException {
        if(edge<64||edge>512)throw new InvalidRequestException("썸네일 크기는 64~512입니다.");
        var image=ImageIO.read(new ByteArrayInputStream(bytes));
        if(image==null)throw new InvalidRequestException("사진을 읽지 못했습니다.");
        double scale=Math.min(1.0,(double)edge/Math.max(image.getWidth(),image.getHeight()));
        var target=new BufferedImage(Math.max(1,(int)Math.round(image.getWidth()*scale)),Math.max(1,(int)Math.round(image.getHeight()*scale)),BufferedImage.TYPE_INT_RGB);
        var g=target.createGraphics();g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BILINEAR);g.drawImage(image,0,0,target.getWidth(),target.getHeight(),null);g.dispose();
        var out=new ByteArrayOutputStream();ImageIO.write(target,"jpeg",out);return out.toByteArray();
    }
}
