// Only the question window announced by the host may accept new input.
export function isConfirmedInputOpen(state, now) {
  if (state?.status !== 'playing') return false;
  const start = Number(state.unitStartAt || state.questionStartAt || state.roundStartAt);
  const end = Number(state.unitEndAt || state.questionEndAt || state.roundEndAt);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}
