"use client";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section role="alert" className="p-6">
    <h1 className="text-lg font-semibold">화면을 표시하지 못했습니다</h1>
    <p className="my-3">현재 주소를 유지했습니다. 잠시 후 다시 시도하세요.</p>
    <button type="button" className="rounded border px-3 py-2" onClick={reset}>다시 시도</button>
  </section>;
}
