'use client';
import {useEffect,useState} from 'react';
import Today,{type WorkpadDocumentSource} from '../Today';
import {workflowApi,type FixedTab} from '@/lib/api/workflow';
import './routine.css';

export default function WorkRoutinePage() {
  const [document,setDocument]=useState<FixedTab|null>(null),[error,setError]=useState('');
  useEffect(()=>{let live=true;workflowApi.routine().then(value=>{if(live)setDocument(value);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
  if(error)return <div className="wf-error" role="alert">{error}<button onClick={()=>window.location.reload()}>다시 시도</button></div>;
  if(!document)return <p role="status">Work Routine을 불러오는 중…</p>;
  const day=(value:FixedTab)=>({...value,date:'2000-01-01'});
  const source:WorkpadDocumentSource={id:'work-routine:'+document.id,title:'Work Routine',slot:'work-routine',bodyLabel:'워크루틴 편집기',
    load:()=>workflowApi.routine().then(day),save:input=>workflowApi.saveRoutine(input).then(day)};
  return <Today key={document.id} documentSource={source} routine/>;
}
