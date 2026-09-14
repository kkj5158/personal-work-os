package com.kafka.backend.workflow;

import com.kafka.backend.common.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import javax.imageio.ImageIO;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class WorkflowMediaTest {
    @Test void detectsMimeAndDimensionsFromRasterBytes()throws Exception {
        var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(3,2,BufferedImage.TYPE_INT_RGB),"png",out);
        var image=RasterMedia.decode(Base64.getEncoder().encodeToString(out.toByteArray()));
        assertThat(image.mimeType()).isEqualTo("image/png");assertThat(image.width()).isEqualTo(3);assertThat(image.height()).isEqualTo(2);
    }
    @Test void rejectsInvalidOrActiveContentBeforePersisting() {
        var db=mock(JdbcTemplate.class);var controller=new WorkflowMediaController(db,()->java.util.UUID.randomUUID());
        assertThatThrownBy(()->controller.upload(new WorkflowMediaController.Upload(Base64.getEncoder().encodeToString("<svg onload='bad()'/>".getBytes()),"image/png"))).isInstanceOf(InvalidRequestException.class);
        assertThatThrownBy(()->RasterMedia.decode("invalid base64!")).isInstanceOf(InvalidRequestException.class);verifyNoInteractions(db);
    }
}
