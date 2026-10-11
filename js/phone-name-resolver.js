// Korean Game Arena - pure local matching helper; no network or writes.
// No phone lists are embedded or published. Teacher-side data only.
export function normalizePhone(value) {
  const text = String(value ?? '').trim().replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]+$/.test(text)) return '';
  return text.replace(/^\+976/, '').replace(/^976(?=[0-9]{8}$)/, '');
}
export function resolvePlayerEntry({mode, classId, entered, students}) {
  const text = String(entered ?? '').trim();
  if (mode !== 'CLASS') return text ? {ok:true, name:text, status:'DAILY_ONLY'} : {ok:false, code:'NAME_REQUIRED'};
  if (!classId) return {ok:false, code:'CLASS_REQUIRED'};
  const phone = normalizePhone(text);
  if (!/^[0-9]{8}$/.test(phone)) return {ok:false, code:'PHONE_REQUIRED'};
  const matches = (Array.isArray(students) ? students : []).filter(s =>
    String(s.classId ?? '') === String(classId) &&
    s.active !== false && String(s.active ?? 'TRUE').toUpperCase() !== 'FALSE' &&
    normalizePhone(s.phoneNumber ?? s.phone ?? '') === phone);
  if (matches.length !== 1) return {ok:false, code:matches.length ? 'PHONE_DUPLICATE' : 'PHONE_NOT_FOUND'};
  const s = matches[0];
  const name = String(s.displayName ?? '').trim();
  return name ? {ok:true, name, studentId:String(s.studentId ?? ''), status:'REGISTERED'} : {ok:false, code:'NAME_MISSING'};
}
