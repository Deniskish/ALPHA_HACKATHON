import { CreditError, type ApplicationState } from './types';

// The only allowed state transitions. Everything else is rejected with INVALID_TRANSITION.
export const transitions: Readonly<Record<ApplicationState, readonly ApplicationState[]>> = {
  DRAFT: ['DATA_COLLECTION'],
  DATA_COLLECTION: ['READY_TO_SUBMIT'],
  READY_TO_SUBMIT: ['DATA_COLLECTION', 'SUBMITTED'],
  SUBMITTED: ['VALIDATING'],
  VALIDATING: ['ENRICHING', 'NEEDS_INFO'],
  ENRICHING: ['SCORING'],
  SCORING: ['DECISION'],
  DECISION: ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED'],
  NEEDS_INFO: ['DATA_COLLECTION', 'READY_TO_SUBMIT'],
  APPROVED: ['OFFER_ACCEPTED'],
  COUNTER_OFFER: ['OFFER_ACCEPTED'],
  REJECTED: [],
  OFFER_ACCEPTED: ['COMPLETED'],
  COMPLETED: [],
};

/** States in which the client may still change application data. */
export const editableStates: readonly ApplicationState[] = ['DRAFT', 'DATA_COLLECTION', 'READY_TO_SUBMIT', 'NEEDS_INFO'];
export const processingStates: readonly ApplicationState[] = ['SUBMITTED', 'VALIDATING', 'ENRICHING', 'SCORING', 'DECISION'];
export const decisionStates: readonly ApplicationState[] = ['APPROVED', 'COUNTER_OFFER', 'NEEDS_INFO', 'REJECTED'];
export const finalStates: readonly ApplicationState[] = ['REJECTED', 'COMPLETED'];

export function canTransition(from: ApplicationState, to: ApplicationState) {
  return transitions[from].includes(to);
}

export function assertTransition(from: ApplicationState, to: ApplicationState) {
  if (!canTransition(from, to))
    throw new CreditError(409, 'INVALID_TRANSITION', `Переход ${from} → ${to} недопустим.`, { from, to, allowed: transitions[from] });
}

/** Shortest allowed path between two states (breadth-first), used to move an application through intermediate states. */
export function transitionPath(from: ApplicationState, to: ApplicationState): ApplicationState[] | null {
  if (from === to) return [];
  const previous = new Map<ApplicationState, ApplicationState>([[from, from]]);
  const queue: ApplicationState[] = [from];
  while (queue.length) {
    const state = queue.shift()!;
    for (const next of transitions[state]) {
      if (previous.has(next)) continue;
      previous.set(next, state);
      if (next === to) {
        const path = [to];
        for (let step = state; step !== from; step = previous.get(step)!) path.unshift(step);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}
