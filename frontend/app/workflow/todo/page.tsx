import {Suspense} from 'react';
import Todo from '../Todo';
export default function Page(){return <Suspense fallback={<p>모든 할 일 불러오는 중…</p>}><Todo/></Suspense>;}
