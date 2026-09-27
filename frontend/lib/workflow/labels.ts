import type { Priority, ProjectStatus, ProjectType, ResourceType, TaskStatus } from '../api/workflow';

/** Canonical Task statuses. "보류" is a Project status, never a Task status; archive is separate. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { TODO: '할 일', DOING: '진행 중', WAITING: '대기', DONE: '완료' };
export const TASK_STATUSES = Object.keys(TASK_STATUS_LABELS) as TaskStatus[];
export const PRIORITY_LABELS: Record<Priority, string> = { LOW: '낮음', NORMAL: '보통', HIGH: '높음' };
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { READY: '준비', ACTIVE: '진행', PAUSED: '보류', DONE: '완료' };
export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = { GENERAL: '일반', DEVELOPMENT: '개발', CONTENT: '콘텐츠', PERSONAL: '개인' };
export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = { NOTE: '노트', DRIVE: '문서', DESIGN: '디자인', GIT: 'Git', AI_CHAT: 'AI 대화', WEB: '웹' };
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
/** "9. 30. (수)" style short date for a YYYY-MM-DD key, independent of the browser zone. */
export function shortDate(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}. ${d.getUTCDate()}. (${WEEKDAYS[d.getUTCDay()]})`;
}
