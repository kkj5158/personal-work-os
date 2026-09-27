import {Suspense} from 'react';
import WaitingFoundation from '../WaitingFoundation';
export default function Page(){return <Suspense fallback={<p>대기 목록 불러오는 중…</p>}><WaitingFoundation/></Suspense>;}
