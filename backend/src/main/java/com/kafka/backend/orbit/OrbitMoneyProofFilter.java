package com.kafka.backend.orbit;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.util.*;

/** Short-lived signed broker entitlement bound to upstream user token and exact HTTP request.
 * The broker rechecks its live OAuth grant before signing; model-supplied scope headers confer nothing.
 */
public final class OrbitMoneyProofFilter extends OncePerRequestFilter {
 private final JwtDecoder decoder;private final String issuer,audience;
 public OrbitMoneyProofFilter(String issuer,String audience){
  this.issuer=issuer;this.audience=audience;
  if(issuer.isBlank()||audience.isBlank()){decoder=null;return;}
  if(!Set.of("https://orbit-pos-mcp-dev-development.up.railway.app","https://orbit-pos-mcp-prod-production.up.railway.app").contains(issuer)||!Set.of("https://workflow-api-development-development.up.railway.app","https://personal-work-os-prod-production.up.railway.app").contains(audience)||issuer.contains("-dev-")!=audience.contains("-development-"))throw new IllegalArgumentException("ORBIT environment identity mismatch");
  var d=NimbusJwtDecoder.withJwkSetUri(issuer+"/jwks").jwsAlgorithm(SignatureAlgorithm.ES256).build();
  d.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));decoder=d;
 }
 public OrbitMoneyProofFilter(JwtDecoder decoder,String issuer,String audience){this.decoder=decoder;this.issuer=issuer;this.audience=audience;}
 public static String digest(String value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}}
 public boolean valid(JwtAuthenticationToken user,String method,String path,String query,String body,String proof){
  if(decoder==null||proof==null||proof.length()>8192)return false;
  try{var p=decoder.decode(proof);var now=Instant.now();String scope="GET".equals(method)?"orbit:read":"orbit:write:money";
   return issuer.equals(p.getIssuer().toString())&&p.getAudience().equals(List.of(audience))&&user.getName().equals(p.getSubject())
    &&Objects.equals(user.getTokenAttributes().get("client_id"),p.getClaimAsString("upstream_client"))
    &&"orbit-money-v1".equals(p.getClaimAsString("purpose"))&&scope.equals(p.getClaimAsString("scope"))
    &&p.getIssuedAt()!=null&&p.getExpiresAt()!=null&&p.getIssuedAt().isAfter(now.minusSeconds(35))&&!p.getIssuedAt().isAfter(now.plusSeconds(2))&&p.getExpiresAt().isAfter(now)&&p.getExpiresAt().isBefore(p.getIssuedAt().plusSeconds(36))
    &&digest(user.getToken().getTokenValue()).equals(p.getClaimAsString("upstream_hash"))
    &&digest(method+"\n"+path+(query==null?"":"?"+query)+"\n"+body).equals(p.getClaimAsString("request_hash"))
    &&p.getClaimAsString("orbit_grant")!=null&&p.getClaimAsString("client_id")!=null;
  }catch(RuntimeException e){return false;}
 }
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain)throws IOException,ServletException{
  var a=SecurityContextHolder.getContext().getAuthentication();
  if(!request.getServletPath().startsWith(OrbitMoneyRoutes.PREFIX)||!(a instanceof JwtAuthenticationToken user)||!user.getTokenAttributes().containsKey("client_id")){chain.doFilter(request,response);return;}
  byte[] body=request.getInputStream().readNBytes(65537);
  if(body.length>65536||!valid(user,request.getMethod(),request.getServletPath(),request.getQueryString(),new String(body,StandardCharsets.UTF_8),request.getHeader("X-Orbit-Money-Proof"))){response.setStatus(403);response.setContentType("application/json");response.setHeader("Cache-Control","no-store");response.getWriter().write("{\"error\":\"FORBIDDEN\",\"message\":\"Explicit ORBIT scope and signed request entitlement required\"}");return;}
  chain.doFilter(new HttpServletRequestWrapper(request){
   @Override public ServletInputStream getInputStream(){var input=new ByteArrayInputStream(body);return new ServletInputStream(){public int read(){return input.read();}public boolean isFinished(){return input.available()==0;}public boolean isReady(){return true;}public void setReadListener(ReadListener listener){throw new UnsupportedOperationException();}};}
   @Override public BufferedReader getReader(){return new BufferedReader(new InputStreamReader(getInputStream(),StandardCharsets.UTF_8));}
  },response);
 }
}
