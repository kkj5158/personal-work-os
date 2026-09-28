import {Suspense} from 'react';
import Projects from '../Projects';
export default function Page(){return <Suspense fallback={<p>프로젝트 불러오는 중…</p>}><Projects/></Suspense>;}
