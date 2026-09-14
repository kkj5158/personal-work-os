import {Suspense} from 'react';
import Today from '../Today';
export default function Page(){return <Suspense fallback={<p>Workpad 불러오는 중…</p>}><Today/></Suspense>;}
