/**
 * StateMachine.ts — Track lifecycle FSM
 * Valid transitions and side effects.
 */
import {TrackState} from '../tracking/Track';

export interface TransitionResult {
  newState: TrackState;
  sideEffect?: 'INCREMENT_COUNT' | 'EMIT_UNCERTAIN' | 'MARK_DELETED' | 'EMIT_REACQUIRED';
}

type TransitionTable = Partial<Record<TrackState, Partial<Record<TrackState, TransitionResult>>>>;

const TRANSITIONS: TransitionTable = {
  [TrackState.DETECTED]: {
    [TrackState.CONFIRMED]: {newState: TrackState.CONFIRMED},
    [TrackState.DELETED]:   {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
    [TrackState.REJECTED]:  {newState: TrackState.REJECTED},
  },
  [TrackState.CONFIRMED]: {
    [TrackState.TRACKING]:  {newState: TrackState.TRACKING},
    [TrackState.LOST]:      {newState: TrackState.LOST},
    [TrackState.DELETED]:   {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.TRACKING]: {
    [TrackState.APPROACHING]: {newState: TrackState.APPROACHING},
    [TrackState.LOST]:        {newState: TrackState.LOST},
    [TrackState.OCCLUDED]:    {newState: TrackState.OCCLUDED},
    [TrackState.DELETED]:     {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.APPROACHING]: {
    [TrackState.CROSSED]:  {newState: TrackState.CROSSED},
    [TrackState.TRACKING]: {newState: TrackState.TRACKING}, // exit zone without crossing
    [TrackState.LOST]:     {newState: TrackState.LOST},
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.CROSSED]: {
    [TrackState.COUNTED]:  {newState: TrackState.COUNTED, sideEffect: 'INCREMENT_COUNT'},
    [TrackState.TRACKING]: {newState: TrackState.TRACKING}, // wrong direction — revert
    [TrackState.REJECTED]: {newState: TrackState.REJECTED},
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.COUNTED]: {
    [TrackState.COUNTED]:  {newState: TrackState.COUNTED},  // idempotent
    [TrackState.EXITED]:   {newState: TrackState.EXITED},
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.EXITED]: {
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.LOST]: {
    [TrackState.REACQUIRED]: {newState: TrackState.REACQUIRED, sideEffect: 'EMIT_REACQUIRED'},
    [TrackState.DELETED]:    {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.REACQUIRED]: {
    [TrackState.TRACKING]: {newState: TrackState.TRACKING},
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.OCCLUDED]: {
    [TrackState.TRACKING]: {newState: TrackState.TRACKING},
    [TrackState.LOST]:     {newState: TrackState.LOST},
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.MERGED]: {
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.REJECTED]: {
    [TrackState.DELETED]:  {newState: TrackState.DELETED, sideEffect: 'MARK_DELETED'},
  },
  [TrackState.DELETED]: {}, // Terminal state — no transitions
};

export class TrackStateMachine {
  transition(from: TrackState, to: TrackState): TransitionResult | null {
    const fromMap = TRANSITIONS[from];
    if (!fromMap) return null;
    return fromMap[to] ?? null;
  }

  isValid(from: TrackState, to: TrackState): boolean {
    return this.transition(from, to) !== null;
  }

  getValidNextStates(from: TrackState): TrackState[] {
    const fromMap = TRANSITIONS[from];
    if (!fromMap) return [];
    return Object.keys(fromMap) as TrackState[];
  }
}

export const trackStateMachine = new TrackStateMachine();
