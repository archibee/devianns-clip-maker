import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaybackService, type PlaybackState } from '../src/playback/service';
import { MediaRegistry } from '../src/media/registry';
import { defaultTransform, emptyProject, type Project } from '../src/project/model';

vi.mock('../src/audio/timeline-audio', () => ({
  AUDIO_RATE: 48000,
  timelineAudio: async function* () {
    for (let n = 0; n < 20; n++)
      yield { timestamp: n / 10, frames: 4800, data: new Float32Array(9600) };
  },
}));
class Context {
  state = 'running';
  onstatechange: (() => void) | null = null;
  get currentTime() {
    return performance.now() / 1000;
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  createBuffer() {
    return { copyToChannel() {} };
  }
  createBufferSource() {
    return { connect() {}, disconnect() {}, start() {}, stop() {}, onended: null };
  }
}
function setup(sound: boolean) {
  let state: PlaybackState = { timeUs: 0, playing: false, buffering: false };
  const registry = new MediaRegistry();
  vi.spyOn(registry, 'has').mockReturnValue(true);
  vi.spyOn(registry, 'get').mockReturnValue({ media: {} } as never);
  const service = new PlaybackService(registry, (next) => {
    state = next;
  });
  const project: Project = {
    ...emptyProject(),
    assets: [
      {
        id: 'a',
        name: 'a.mp4',
        size: 1,
        lastModified: 0,
        width: 640,
        height: 360,
        durationUs: 2_000_000,
        hasAudio: sound,
        videoCodec: 'avc',
      },
    ],
    clips: [{ id: 'c', assetId: 'a', inUs: 0, outUs: 2_000_000, transform: defaultTransform() }],
  };
  service.bind(project);
  return { service, state: () => state };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, 'now').mockImplementation(() => Date.now());
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
    setTimeout(() => cb(performance.now()), 16),
  );
  vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
  vi.stubGlobal('AudioContext', Context);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe('재생 시작과 시계 회귀', () => {
  it('첫 영상 프레임이 준비되기 전에는 재생 시계를 진행하지 않는다', async () => {
    class WorkerStub {
      onmessage: ((event: MessageEvent) => void) | null = null;
      timers = new Set<ReturnType<typeof setTimeout>>();
      postMessage(job: { generation: number }) {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          this.onmessage?.({
            data: {
              type: 'frame',
              generation: job.generation,
              bitmap: { width: 960, height: 540, close() {} },
            },
          } as MessageEvent);
        }, 300);
        this.timers.add(timer);
      }
      terminate() {
        for (const timer of this.timers) clearTimeout(timer);
      }
    }
    vi.stubGlobal('Worker', WorkerStub);
    const p = setup(false);
    const draw = vi.fn();
    p.service.attach({
      width: 960,
      height: 540,
      getContext: () => ({ drawImage: draw }),
    } as unknown as HTMLCanvasElement);
    const started = p.service.play();
    await vi.advanceTimersByTimeAsync(400);
    expect(p.state().timeUs).toBe(0);
    await vi.advanceTimersByTimeAsync(400);
    await started;
    expect(draw).toHaveBeenCalled();
    expect(p.state().timeUs).toBeGreaterThan(0);
    p.service.dispose();
  });
  it('무음은 오디오 장치 없이 시간 진행·시킹·정지/재개·끝 도달을 처리한다', async () => {
    const constructor = vi.fn(() => {
      throw new Error('audio unavailable');
    });
    vi.stubGlobal('AudioContext', constructor);
    const p = setup(false);
    await p.service.play();
    await vi.advanceTimersByTimeAsync(500);
    expect(p.state().timeUs).toBeGreaterThan(400_000);
    expect(constructor).not.toHaveBeenCalled();
    p.service.pause();
    const stopped = p.state().timeUs;
    await vi.advanceTimersByTimeAsync(200);
    expect(p.state().timeUs).toBe(stopped);
    p.service.seek(1_000_000);
    await p.service.play();
    await vi.advanceTimersByTimeAsync(1100);
    expect(p.state().playing).toBe(false);
    expect(p.state().timeUs).toBe(2_000_000);
    p.service.dispose();
  });
  it('오디오 재개 후에도 suspended면 재생 중으로 남지 않고 오류를 알린다', async () => {
    class Suspended extends Context {
      async resume() {
        this.state = 'suspended';
      }
    }
    vi.stubGlobal('AudioContext', Suspended);
    const p = setup(true);
    await p.service.play();
    expect(p.state().playing).toBe(false);
    expect(p.state().error).toContain('오디오 장치');
    p.service.dispose();
  });
  it('응답 없는 resume을 제한 시간 뒤 해제하고 재시도할 수 있다', async () => {
    class Delayed extends Context {
      resume(): Promise<void> {
        return new Promise(() => {});
      }
    }
    vi.stubGlobal('AudioContext', Delayed);
    const p = setup(true);
    const started = p.service.play();
    expect(p.state().playing).toBe(true);
    await vi.advanceTimersByTimeAsync(4001);
    await started;
    expect(p.state().playing).toBe(false);
    expect(p.state().error).toContain('지연');
    p.service.dispose();
  });
  it('시작 대기 중 정지와 오래된 resume 실패가 다음 재생을 취소하지 않는다', async () => {
    let rejectOld: (error: Error) => void = () => {};
    let call = 0;
    class Racing extends Context {
      resume(): Promise<void> {
        return ++call === 1
          ? new Promise((_resolve, reject) => {
              rejectOld = reject;
            })
          : Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', Racing);
    const p = setup(true);
    const first = p.service.play();
    p.service.pause();
    await p.service.play();
    rejectOld(new Error('old start failed'));
    await first;
    await vi.advanceTimersByTimeAsync(300);
    expect(p.state().playing).toBe(true);
    expect(p.state().error).toBeUndefined();
    expect(p.state().timeUs).toBeGreaterThan(0);
    p.service.dispose();
  });
  it('running 상태라도 시계가 멈추면 정지하고 장치를 다시 만들 수 있게 한다', async () => {
    class Frozen extends Context {
      get currentTime() {
        return 0;
      }
    }
    vi.stubGlobal('AudioContext', Frozen);
    const p = setup(true);
    await p.service.play();
    await vi.advanceTimersByTimeAsync(2100);
    expect(p.state().playing).toBe(false);
    expect(p.state().error).toContain('시간이 멈췄');
    p.service.dispose();
  });
});
