package com.kafka.backend.money;

import org.springframework.stereotype.Component;
import org.springframework.beans.factory.annotation.Value;
import javax.crypto.Cipher;
import javax.crypto.spec.*;
import java.security.SecureRandom;
import java.util.*;
import java.nio.charset.StandardCharsets;
import static com.kafka.backend.money.MoneyService.require;

/** Encrypted original file retention. Key is deployment configuration, never returned/logged. */
@Component
public class MoneyStatementVault {
 private final String configured;private final SecureRandom random=new SecureRandom();
 public MoneyStatementVault(@Value("${MONEY_RECON_SOURCE_KEY:}") String key){configured=key;}
 public boolean available(){try{return Base64.getDecoder().decode(configured).length==32;}catch(IllegalArgumentException e){return false;}}
 private byte[] crypt(int mode,byte[] value,byte[] nonce,String context){try{require(available(),"STATEMENT_PRIVATE_RETENTION_NOT_CONFIGURED");var c=Cipher.getInstance("AES/GCM/NoPadding");c.init(mode,new SecretKeySpec(Base64.getDecoder().decode(configured),"AES"),new GCMParameterSpec(128,nonce));c.updateAAD(context.getBytes(StandardCharsets.UTF_8));return c.doFinal(value);}catch(com.kafka.backend.common.InvalidRequestException e){throw e;}catch(Exception e){throw new IllegalStateException("STATEMENT_VAULT_FAILURE");}}
 public byte[] seal(byte[] value,String context){byte[] nonce=new byte[12];random.nextBytes(nonce);byte[] encrypted=crypt(Cipher.ENCRYPT_MODE,value,nonce,context);byte[] result=Arrays.copyOf(nonce,nonce.length+encrypted.length);System.arraycopy(encrypted,0,result,nonce.length,encrypted.length);return result;}
 public byte[] open(byte[] value,String context){require(value.length>=28,"INVALID_PRIVATE_SOURCE");return crypt(Cipher.DECRYPT_MODE,Arrays.copyOfRange(value,12,value.length),Arrays.copyOf(value,12),context);}
}
