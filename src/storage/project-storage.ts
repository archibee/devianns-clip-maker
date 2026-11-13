import { parseProject } from '../project/validation';
import type { Project } from '../project/model';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ssg-clip-maker', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('project');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('다른 탭이 자동 저장소를 사용하고 있습니다.'));
  });
}
export async function autosave(project: Project) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('project', 'readwrite');
      tx.objectStore('project').put(JSON.stringify(project), 'latest');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function recover(): Promise<Project | null> {
  const db = await database();
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('project', 'readonly');
      const request = tx.objectStore('project').get('latest');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return typeof value === 'string' ? parseProject(value) : null;
  } finally {
    db.close();
  }
}
export function saveProject(project: Project) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[<>:"/\\|?*]/g, '_')}.ssg.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
