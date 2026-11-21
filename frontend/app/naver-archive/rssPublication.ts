export function rssCompletionPublication(day:string,externalId:string,source:{externalPostId:string;publishedAt:string|null}|null){
 const original=source?.publishedAt;
 if(original&&source.externalPostId===externalId&&new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Seoul"}).format(new Date(original))===day)return original;
 return day?`${day}T00:00:00+09:00`:null;
}
