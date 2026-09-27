import {Suspense} from 'react';
import WeekFoundation from '../WeekFoundation';
export default function Page(){return <Suspense fallback={<p>이번 주 불러오는 중…</p>}><WeekFoundation/></Suspense>;}
