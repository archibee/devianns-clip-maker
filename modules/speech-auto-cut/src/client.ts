import type { Analysis, Progress, Request, Response } from './contracts';

export class AnalysisClient {
  private worker?: Worker;
  private reject?: (error: Error) => void;
  run(request: Request, onProgress: (progress: Progress) => void): Promise<Analysis> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.reject = reject;
      try {
        const worker = new Worker(new URL('./analyze.worker.ts', import.meta.url), {
          type: 'module',
        });
        this.worker = worker;
        const finish = () => {
          worker.terminate();
          if (this.worker === worker) {
            this.worker = undefined;
            this.reject = undefined;
          }
        };
        worker.onmessage = (event: MessageEvent<Response>) => {
          if (this.worker !== worker) return;
          const message = event.data;
          if (message.type === 'progress') onProgress(message);
          else {
            finish();
            if (message.type === 'result') resolve(message.result);
            else reject(new Error(message.message));
          }
        };
        worker.onerror = (event) => {
          finish();
          reject(new Error(event.message || '분석 Worker를 실행하지 못했습니다.'));
        };
        worker.postMessage(request);
      } catch (error) {
        this.cancel();
        reject(error);
      }
    });
  }
  cancel() {
    this.worker?.terminate();
    this.worker = undefined;
    const reject = this.reject;
    this.reject = undefined;
    reject?.(new DOMException('분석을 취소했습니다.', 'AbortError'));
  }
}
