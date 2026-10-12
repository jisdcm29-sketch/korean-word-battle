// Korean Game Arena - pure local matching helper; no network or writes.
// No phone lists are embedded or published. Teacher-side data only.
export function normalizePhone(value) {
  const text = String(value ?? '').trim().replace(/[\s()-]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(text)) return '';
  return text.replace(/^\+976(?=[0-9]{8}$)/, '').replace(/^976(?=[0-9]{8}$)/, '').replace(/^\+/, '');
}
export function resolvePlayerEntry({mode, classId, entered, students}) {
  const text = String(entered ?? '').trim();
  if (mode !== 'CLASS') return text ? {ok:true, name:text, status:'DAILY_ONLY'} : {ok:false, code:'NAME_REQUIRED'};
  if (!classId) return text ? {ok:true,name:text,status:'DAILY_ONLY'} : {ok:false,code:'NAME_REQUIRED'};
  const phone = normalizePhone(text);
  if (!phone) return text ? {ok:true,name:text,status:'DAILY_ONLY'} : {ok:false,code:'NAME_REQUIRED'};
  const matches = (Array.isArray(students) ? students : []).filter(s =>
    (!s.classId || String(s.classId) === String(classId)) &&
    !['FALSE','INACTIVE'].includes(String(s.active ?? 'TRUE').toUpperCase()) &&
    normalizePhone(s.phoneNumber ?? s.phone ?? '') === phone);
  if (!matches.length) return {ok:true,name:text,status:'DAILY_ONLY'};
  if (matches.length !== 1) return {ok:false, code:'PHONE_DUPLICATE'};
  const s = matches[0];
  const name = String(s.displayName ?? '').trim();
  return name ? {ok:true, name, studentId:String(s.studentId ?? ''), status:'REGISTERED'} : {ok:false, code:'NAME_MISSING'};
}
