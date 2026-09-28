import {Suspense} from 'react';
import Timeline from '../Timeline';
export default function Page(){return <Suspense fallback={<p>Timeline 불러오는 중…</p>}><Timeline/></Suspense>;}
