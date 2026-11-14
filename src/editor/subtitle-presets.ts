import type { Cue } from '../project/model';

export const subtitleSizes = [
  { label: '작게 · 3%', size: 0.03 },
  { label: '기본 · 5%', size: 0.05 },
  { label: '크게 · 7%', size: 0.07 },
  { label: '제목 · 10%', size: 0.1 },
];
export const subtitlePositions = [
  { label: '상단 왼쪽', x: 0.25, y: 0.12 },
  { label: '상단 중앙', x: 0.5, y: 0.12 },
  { label: '상단 오른쪽', x: 0.75, y: 0.12 },
  { label: '중앙 왼쪽', x: 0.25, y: 0.5 },
  { label: '화면 중앙', x: 0.5, y: 0.5 },
  { label: '중앙 오른쪽', x: 0.75, y: 0.5 },
  { label: '하단 왼쪽', x: 0.25, y: 0.9 },
  { label: '하단 중앙', x: 0.5, y: 0.9 },
  { label: '하단 오른쪽', x: 0.75, y: 0.9 },
];
export const subtitleStyles: { label: string; patch: Partial<Cue> }[] = [
  {
    label: '기본 · 흰 글자 / 검정 70%',
    patch: { color: '#ffffff', background: '#000000', colorOpacity: 1, backgroundOpacity: 0.7 },
  },
  {
    label: '깔끔한 흰색 · 배경 없음',
    patch: { color: '#ffffff', background: '#000000', colorOpacity: 1, backgroundOpacity: 0 },
  },
  {
    label: '강조 노랑 · 배경 없음',
    patch: { color: '#ffe34d', background: '#000000', colorOpacity: 1, backgroundOpacity: 0 },
  },
  {
    label: '노랑 / 검정 80%',
    patch: { color: '#ffe34d', background: '#000000', colorOpacity: 1, backgroundOpacity: 0.8 },
  },
  {
    label: '검정 / 흰색 90%',
    patch: { color: '#111111', background: '#ffffff', colorOpacity: 1, backgroundOpacity: 0.9 },
  },
  {
    label: '흰색 / 네이비 85%',
    patch: { color: '#ffffff', background: '#142b52', colorOpacity: 1, backgroundOpacity: 0.85 },
  },
  {
    label: '민트 · 배경 없음',
    patch: { color: '#83ffe0', background: '#000000', colorOpacity: 1, backgroundOpacity: 0 },
  },
  {
    label: '은은한 흰색 65% · 배경 없음',
    patch: { color: '#ffffff', background: '#000000', colorOpacity: 0.65, backgroundOpacity: 0 },
  },
];
