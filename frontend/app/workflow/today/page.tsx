import {Suspense} from 'react';
import Today from '../WorklogStream';
export default function Page(){return <Suspense fallback={<p>Workpad 불러오는 중…</p>}><Today/></Suspense>;}
