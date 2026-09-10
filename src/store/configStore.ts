/**
 * configStore.ts — Zustand store for user configuration & calibration
 */
import {create} from 'zustand';
import {CountingLineConfig, DEFAULT_COUNTING_LINE} from '../counting/CountingLine';
import {FilterConfig, DEFAULT_FILTER_CONFIG} from '../detection/DetectionFilter';
import {ByteTrackerConfig, DEFAULT_BYTETRACK_CONFIG} from '../tracking/ByteTracker';
import {SessionConfig, DEFAULT_SESSION_CONFIG} from '../session/SessionManager';

interface ConfigStore {
  // Counting line settings
  countingLine: CountingLineConfig;
  // Detection filter settings
  filter: FilterConfig;
  // Tracker settings
  tracker: ByteTrackerConfig;
  // Session settings
  session: SessionConfig;
  // UI
  debugMode: boolean;
  cameraResolution: '480p' | '720p' | '1080p';
  inferenceSkipFrames: number;
  // Actions
  updateCountingLine: (config: Partial<CountingLineConfig>) => void;
  updateFilter: (config: Partial<FilterConfig>) => void;
  updateTracker: (config: Partial<ByteTrackerConfig>) => void;
  updateSession: (config: Partial<SessionConfig>) => void;
  setDebugMode: (enabled: boolean) => void;
  setCameraResolution: (res: '480p' | '720p' | '1080p') => void;
  setInferenceSkipFrames: (n: number) => void;
  resetToDefaults: () => void;
}

export const useConfigStore = create<ConfigStore>(set => ({
  countingLine: DEFAULT_COUNTING_LINE,
  filter: DEFAULT_FILTER_CONFIG,
  tracker: DEFAULT_BYTETRACK_CONFIG,
  session: DEFAULT_SESSION_CONFIG,
  debugMode: false,
  cameraResolution: '720p',
  inferenceSkipFrames: 2,

  updateCountingLine: config =>
    set(s => ({countingLine: {...s.countingLine, ...config}})),
  updateFilter: config => set(s => ({filter: {...s.filter, ...config}})),
  updateTracker: config => set(s => ({tracker: {...s.tracker, ...config}})),
  updateSession: config => set(s => ({session: {...s.session, ...config}})),
  setDebugMode: debugMode => set({debugMode}),
  setCameraResolution: cameraResolution => set({cameraResolution}),
  setInferenceSkipFrames: inferenceSkipFrames => set({inferenceSkipFrames}),
  resetToDefaults: () =>
    set({
      countingLine: DEFAULT_COUNTING_LINE,
      filter: DEFAULT_FILTER_CONFIG,
      tracker: DEFAULT_BYTETRACK_CONFIG,
      session: DEFAULT_SESSION_CONFIG,
      debugMode: false,
      cameraResolution: '720p',
      inferenceSkipFrames: 2,
    }),
}));
