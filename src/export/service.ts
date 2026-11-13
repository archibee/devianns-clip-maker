import { cueErrors, duration, type ExportSettings, type Project } from '../project/model';
import { estimateBytes, MEMORY_LIMIT } from './settings';
import type { MediaRegistry } from '../media/registry';

export type ExportState = {
  status: 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
  progress: number;
  stage: string;
  error?: string;
  url?: string;
  filename?: string;
};
export class ExportService {
  private worker?: Worker;
  private url?: string;
  private requestId = 0;
  private cancelTimer?: ReturnType<typeof setTimeout>;
  constructor(private onState: (state: ExportState) => void) {}
  async start(
    project: Project,
    settings: ExportSettings,
    registry: MediaRegistry,
    direct: boolean,
  ) {
    let handle: FileSystemFileHandle | undefined;
    const filename = `${project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80) || 'clip'}.${settings.format}`;
    try {
      if (!duration(project)) throw new Error('타임라인에 영상을 추가하세요.');
      if (cueErrors(project).length) throw new Error(cueErrors(project)[0]);
      if (project.clips.some((c) => !registry.has(c.assetId)))
        throw new Error('누락된 원본을 먼저 다시 연결하세요.');
      const picker = (
        window as unknown as {
          showSaveFilePicker?: (options: object) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker;
      if (direct) {
        if (!picker)
          throw new Error('직접 파일 저장을 지원하지 않는 환경입니다. 다운로드를 선택하세요.');
        handle = await picker({
          suggestedName: filename,
          types: [
            {
              description: '편집 영상',
              accept: {
                [settings.format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${settings.format}`],
              },
            },
          ],
        });
      } else if (estimateBytes(project, settings) > MEMORY_LIMIT)
        throw new Error(
          '예상 크기가 256MiB를 초과합니다. 파일 직접 저장 또는 낮은 출력 설정을 선택하세요.',
        );
      this.dispose();
      const requestId = ++this.requestId;
      this.onState({ status: 'running', progress: 0, stage: '원본·인코더 준비' });
      const worker = new Worker(new URL('../workers/export.worker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker = worker;
      worker.onmessage = (event) => {
        const data = event.data;
        if (data.requestId !== requestId) return;
        if (data.type === 'progress')
          this.onState({ status: 'running', progress: data.progress, stage: data.stage });
        else {
          clearTimeout(this.cancelTimer);
          if (data.type === 'completed') {
            if (data.buffer)
              this.url = URL.createObjectURL(
                new Blob([data.buffer], {
                  type: settings.format === 'mp4' ? 'video/mp4' : 'video/webm',
                }),
              );
            this.onState({
              status: 'completed',
              progress: 1,
              stage: data.savedToDisk ? '파일 저장 완료' : '렌더링 완료 · 다운로드하세요',
              url: this.url,
              filename,
            });
          } else if (data.type === 'cancelled')
            this.onState({
              status: 'cancelled',
              progress: 0,
              stage: '취소됨 · 프로젝트는 유지됩니다',
            });
          else
            this.onState({
              status: 'error',
              progress: 0,
              stage: '내보내기 실패',
              error: data.message,
            });
          worker.terminate();
          if (this.worker === worker) this.worker = undefined;
        }
      };
      worker.onerror = (event) => {
        clearTimeout(this.cancelTimer);
        this.onState({ status: 'error', progress: 0, stage: 'Worker 오류', error: event.message });
        worker.terminate();
        this.worker = undefined;
      };
      worker.postMessage({
        type: 'start',
        requestId,
        project: structuredClone(project),
        settings,
        files: registry.files(),
        handle,
      });
    } catch (error) {
      this.worker?.terminate();
      this.worker = undefined;
      this.onState({
        status:
          error instanceof DOMException && error.name === 'AbortError' ? 'cancelled' : 'error',
        progress: 0,
        stage: '내보내기 시작 중단',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  cancel() {
    clearTimeout(this.cancelTimer);
    const worker = this.worker;
    worker?.postMessage({ type: 'cancel' });
    this.cancelTimer = setTimeout(() => {
      worker?.terminate();
      this.worker = undefined;
      this.onState({
        status: 'cancelled',
        progress: 0,
        stage: '작업 중단 · 직접 저장한 부분 파일이 있으면 확인하세요',
      });
    }, 5000);
  }
  dispose() {
    clearTimeout(this.cancelTimer);
    this.worker?.terminate();
    this.worker = undefined;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = undefined;
  }
}
