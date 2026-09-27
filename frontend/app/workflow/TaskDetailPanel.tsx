'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarPlus, Copy, Archive, ArchiveRestore, Trash2, X, Sun, Pin, PinOff, Link2, NotebookText, Info, CalendarDays, Target, FileText, Hourglass, History } from 'lucide-react';
import { workflowApi, type RecentRecord, type Resource, type TaskStatus, type TopicNote, type WorkTask } from '@/lib/api/workflow';
import { WorkflowConflictError, planDatesOf } from '@/lib/workflow/store';
import { PRIORITY_LABELS, RESOURCE_TYPE_LABELS, TASK_STATUSES, TASK_STATUS_LABELS, shortDate } from '@/lib/workflow/labels';
import { projectColor } from '@/lib/workflow/timeline';
import { useWorkflow } from './WorkflowContext';

type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

/** Text input that keeps a local draft: remote updates never overwrite unsaved typing, failed saves keep it. */
function DraftText({ value, onCommit, label, multiline = false, placeholder, className = '', reset }: {
  value: string; onCommit: (value: string) => Promise<boolean>; label: string; multiline?: boolean; placeholder?: string; className?: string; reset: number;
}) {
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false), timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Follow the confirmed value while there is no unsaved local draft (or after an explicit reset).
  useEffect(() => { if (!dirty.current) setDraft(value); }, [value]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { dirty.current = false; setDraft(value); }, [reset]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearTimeout(timer.current), []);
  async function commit(next = draft) {
    clearTimeout(timer.current);
    if (next === value) { dirty.current = false; return; }
    if (await onCommit(next)) dirty.current = false;
  }
  const change = (next: string) => {
    dirty.current = true; setDraft(next);
    if (multiline) { clearTimeout(timer.current); timer.current = setTimeout(() => void commit(next), 900); }
  };
  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void commit(); }
    if (event.key === 'Escape') { dirty.current = false; setDraft(value); }
  };
  return multiline
    ? <textarea aria-label={label} className={className} placeholder={placeholder} value={draft} rows={5} onChange={event => change(event.target.value)} onBlur={() => void commit()}/>
    : <input aria-label={label} className={className} placeholder={placeholder} value={draft} onChange={event => change(event.target.value)} onBlur={() => void commit()} onKeyDown={key}/>;
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`wf-td-field ${wide ? 'is-wide' : ''}`}><span>{label}</span>{children}</label>;
}

/** Quiet S10 section: icon + heading + optional hint, separated by spacing and a light surface — not a nested card. */
function Block({ icon, title, hint, count, actions, className = '', label, children }: {
  icon: ReactNode; title: string; hint?: string; count?: number; actions?: ReactNode; className?: string; label?: string; children?: ReactNode;
}) {
  const heading = useId();
  // Named by its visible heading; an explicit label (e.g. "대기 정보") overrides it.
  return <section className={`wf-td-block ${className}`} aria-label={label} aria-labelledby={label ? undefined : heading}>
    <header className="wf-td-block-head"><span className="wf-td-block-icon" aria-hidden>{icon}</span>
      <div><h3 id={heading}>{title}{count !== undefined && <small>{count}</small>}</h3>{hint && <p>{hint}</p>}</div>{actions}</header>
    {children}
  </section>;
}

/**
 * S10 — shared, non-modal Task detail. Every normal edit autosaves through the revision-checked store; Delete,
 * Duplicate and Archive stay explicit. No owner/assignee, subtasks, templates, rich text or file upload: files,
 * documents, notes and URLs are linked resources.
 */
export default function TaskDetailPanel({ taskId, onClose, onSelect }: { taskId: string; onClose?: () => void; onSelect?: (id: string | null) => void }) {
  const flow = useWorkflow();
  const task = flow.tasks.find(item => item.id === taskId);
  const [save, setSave] = useState<SaveState>('idle'), [message, setMessage] = useState(''), [reset, setReset] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false), [newDate, setNewDate] = useState('');
  const { ensureWeek } = flow;
  useEffect(() => { void ensureWeek(); }, [ensureWeek]);
  if (!task) return <section className="wf-td wf-td-empty"><p>작업을 찾을 수 없습니다. 삭제되었거나 다른 창에서 이동되었을 수 있습니다.</p>{onClose && <button onClick={onClose}>닫기</button>}</section>;
  const current = task;
  const project = flow.projects.find(item => item.id === current.projectId);
  const phases = flow.phases.filter(item => item.projectId === current.projectId).sort((a, b) => a.order - b.order);
  const planDates = planDatesOf(flow, current.id);
  const weekItem = flow.week?.tasks.find(item => item.taskId === current.id);

  async function run(action: () => Promise<unknown>, done = ''): Promise<boolean> {
    setSave('saving'); setMessage('');
    try { await action(); setSave('saved'); setMessage(done); return true; }
    catch (e) {
      if (e instanceof WorkflowConflictError) { setSave('conflict'); setMessage(e.message); }
      else { setSave('error'); setMessage(e instanceof Error ? e.message : '저장하지 못했습니다.'); }
      return false;
    }
  }
  const patch = (value: Partial<WorkTask>) => run(() => flow.updateTask(current.id, value));
  const status = (next: TaskStatus) => run(() => flow.setTaskStatus(current.id, { status: next }));
  const saveLabel = save === 'saving' ? '저장 중…' : save === 'saved' ? '저장됨' : save === 'conflict' ? '충돌 확인 필요' : save === 'error' ? '저장 실패' : '자동 저장';

  return <section className="wf-td" aria-label={`작업 상세: ${current.title}`}>
    <header className="wf-td-top">
      <span className="wf-td-project"><span className="wf-color-dot" style={{ background: project ? projectColor(project.color) : '#8491a4' }}/>{project?.title ?? '프로젝트 없음'}</span>
      <span className={`wf-td-save is-${save}`} role="status">{saveLabel}</span>
      {onClose && <button className="wf-td-icon" aria-label="상세 닫기" onClick={onClose}><X size={16}/></button>}
    </header>
    <DraftText label="작업 제목" className="wf-td-title" value={current.title} reset={reset} onCommit={value => value.trim() ? patch({ title: value.trim() }) : Promise.resolve(false)}/>
    {current.archivedAt && <p className="wf-td-note">보관된 작업입니다. 활성 목록과 진행률에서 제외됩니다.</p>}
    {(save === 'conflict' || save === 'error') && <div className="wf-td-alert" role="alert"><p>{message}</p>
      {save === 'conflict' && <><button onClick={() => { setReset(value => value + 1); setSave('idle'); setMessage(''); }}>최신 값 사용</button><span className="wf-muted">내 입력은 칸에 남아 있으며, 다시 저장하려면 칸을 벗어나거나 Enter를 누르세요.</span></>}
    </div>}

    <div className="wf-td-actions-top">
      <button className="wf-td-primary" onClick={() => void run(() => flow.addToToday(current.id), '오늘 Workpad에 연결했습니다.')}><Sun size={15}/>오늘에 추가</button>
      {save === 'saved' && message && <span className="wf-muted">{message}</span>}
    </div>

    <Block icon={<Info size={15}/>} title="기본 정보">
      <div className="wf-td-grid">
        <Field wide label="프로젝트"><select aria-label="작업 프로젝트" value={current.projectId ?? ''} onChange={event => void patch({ projectId: event.target.value || null, phaseId: null })}>
          <option value="">프로젝트 없음</option>
          {flow.projects.filter(item => !item.archivedAt || item.id === current.projectId).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></Field>
        <Field label="상태"><select aria-label="작업 상태" value={current.status} onChange={event => void status(event.target.value as TaskStatus)}>
          {TASK_STATUSES.map(value => <option key={value} value={value}>{TASK_STATUS_LABELS[value]}</option>)}
        </select></Field>
        <Field label="우선순위"><select aria-label="작업 우선순위" value={current.priority} onChange={event => void patch({ priority: event.target.value as WorkTask['priority'] })}>
          {(['HIGH', 'NORMAL', 'LOW'] as const).map(value => <option key={value} value={value}>{PRIORITY_LABELS[value]}</option>)}
        </select></Field>
      </div>
    </Block>

    {current.status === 'WAITING' && <Block icon={<Hourglass size={15}/>} title="대기" hint="무엇을 기다리는지와 결과가 오면 할 일을 남겨 둡니다." className="is-waiting" label="대기 정보">
      <div className="wf-td-grid">
        <Field wide label="대기 이유"><DraftText label="대기 이유" value={current.waitingReason ?? ''} reset={reset} placeholder="무엇을 기다리나요?" onCommit={value => patch({ waitingReason: value || null })}/></Field>
        <Field wide label="결과가 오면"><DraftText label="결과가 오면 할 일" value={current.waitingNextAction ?? ''} reset={reset} placeholder="결과가 오면 할 다음 행동" onCommit={value => patch({ waitingNextAction: value || null })}/></Field>
        <Field label="확인 날짜"><input type="date" aria-label="확인 날짜" value={current.waitingCheckDate ?? ''} onChange={event => void patch({ waitingCheckDate: event.target.value || null })}/></Field>
        <label className="wf-td-check"><input type="checkbox" checked={!!current.waitingFlagged} onChange={event => void patch({ waitingFlagged: event.target.checked })}/>지금 확인할 일로 표시</label>
      </div>
    </Block>}

    <Block icon={<CalendarDays size={15}/>} title="일정 정보">
      <div className="wf-td-grid">
        <Field label="작업 묶음"><select aria-label="작업 묶음" value={current.phaseId ?? ''} disabled={!current.projectId} onChange={event => void patch({ phaseId: event.target.value || null })}>
          <option value="">묶음 없음</option>{phases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select></Field>
        <Field label="마감일"><input type="date" aria-label="마감일" value={current.deadlineDate ?? ''} onChange={event => void patch({ deadlineDate: event.target.value || null })}/></Field>
        <div className="wf-td-field wf-td-plan is-wide"><span>계획 날짜</span>
          <div className="wf-td-chips">
            {planDates.length ? planDates.map(date => <span key={date} className="wf-td-chip">{shortDate(date)}<button aria-label={`${date} 계획 제거`} onClick={() => void run(() => flow.removePlanDay(current.id, date))}><X size={12}/></button></span>) : <span className="wf-muted">날짜 미정</span>}
          </div>
          <div className="wf-td-add-date"><input type="date" aria-label="계획 날짜 추가" value={newDate} onChange={event => setNewDate(event.target.value)}/>
            <button aria-label="계획 날짜 추가하기" disabled={!newDate} onClick={() => { const date = newDate; setNewDate(''); void run(() => flow.addPlanDay(current.id, date)); }}><CalendarPlus size={14}/></button></div>
        </div>
      </div>
      {(current.startDate || current.dueDate) && <p className="wf-td-legacy" title="이전 Timeline에서 사용하던 기간입니다. 마감으로 사용하지 않습니다.">기존 Timeline 기간: {current.startDate ?? '—'} ~ {current.dueDate ?? '—'}</p>}
    </Block>

    <Block icon={<Target size={15}/>} title="이번 주" hint={weekItem?.selected ? '이번 주 집중 작업으로 선택됨' : weekItem?.plannedDates.length ? '이번 주에 날짜만 배치됨 (집중 선택 아님)' : '이번 주 집중 작업으로 선택할 수 있습니다.'} className="wf-td-week"
      actions={<button role="switch" aria-checked={!!weekItem?.selected} aria-label="이번 주 포함" disabled={!flow.week} className={`wf-switch ${weekItem?.selected ? 'on' : ''}`}
        onClick={() => void run(() => flow.setWeekSelection(current.id, !weekItem?.selected))}><span/></button>}/>

    <Block icon={<FileText size={15}/>} title="설명 / 메모">
      <DraftText multiline label="설명 / 메모" className="wf-td-memo" value={current.memo ?? ''} reset={reset} placeholder="작업의 맥락이나 메모를 적어 두세요." onCommit={value => patch({ memo: value || null })}/>
    </Block>
    <Resources taskId={current.id}/>
    <Records taskId={current.id} revision={current.revision ?? 0}/>
    {current.status === 'DONE' && current.completedAt && <p className="wf-muted">완료: {new Date(current.completedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>}

    <footer className="wf-td-footer">
      {confirmDelete ? <div className="wf-td-confirm"><span>작업을 삭제할까요? Workpad 기록은 남습니다.</span>
        <button className="wf-danger" onClick={() => void run(async () => { await flow.deleteTask(current.id); onSelect?.(null); onClose?.(); })}>삭제</button><button onClick={() => setConfirmDelete(false)}>취소</button></div>
        : <>
          <button className="wf-td-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>삭제</button>
          <button onClick={() => void run(async () => { const copy = await flow.duplicateTask(current.id); onSelect?.(copy.id); }, '새 작업으로 복제했습니다.')}><Copy size={15}/>복제</button>
          <button onClick={() => void run(() => flow.archiveTask(current.id, !current.archivedAt))}>{current.archivedAt ? <><ArchiveRestore size={15}/>보관 해제</> : <><Archive size={15}/>보관</>}</button>
        </>}
    </footer>
  </section>;
}

/** Linked resources: Shared Note Core notes by stable id, or original external URLs. Nothing is copied. */
function Resources({ taskId }: { taskId: string }) {
  const [items, setItems] = useState<Resource[]>([]), [error, setError] = useState(''), [mode, setMode] = useState<'none' | 'url' | 'note'>('none');
  const [url, setUrl] = useState(''), [title, setTitle] = useState(''), [query, setQuery] = useState(''), [notes, setNotes] = useState<TopicNote[]>([]), [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    workflowApi.resources({ taskId }).then(list => { if (live) { setItems(list); setError(''); } }).catch(e => { if (live) setError(e instanceof Error ? e.message : '연결 자료를 불러오지 못했습니다.'); });
    return () => { live = false; };
  }, [taskId]);
  useEffect(() => {
    if (mode !== 'note') return;
    let live = true; const timer = setTimeout(() => { workflowApi.searchNotes(query).then(list => { if (live) setNotes(list); }).catch(() => {}); }, 200);
    return () => { live = false; clearTimeout(timer); };
  }, [mode, query]);
  async function act(action: () => Promise<void>) { try { setError(''); await action(); } catch (e) { setError(e instanceof Error ? e.message : '저장하지 못했습니다.'); } }
  const sorted = [...items].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  return <Block icon={<Link2 size={15}/>} title="연결 자료" count={items.length} hint="노트, 문서, 디자인, 코드 링크를 원본 그대로 연결합니다.">
    <ul className="wf-td-resources">{sorted.map(item => <li key={item.id}>
      <span className="wf-td-type">{item.noteId ? <NotebookText size={14}/> : <Link2 size={14}/>}{RESOURCE_TYPE_LABELS[item.type]}</span>
      <a href={item.noteId ? `/workflow/today?note=${item.noteId}` : item.url ?? '#'} target={item.noteId ? undefined : '_blank'} rel="noopener noreferrer">{item.title}</a>
      <button aria-label={item.pinned ? `${item.title} 고정 해제` : `${item.title} 고정`} onClick={() => void act(async () => { const saved = await workflowApi.patchResource(item.id, { pinned: !item.pinned }); setItems(list => list.map(value => value.id === saved.id ? saved : value)); })}>{item.pinned ? <PinOff size={14}/> : <Pin size={14}/>}</button>
      {removing === item.id ? <><button className="wf-danger" onClick={() => void act(async () => { await workflowApi.deleteResource(item.id); setItems(list => list.filter(value => value.id !== item.id)); setRemoving(null); })}>연결 해제</button><button onClick={() => setRemoving(null)}>취소</button></>
        : <button aria-label={`${item.title} 연결 해제`} onClick={() => setRemoving(item.id)}><X size={14}/></button>}
    </li>)}</ul>
    {mode === 'none' && <div className="wf-td-inline-actions"><button onClick={() => setMode('url')}>+ 링크 연결</button><button onClick={() => setMode('note')}>+ 노트 연결</button></div>}
    {mode === 'url' && <form className="wf-td-resource-form" onSubmit={event => { event.preventDefault(); void act(async () => { const saved = await workflowApi.createResource({ taskId, url, title: title || null }); setItems(list => [...list, saved]); setUrl(''); setTitle(''); setMode('none'); }); }}>
      <input aria-label="자료 URL" placeholder="https://… (Drive, Figma, GitHub, ChatGPT/Claude, 웹)" value={url} onChange={event => setUrl(event.target.value)}/>
      <input aria-label="자료 제목" placeholder="제목 (선택)" value={title} onChange={event => setTitle(event.target.value)}/>
      <button disabled={!url.trim()}>연결</button><button type="button" onClick={() => setMode('none')}>취소</button>
    </form>}
    {mode === 'note' && <div className="wf-td-resource-form"><input aria-label="노트 검색" placeholder="노트 제목 검색" value={query} onChange={event => setQuery(event.target.value)}/>
      <ul className="wf-td-note-results">{notes.map(note => <li key={note.id}><button onClick={() => void act(async () => { const saved = await workflowApi.createResource({ taskId, noteId: note.id }); setItems(list => [...list, saved]); setMode('none'); setQuery(''); })}>{note.title}<small>{note.scope}</small></button></li>)}</ul>
      <button type="button" onClick={() => setMode('none')}>취소</button></div>}
    {error && <p className="wf-td-error" role="alert">{error}</p>}
  </Block>;
}

/** Recent Workpad records are a projection of this Task's TaskReferences, newest Workpad date first. */
function Records({ taskId, revision }: { taskId: string; revision: number }) {
  const [records, setRecords] = useState<RecentRecord[] | null>(null);
  useEffect(() => {
    let live = true;
    workflowApi.taskRecords(taskId, 5).then(list => { if (live) setRecords(list); }).catch(() => { if (live) setRecords([]); });
    return () => { live = false; };
  }, [taskId, revision]);
  return <Block icon={<History size={15}/>} title="최근 기록" count={records?.length ?? 0}>
    {records === null ? <p className="wf-muted">불러오는 중…</p> : records.length ? <ul className="wf-td-records">{records.map(record => <li key={record.blockId}>
      <a href={record.href}><strong>{shortDate(record.date)}</strong><span>{record.excerpt || record.taskTitle}</span>{(record.hasImage || record.hasNote) && <small>{[record.hasImage && '이미지', record.hasNote && '노트'].filter(Boolean).join(' · ')}</small>}</a>
    </li>)}</ul> : <p className="wf-muted">아직 Workpad 기록이 없습니다. 오늘에 추가하면 기록이 여기에 모입니다.</p>}
  </Block>;
}
