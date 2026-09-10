/**
 * sessionStore.ts — Zustand store for live session state
 */
import {create} from 'zustand';
import {SessionState, SessionSnapshot} from '../session/SessionManager';
import {SystemHealth} from '../confidence/ConfidenceEngine';
import {Track} from '../tracking/Track';
import {PipelineDiagnostics} from '../pipeline/Pipeline';
import {CountEvent} from '../counting/CountingEngine';

interface SessionStore {
  // Session state
  sessionState: SessionState;
  snapshot: SessionSnapshot | null;
  latestCountEvent: CountEvent | null;

  // Tracks (for overlay rendering)
  activeTracks: Track[];

  // System health
  health: SystemHealth | null;

  // Diagnostics
  diagnostics: PipelineDiagnostics | null;

  // Countdown
  countdownValue: number;

  // Actions
  setSessionState: (state: SessionState) => void;
  setSnapshot: (snapshot: SessionSnapshot) => void;
  setActiveTracks: (tracks: Track[]) => void;
  setHealth: (health: SystemHealth) => void;
  setDiagnostics: (diag: PipelineDiagnostics) => void;
  setCountdownValue: (val: number) => void;
  setLatestCountEvent: (event: CountEvent) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionStore>(set => ({
  sessionState: 'IDLE',
  snapshot: null,
  latestCountEvent: null,
  activeTracks: [],
  health: null,
  diagnostics: null,
  countdownValue: 3,

  setSessionState: state => set({sessionState: state}),
  setSnapshot: snapshot => set({snapshot}),
  setActiveTracks: activeTracks => set({activeTracks}),
  setHealth: health => set({health}),
  setDiagnostics: diagnostics => set({diagnostics}),
  setCountdownValue: countdownValue => set({countdownValue}),
  setLatestCountEvent: latestCountEvent => set({latestCountEvent}),
  reset: () =>
    set({
      sessionState: 'IDLE',
      snapshot: null,
      latestCountEvent: null,
      activeTracks: [],
      countdownValue: 3,
    }),
}));
