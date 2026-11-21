"use client";

type Props = {
 unknownDates:number;
 showingUnknown:boolean;
 hasDateRange:boolean;
 onShowUnknown:()=>void;
 onShowAll:()=>void;
};

export function ArchiveDateNotice({unknownDates,showingUnknown,hasDateRange,onShowUnknown,onShowAll}:Props){
 if(!unknownDates&&!showingUnknown)return null;
 return <section className="na-date-notice" aria-label="게시일 미확인 글 안내">
  <p>{showingUnknown?"게시일 미확인 글을 보고 있습니다.":`게시일 미확인 ${unknownDates}건도 보관되어 있습니다.`}</p>
  <p>{showingUnknown?"이 목록의 순서는 게시일 순서가 아닙니다.":hasDateRange?"날짜 범위에는 포함되지 않습니다. 따로 확인할 수 있습니다.":"게시일 순서 뒤에 표시됩니다. 따로 모아볼 수 있습니다."}</p>
  {showingUnknown?<button onClick={onShowAll}>전체 날짜 상태 보기</button>:<button onClick={onShowUnknown}>게시일 미확인 글 보기 ({unknownDates})</button>}
 </section>;
}
