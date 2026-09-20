export function formatDuration(value:number) {
 const minutes=Math.max(0,Math.round(value)),hours=Math.floor(minutes/60),rest=minutes%60;
 return hours ? `${hours}시간${rest ? ` ${rest}분` : ""}` : `${minutes}분`;
}
