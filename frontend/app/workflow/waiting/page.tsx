import {Suspense} from 'react';
import Waiting from '../Waiting';
export default function Page(){return <Suspense fallback={<p>대기 목록 불러오는 중…</p>}><Waiting/></Suspense>;}
