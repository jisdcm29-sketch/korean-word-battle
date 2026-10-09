const SPREADSHEET_ID = '1SQUpiBldRDtEaVFmX1FHPTulDGTAJwPrUifESpuSx_k';
const LICENSE_SHEET = '권한관리';
const SESSION_SHEET = '세션기록';
const SETTINGS_SHEET = '설정';
const CLASS_SHEET = 'Classes';
const STUDENT_SHEET = 'Students';
const NAME_CANDIDATE_SHEET = 'NameCandidates';
const GAME_RESULT_SHEET = 'GameResults';
const WEEKLY_AWARD_SHEET = 'WeeklyAwards';
const DEFAULT_TZ = 'Asia/Ulaanbaatar';
const ALLOWED_PARENT_ORIGINS = ['https://jisdcm29-sketch.github.io'];
const ACCESS_SERVICE_VERSION = '1.14.0';
const ACCESS_LEVELS = ['FULL','TESTER','PLAY_ONLY'];
const ACCESS_AUTOMATION_DEFAULTS = {
  AUTO_LICENSE_DIGITS: 6,
  DEFAULT_ALLOWED_GAMES: 'ALL',
  DEFAULT_NEW_ACCESS_LEVEL: 'TESTER',
  FULL_LICENSE_DAYS: 3650,
  TESTER_LICENSE_DAYS: 365,
  PLAY_ONLY_LICENSE_DAYS: 365,
  FULL_MAX_DEVICES: 5,
  TESTER_MAX_DEVICES: 3,
  PLAY_ONLY_MAX_DEVICES: 2,
  FULL_MAX_SESSIONS: 9999,
  TESTER_MAX_SESSIONS: 1000,
  PLAY_ONLY_MAX_SESSIONS: 300
};

/**
 * GET is intentionally only a health/status page.
 * Authentication requests use a hidden cross-origin HTML form POST.
 * This avoids browser CORS restrictions and the fragile embedded google.script.run bridge.
 */
function doGet() {
  const html = `<!doctype html><html lang="ko"><head><base target="_top"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KWB Access Service</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07152f;color:#fff;font-family:system-ui,sans-serif}.card{max-width:580px;margin:24px;padding:28px 32px;border:1px solid #2f76ba;border-radius:22px;background:linear-gradient(145deg,#14366f,#081a3a);box-shadow:0 24px 70px #0006;text-align:center}.ok{font-size:46px}.card h1{margin:8px 0 10px;font-size:28px}.card p{margin:6px 0;color:#c8ddff}.card code{color:#6ee7ff}</style></head><body><div class="card"><div class="ok">✅</div><h1>한국어 게임 아레나 인증 서버 정상</h1><p>Google Apps Script 웹앱이 정상 실행 중입니다.</p><p>버전 <code>${ACCESS_SERVICE_VERSION}</code></p></div></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const requestId = text_(e && e.parameter && e.parameter.requestId);
  const parentOrigin = text_(e && e.parameter && e.parameter.parentOrigin);
  let result;
  try {
    if (!originAllowed_(parentOrigin)) {
      result = {ok:false,code:'ORIGIN_DENIED',message:'허용되지 않은 접속 주소입니다.'};
    } else {
      result = bridgeRequest((e && e.parameter && e.parameter.payload) || '{}');
    }
  } catch(err) {
    console.error(err);
    result = {ok:false,code:'SERVER_ERROR',message:'인증 처리 중 오류가 발생했습니다.'};
  }
  return postMessagePage_(requestId, parentOrigin, result);
}

function originAllowed_(origin) {
  if (!origin) return false;
  if (ALLOWED_PARENT_ORIGINS.indexOf(origin) >= 0) return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

function postMessagePage_(requestId, parentOrigin, result) {
  // Escape '<' so a teacher name/note can never terminate the script element.
  const payload = JSON.stringify({type:'KWB_ACCESS_RESPONSE',id:requestId,result:result}).replace(/</g,'\\u003c');
  const target = JSON.stringify(parentOrigin || '*').replace(/</g,'\\u003c');
  const html = `<!doctype html><html><head><base target="_top"><meta charset="utf-8"></head><body><script>(function(){var msg=${payload},dest=${target};try{window.top.postMessage(msg,dest);}catch(e){}try{window.parent.postMessage(msg,dest);}catch(e){}try{if(window.opener)window.opener.postMessage(msg,dest);}catch(e){}})();<\/script></body></html>`;
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function bridgeRequest(payloadJson) {
  try {
    const body=JSON.parse(payloadJson||'{}');
    const action=String(body.action||'').trim();
    if(action==='login') return login_(body);
    if(action==='validate') return validate_(body);
    if(action==='logout') return logout_(body);
    if(action==='listClasses') return listClasses_(body);
    if(action==='saveClass') return saveClass_(body);
    if(action==='deleteClass') return deleteClass_(body);
    if(action==='listStudents') return listStudents_(body);
    if(action==='saveStudent') return saveStudent_(body);
    if(action==='deleteStudent') return deleteStudent_(body);
    if(action==='resolveStudentName') return resolveStudentName_(body);
    if(action==='resolveNameCandidate') return resolveNameCandidate_(body);
    if(action==='saveDailyResults') return saveDailyResults_(body);
    if(action==='getWeeklyRanking') return getWeeklyRanking_(body);
    if(action==='getWeeklyAwardState') return getWeeklyAwardState_(body);
    if(action==='finalizeWeeklyAwards') return finalizeWeeklyAwards_(body);
    if(action==='drawWeeklyLucky') return drawWeeklyLucky_(body);
    if(action==='drawWeeklyConsolation') return drawWeeklyConsolation_(body);
    if(action==='createWeeklyTestData') return createWeeklyTestData_(body);
    if(action==='clearWeeklyTestData') return clearWeeklyTestData_(body);
    return {ok:false,code:'BAD_ACTION',message:'지원하지 않는 요청입니다.'};
  } catch(err) {
    console.error(err);
    return {ok:false,code:'SERVER_ERROR',message:'인증 처리 중 오류가 발생했습니다.'};
  }
}


/**
 * 권한관리 자동화 1회 설치 함수.
 * 독립형 Apps Script에서도 동작하도록 스프레드시트 onEdit 설치형 트리거를 만듭니다.
 * 실행 후 권한관리 시트의 새 행에서 교사명(B)과 전화번호/인증번호(C)만 입력하면
 * 기본 권한 TESTER를 포함해 순번/허가번호/상태/기간/허용게임/기기수/세션수가 자동으로 채워집니다.
 * 특정 교사만 FULL 또는 PLAY_ONLY로 등록하려면 H열 권한등급을 먼저 선택한 뒤 B/C를 입력하면 됩니다.
 */
function setupAccessAutomation() {
  const ctx=context_();
  ensureAutomationSettings_(ctx.settingsSheet);
  const selectorResult=installAccessLevelSelector_(ctx);
  const triggers=ScriptApp.getProjectTriggers();
  triggers.filter(t=>t.getHandlerFunction()==='handleAccessSheetEdit').forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('handleAccessSheetEdit').forSpreadsheet(ctx.ss).onEdit().create();
  return '권한관리 자동화 설치 완료 · '+selectorResult+' · 새 TESTER는 교사명 + 전화번호만 입력하세요.';
}

function ensureAutomationSettings_(sheet) {
  const existing=readSettings_(sheet), descriptions={
    AUTO_LICENSE_DIGITS:'자동 허가번호 숫자 자리수(6 권장)',
    DEFAULT_ALLOWED_GAMES:'신규 교사의 기본 허용 게임',
    DEFAULT_NEW_ACCESS_LEVEL:'신규 교사 자동등록 기본 권한 (FULL / TESTER / PLAY_ONLY)',
    FULL_LICENSE_DAYS:'FULL 신규 사용권 기본 일수',
    TESTER_LICENSE_DAYS:'TESTER 신규 사용권 기본 일수',
    PLAY_ONLY_LICENSE_DAYS:'PLAY_ONLY 신규 사용권 기본 일수',
    FULL_MAX_DEVICES:'FULL 기본 허용 교사 기기 수',
    TESTER_MAX_DEVICES:'TESTER 기본 허용 교사 기기 수',
    PLAY_ONLY_MAX_DEVICES:'PLAY_ONLY 기본 허용 교사 기기 수',
    FULL_MAX_SESSIONS:'FULL 기본 로그인 세션 발급 한도',
    TESTER_MAX_SESSIONS:'TESTER 기본 로그인 세션 발급 한도',
    PLAY_ONLY_MAX_SESSIONS:'PLAY_ONLY 기본 로그인 세션 발급 한도'
  };
  Object.keys(ACCESS_AUTOMATION_DEFAULTS).forEach(key=>{
    if(existing[key]!==undefined&&existing[key]!=='')return;
    sheet.appendRow([key,ACCESS_AUTOMATION_DEFAULTS[key],descriptions[key]||'자동 권한관리 기본값']);
  });
}

function installAccessLevelSelector_(ctx) {
  // 권한관리 시트의 권한등급(H열)은 Google Sheets 네이티브 표(Table)의
  // DROPDOWN 열로 관리합니다. 일반 Range.setDataValidation()은 유형이 지정된
  // 표 열과 충돌하므로 Apps Script에서는 건드리지 않습니다.
  // 현재 권한관리 표에는 FULL / TESTER / PLAY_ONLY가 설정되어 있으며
  // 표에 새 행을 추가하면 같은 선택 목록이 자동으로 이어집니다.
  return '권한등급 FULL / TESTER / PLAY_ONLY 표 선택목록 사용';
}

/** 설치형 onEdit 트리거용. */
function handleAccessSheetEdit(e) {
  if(!e||!e.range)return;
  const sheet=e.range.getSheet();
  if(sheet.getName()!==LICENSE_SHEET||e.range.getRow()<2)return;
  const firstCol=e.range.getColumn(),lastCol=e.range.getLastColumn();
  if(lastCol<2||firstCol>8)return;
  const relevant=[2,3,8].some(c=>c>=firstCol&&c<=lastCol);
  if(!relevant)return;
  const lock=LockService.getScriptLock();lock.waitLock(8000);
  try{
    const ctx=context_(),start=Math.max(2,e.range.getRow()),end=e.range.getLastRow();
    for(let row=start;row<=end;row++)autofillLicenseRow_(ctx,row,firstCol<=8&&lastCol>=8);
  }finally{lock.releaseLock();}
}

function autofillLicenseRow_(ctx,rowNumber,permissionEdited) {
  const sheet=ctx.licenseSheet,values=sheet.getRange(rowNumber,1,1,15).getValues()[0];
  const teacher=text_(values[1]),rawAuth=text_(values[2]),auth=auth_(rawAuth);
  if(!teacher||!auth||auth.length<8)return;
  const settings=readSettings_(ctx.settingsSheet);
  const isNewRow=!text_(values[0])&&!text_(values[3])&&!text_(values[4])&&!values[5]&&!values[6];
  if(rawAuth!==auth)sheet.getRange(rowNumber,3).setValue(auth);
  if(isNewRow&&authUsedByOtherRow_(ctx,auth,rowNumber)){
    sheet.getRange(rowNumber,15).setValue('중복 전화번호(인증번호)입니다. 기존 교사를 확인하세요.');
    return;
  }
  let level=normalizeAccessLevel_(values[7]);
  if(!level){
    if(!isNewRow)return;
    level=normalizeAccessLevel_(settings.DEFAULT_NEW_ACCESS_LEVEL)||ACCESS_AUTOMATION_DEFAULTS.DEFAULT_NEW_ACCESS_LEVEL;
    sheet.getRange(rowNumber,8).setValue(level);
    permissionEdited=true;
  }
  const profile=accessProfile_(level,settings),tz=text_(settings.TIMEZONE)||DEFAULT_TZ;
  let id=text_(values[0]),permit=permit_(values[3]),permitChanged=false;
  if(!id){id=String(nextLicenseId_(ctx));sheet.getRange(rowNumber,1).setValue(id);}
  if(!permit||permitUsedByOtherRow_(ctx,permit,rowNumber)){
    const oldPermit=permit;permit=generatePermitCode_(ctx,rowNumber,settings);sheet.getRange(rowNumber,4).setValue(permit);permitChanged=Boolean(oldPermit&&oldPermit!==permit);
    if(permitChanged)logoutTeacherSessions_(ctx,teacher,oldPermit);
  }
  if(!text_(values[4]))sheet.getRange(rowNumber,5).setValue('ACTIVE');
  const now=new Date();
  if(!values[5])sheet.getRange(rowNumber,6).setValue(Utilities.formatDate(now,tz,'yyyy-MM-dd HH:mm'));
  if(!values[6]){
    const end=new Date(now.getTime()+profile.days*24*60*60*1000);
    sheet.getRange(rowNumber,7).setValue(Utilities.formatDate(end,tz,'yyyy-MM-dd HH:mm'));
  }
  if(!text_(values[8]))sheet.getRange(rowNumber,9).setValue(profile.allowedGames);
  if(permissionEdited||values[9]===''||values[9]===null)sheet.getRange(rowNumber,10).setValue(profile.maxDevices);
  if(permissionEdited||values[10]===''||values[10]===null)sheet.getRange(rowNumber,11).setValue(profile.maxSessions);
  if(values[11]===''||values[11]===null)sheet.getRange(rowNumber,12).setValue(0);
  sheet.getRange(rowNumber,8).setValue(level);
}

function normalizeAccessLevel_(value) {
  const level=text_(value).toUpperCase();
  return ACCESS_LEVELS.indexOf(level)>=0?level:'';
}

function accessProfile_(level,settings) {
  const l=normalizeAccessLevel_(level)||'PLAY_ONLY';
  const days=positiveInt_(settings[l+'_LICENSE_DAYS'],ACCESS_AUTOMATION_DEFAULTS[l+'_LICENSE_DAYS']);
  const maxDevices=positiveInt_(settings[l+'_MAX_DEVICES'],ACCESS_AUTOMATION_DEFAULTS[l+'_MAX_DEVICES']);
  const maxSessions=positiveInt_(settings[l+'_MAX_SESSIONS'],ACCESS_AUTOMATION_DEFAULTS[l+'_MAX_SESSIONS']);
  return{level:l,days:Math.max(1,days),maxDevices:Math.max(1,maxDevices),maxSessions:Math.max(1,maxSessions),allowedGames:text_(settings.DEFAULT_ALLOWED_GAMES)||ACCESS_AUTOMATION_DEFAULTS.DEFAULT_ALLOWED_GAMES};
}

function nextLicenseId_(ctx) {
  let max=0;table_(ctx.licenseSheet).rows.forEach(x=>{const n=Number(licenseId_(x));if(Number.isFinite(n))max=Math.max(max,n);});return max+1;
}

function permitUsedByOtherRow_(ctx,permit,rowNumber) {
  const wanted=permit_(permit);if(!wanted)return false;
  return table_(ctx.licenseSheet).rows.some(x=>x.rowNumber!==rowNumber&&permit_(x.row['허가번호'])===wanted);
}

function authUsedByOtherRow_(ctx,authCode,rowNumber) {
  const wanted=auth_(authCode);if(!wanted)return false;
  return table_(ctx.licenseSheet).rows.some(x=>x.rowNumber!==rowNumber&&auth_(x.row['인증번호'])===wanted);
}

function generatePermitCode_(ctx,rowNumber,settings) {
  const digits=Math.min(8,Math.max(6,positiveInt_(settings.AUTO_LICENSE_DIGITS,ACCESS_AUTOMATION_DEFAULTS.AUTO_LICENSE_DIGITS)));
  const min=Math.pow(10,digits-1),span=9*min;
  for(let i=0;i<2000;i++){
    const raw=String(Math.floor(min+Math.random()*span));
    const code=digits===6?raw.slice(0,3)+'-'+raw.slice(3):raw;
    if(!permitUsedByOtherRow_(ctx,code,rowNumber))return code;
  }
  throw new Error('고유 허가번호를 자동 생성하지 못했습니다.');
}

function logoutTeacherSessions_(ctx,teacher,permitCode) {
  const pp=permit_(permitCode),name=text_(teacher);if(!pp||!name)return;
  table_(ctx.sessionSheet).rows.forEach(x=>{
    if(permit_(x.row['허가번호'])===pp&&text_(x.row['교사명'])===name&&text_(x.row['상태']).toUpperCase()==='ACTIVE')ctx.sessionSheet.getRange(x.rowNumber,8).setValue('LOGGED_OUT');
  });
}

function login_(body) {
  const authCode=auth_(body.authCode), permitCode=text_(body.permitCode), deviceId=text_(body.deviceId);
  if(authCode.length<4||permitCode.length<4||deviceId.length<8) return denied_();
  const lock=LockService.getScriptLock(); lock.waitLock(8000);
  try {
    const ctx=context_(), matches=findLicenses_(ctx,authCode,permitCode);
    if(!matches.length) return denied_();
    if(matches.length>1) return {ok:false,code:'DUPLICATE_CREDENTIAL',message:'같은 인증번호와 허가번호가 중복 등록되어 있습니다. 관리자에게 알려 주세요.'};
    const license=matches[0], lid=licenseId_(license);
    if(!lid) return {ok:false,code:'LICENSE_ID_MISSING',message:'권한관리 시트의 순번(고유 ID)이 비어 있습니다. 관리자에게 알려 주세요.'};
    if(findLicensesById_(ctx,lid).length!==1) return {ok:false,code:'DUPLICATE_LICENSE_ID',message:'권한관리 시트의 순번(고유 ID)이 중복되어 있습니다. 관리자에게 알려 주세요.'};
    const validity=licenseValidity_(ctx,license); if(!validity.ok) return validity;
    const devices=parseList_(license.row['등록기기ID']);
    const maxDevices=positiveInt_(license.row['허용기기수'],ctx.settings.DEFAULT_MAX_DEVICES||1);
    if(!devices.includes(deviceId)){
      if(devices.length>=maxDevices) return {ok:false,code:'DEVICE_LIMIT',message:'이 사용권에 등록할 수 있는 기기 수를 초과했습니다.'};
      devices.push(deviceId);
    }
    // 같은 허가번호를 여러 교사가 사용하더라도 반드시 현재 교사(권한 ID)의 세션만 재사용합니다.
    const existing=findActiveSession_(ctx,license,deviceId,validity.endAt);
    if(existing){touchSession_(ctx,existing.rowNumber);stampSessionLicenseId_(ctx,existing.rowNumber,licenseId_(license));updateLicenseUsage_(ctx,license,null,devices);return accessPayload_(ctx,license,existing.token,validity.endAt,true);}
    const maxSessions=positiveInt_(license.row['최대세션수'],ctx.settings.DEFAULT_MAX_SESSIONS||1), used=positiveInt_(license.row['사용세션수'],0);
    if(used>=maxSessions) return {ok:false,code:'SESSION_LIMIT',message:'이 허가번호의 사용 횟수가 모두 소진되었습니다.'};
    const token=Utilities.getUuid()+'-'+Utilities.getUuid();
    appendSession_(ctx,token,license,deviceId,validity.endAt,text_(body.userAgent));
    updateLicenseUsage_(ctx,license,used+1,devices);
    return accessPayload_(ctx,license,token,validity.endAt,false);
  } finally { lock.releaseLock(); }
}

function validate_(body) {
  const token=text_(body.sessionToken), deviceId=text_(body.deviceId);
  if(!token||!deviceId) return denied_();
  const ctx=context_(), session=findSessionByToken_(ctx,token);
  if(!session||text_(session.row['상태']).toUpperCase()!=='ACTIVE'||text_(session.row['기기ID'])!==deviceId) return denied_();
  // 세션에 저장된 권한 ID로 정확한 교사를 찾습니다. 구형 세션은 허가번호+교사명으로 1회 안전하게 이관합니다.
  const license=resolveSessionLicense_(ctx,session); if(!license) return {ok:false,code:'SESSION_ACCOUNT_MISMATCH',message:'세션의 교사 계정을 확인할 수 없습니다. 다시 로그인해 주세요.'};
  const validity=licenseValidity_(ctx,license); if(!validity.ok) return validity;
  touchSession_(ctx,session.rowNumber);
  return accessPayload_(ctx,license,token,validity.endAt,true);
}

function logout_(body) {
  const token=text_(body.sessionToken), deviceId=text_(body.deviceId); if(!token) return {ok:true};
  const ctx=context_(), session=findSessionByToken_(ctx,token);
  if(session&&(!deviceId||text_(session.row['기기ID'])===deviceId)) ctx.sessionSheet.getRange(session.rowNumber,8).setValue('LOGGED_OUT');
  return {ok:true};
}



function teacherRequestContext_(body) {
  const token=text_(body.sessionToken), deviceId=text_(body.deviceId);
  if(!token||!deviceId) return {ok:false,result:denied_()};
  const ctx=context_(), session=findSessionByToken_(ctx,token);
  if(!session||text_(session.row['상태']).toUpperCase()!=='ACTIVE'||text_(session.row['기기ID'])!==deviceId) return {ok:false,result:denied_()};
  const license=resolveSessionLicense_(ctx,session);
  if(!license) return {ok:false,result:{ok:false,code:'SESSION_ACCOUNT_MISMATCH',message:'세션의 교사 계정을 확인할 수 없습니다. 다시 로그인해 주세요.'}};
  const validity=licenseValidity_(ctx,license);
  if(!validity.ok) return {ok:false,result:validity};
  touchSession_(ctx,session.rowNumber);
  return {ok:true,ctx,license,teacherId:licenseId_(license),teacherName:text_(license.row['교사명'])||'교사'};
}

function ensureClassSheet_(ctx) {
  let sheet=ctx.ss.getSheetByName(CLASS_SHEET);
  if(!sheet){
    sheet=ctx.ss.insertSheet(CLASS_SHEET);
    sheet.getRange(1,1,1,6).setValues([['TeacherID','ClassID','ClassName','Active','CreatedAt','UpdatedAt']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function classRowsForTeacher_(sheet,teacherId) {
  return table_(sheet).rows.filter(x=>text_(x.row['TeacherID'])===teacherId);
}

function classPayloadList_(sheet,teacherId) {
  return classRowsForTeacher_(sheet,teacherId)
    .filter(x=>text_(x.row['Active']).toUpperCase()!=='FALSE'&&text_(x.row['Active']).toUpperCase()!=='INACTIVE')
    .map(x=>({classId:text_(x.row['ClassID']),className:text_(x.row['ClassName'])}))
    .filter(x=>x.classId&&x.className)
    .sort((a,b)=>a.className.localeCompare(b.className,'ko'));
}

function listClasses_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const sheet=ensureClassSheet_(auth.ctx);
  return {ok:true,teacherId:auth.teacherId,teacherName:auth.teacherName,classes:classPayloadList_(sheet,auth.teacherId)};
}

function saveClass_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const className=text_(body.className).replace(/\s+/g,' ').trim();
  if(!className||className.length>40)return {ok:false,code:'BAD_CLASS_NAME',message:'반 이름은 1~40자로 입력해 주세요.'};
  const sheet=ensureClassSheet_(auth.ctx), tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ, now=fmt_(new Date(),tz), requestedId=text_(body.classId);
  const rows=classRowsForTeacher_(sheet,auth.teacherId);
  const sameName=rows.find(x=>text_(x.row['ClassName']).toLocaleLowerCase()===className.toLocaleLowerCase()&&text_(x.row['Active']).toUpperCase()!=='FALSE'&&text_(x.row['Active']).toUpperCase()!=='INACTIVE');
  if(sameName&&(!requestedId||text_(sameName.row['ClassID'])!==requestedId))return {ok:false,code:'DUPLICATE_CLASS',message:'같은 이름의 반이 이미 등록되어 있습니다.',classes:classPayloadList_(sheet,auth.teacherId)};
  let classId=requestedId;
  if(classId){
    const hit=rows.find(x=>text_(x.row['ClassID'])===classId);
    if(!hit)return {ok:false,code:'CLASS_NOT_FOUND',message:'수정할 반을 찾을 수 없습니다.'};
    sheet.getRange(hit.rowNumber,3).setValue(className);
    sheet.getRange(hit.rowNumber,4).setValue('TRUE');
    sheet.getRange(hit.rowNumber,6).setValue(now);
  }else{
    classId='C-'+Utilities.getUuid().split('-')[0].toUpperCase();
    sheet.appendRow([auth.teacherId,classId,className,'TRUE',now,now]);
  }
  return {ok:true,classItem:{classId,className},classes:classPayloadList_(sheet,auth.teacherId)};
}


function deleteClass_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId);
  if(!classId)return {ok:false,code:'BAD_CLASS_ID',message:'삭제할 반을 확인해 주세요.'};
  const sheet=ensureClassSheet_(auth.ctx),rows=classRowsForTeacher_(sheet,auth.teacherId),hit=rows.find(x=>text_(x.row['ClassID'])===classId);
  if(!hit)return {ok:false,code:'CLASS_NOT_FOUND',message:'삭제할 반을 찾을 수 없습니다.'};
  const active=text_(hit.row['Active']).toUpperCase();
  if(active==='FALSE'||active==='INACTIVE')return {ok:true,classId:classId,classes:classPayloadList_(sheet,auth.teacherId)};
  const tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,now=fmt_(new Date(),tz);
  // 안전한 소프트 삭제: 학생/점수/시상 기록은 보존하고 반만 선택 목록에서 숨깁니다.
  sheet.getRange(hit.rowNumber,4).setValue('FALSE');
  sheet.getRange(hit.rowNumber,6).setValue(now);
  return {ok:true,classId:classId,className:text_(hit.row['ClassName']),classes:classPayloadList_(sheet,auth.teacherId)};
}


function ensureStudentSheet_(ctx) {
  let sheet=ctx.ss.getSheetByName(STUDENT_SHEET);
  if(!sheet){
    sheet=ctx.ss.insertSheet(STUDENT_SHEET);
    sheet.getRange(1,1,1,10).setValues([['TeacherID','ClassID','StudentID','DisplayName','Aliases','PossibleNames','Active','CreatedAt','UpdatedAt','Note']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function ensureNameCandidateSheet_(ctx) {
  let sheet=ctx.ss.getSheetByName(NAME_CANDIDATE_SHEET);
  if(!sheet){
    sheet=ctx.ss.insertSheet(NAME_CANDIDATE_SHEET);
    sheet.getRange(1,1,1,11).setValues([['TeacherID','ClassID','CandidateID','EnteredName','SuggestedStudentID','SuggestedDisplayName','Status','FirstSeenAt','LastSeenAt','SeenCount','ResolvedAt']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function teacherOwnsClass_(ctx,teacherId,classId) {
  const sheet=ensureClassSheet_(ctx), wanted=text_(classId);
  if(!wanted)return null;
  return classRowsForTeacher_(sheet,teacherId).find(x=>text_(x.row['ClassID'])===wanted&&text_(x.row['Active']).toUpperCase()!=='FALSE'&&text_(x.row['Active']).toUpperCase()!=='INACTIVE')||null;
}

function nameKey_(value) {
  let s=text_(value).replace(/\s+/g,' ').trim();
  try{s=s.normalize('NFKC');}catch(err){}
  try{return s.toLocaleLowerCase('en');}catch(err){return s.toLowerCase();}
}

function parseNameList_(value) {
  let values=[];
  if(Array.isArray(value))values=value;
  else values=String(value==null?'':value).split(/[\n,;|]+/);
  const out=[],seen={};
  values.forEach(v=>{const clean=text_(v).replace(/\s+/g,' ').trim(),key=nameKey_(clean);if(!clean||seen[key])return;seen[key]=true;out.push(clean);});
  return out;
}
function joinNameList_(value){return parseNameList_(value).join(' | ');}

function studentRowsForClass_(sheet,teacherId,classId) {
  return table_(sheet).rows.filter(x=>text_(x.row['TeacherID'])===teacherId&&text_(x.row['ClassID'])===classId);
}
function activeStudentRowsForClass_(sheet,teacherId,classId) {
  return studentRowsForClass_(sheet,teacherId,classId).filter(x=>text_(x.row['Active']).toUpperCase()!=='FALSE'&&text_(x.row['Active']).toUpperCase()!=='INACTIVE');
}
function studentPayload_(x) {
  return {studentId:text_(x.row['StudentID']),displayName:text_(x.row['DisplayName']),aliases:parseNameList_(x.row['Aliases']),possibleNames:parseNameList_(x.row['PossibleNames'])};
}
function studentPayloadList_(sheet,teacherId,classId) {
  return activeStudentRowsForClass_(sheet,teacherId,classId).map(studentPayload_).filter(x=>x.studentId&&x.displayName).sort((a,b)=>a.displayName.localeCompare(b.displayName,'ko'));
}

function pendingCandidateRows_(sheet,teacherId,classId) {
  return table_(sheet).rows.filter(x=>text_(x.row['TeacherID'])===teacherId&&text_(x.row['ClassID'])===classId&&text_(x.row['Status']).toUpperCase()==='PENDING');
}
function candidatePayloadList_(sheet,teacherId,classId) {
  return pendingCandidateRows_(sheet,teacherId,classId).map(x=>({candidateId:text_(x.row['CandidateID']),enteredName:text_(x.row['EnteredName']),suggestedStudentId:text_(x.row['SuggestedStudentID']),suggestedDisplayName:text_(x.row['SuggestedDisplayName']),seenCount:Math.max(1,positiveInt_(x.row['SeenCount'],1)),firstSeenAt:text_(x.row['FirstSeenAt']),lastSeenAt:text_(x.row['LastSeenAt'])})).filter(x=>x.candidateId&&x.enteredName).sort((a,b)=>String(b.lastSeenAt).localeCompare(String(a.lastSeenAt)));
}

function listStudents_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId);if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const studentSheet=ensureStudentSheet_(auth.ctx),candidateSheet=ensureNameCandidateSheet_(auth.ctx);
  return {ok:true,teacherId:auth.teacherId,classId,students:studentPayloadList_(studentSheet,auth.teacherId,classId),candidates:candidatePayloadList_(candidateSheet,auth.teacherId,classId)};
}

function studentConfirmedNameConflict_(rows,studentId,names) {
  const wanted={};names.forEach(n=>{const k=nameKey_(n);if(k)wanted[k]=true;});
  for(const x of rows){
    const sid=text_(x.row['StudentID']);if(studentId&&sid===studentId)continue;
    const confirmed=[text_(x.row['DisplayName'])].concat(parseNameList_(x.row['Aliases']));
    for(const n of confirmed){if(wanted[nameKey_(n)])return {studentId:sid,displayName:text_(x.row['DisplayName']),name:n};}
  }
  return null;
}

function saveStudent_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId);if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const displayName=text_(body.displayName).replace(/\s+/g,' ').trim();
  if(!displayName||displayName.length>60)return {ok:false,code:'BAD_STUDENT_NAME',message:'대표 이름은 1~60자로 입력해 주세요.'};
  let aliases=parseNameList_(body.aliases),possibleNames=parseNameList_(body.possibleNames),studentId=text_(body.studentId);
  const displayKey=nameKey_(displayName);aliases=aliases.filter(x=>nameKey_(x)!==displayKey);possibleNames=possibleNames.filter(x=>nameKey_(x)!==displayKey&&!aliases.some(a=>nameKey_(a)===nameKey_(x)));
  const sheet=ensureStudentSheet_(auth.ctx),rows=activeStudentRowsForClass_(sheet,auth.teacherId,classId);
  const conflict=studentConfirmedNameConflict_(rows,studentId,[displayName].concat(aliases));
  if(conflict)return {ok:false,code:'NAME_CONFLICT',message:`'${conflict.name}' 이름은 이미 '${conflict.displayName}' 학생의 대표 이름 또는 확정 별칭으로 사용 중입니다.`};
  const tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,now=fmt_(new Date(),tz);
  let hit=null;
  if(studentId)hit=rows.find(x=>text_(x.row['StudentID'])===studentId)||null;
  if(studentId&&!hit)return {ok:false,code:'STUDENT_NOT_FOUND',message:'수정할 학생을 찾을 수 없습니다.'};
  if(hit){
    sheet.getRange(hit.rowNumber,4,1,6).setValues([[displayName,joinNameList_(aliases),joinNameList_(possibleNames),'TRUE',text_(hit.row['CreatedAt'])||now,now]]);
  }else{
    studentId='S-'+Utilities.getUuid().split('-')[0].toUpperCase();
    sheet.appendRow([auth.teacherId,classId,studentId,displayName,joinNameList_(aliases),joinNameList_(possibleNames),'TRUE',now,now,'']);
  }
  const candidateSheet=ensureNameCandidateSheet_(auth.ctx);
  const aliasKeys={};aliases.forEach(x=>aliasKeys[nameKey_(x)]=true);
  pendingCandidateRows_(candidateSheet,auth.teacherId,classId).forEach(x=>{if(aliasKeys[nameKey_(x.row['EnteredName'])]){candidateSheet.getRange(x.rowNumber,5,1,7).setValues([[studentId,displayName,'CONFIRMED',text_(x.row['FirstSeenAt'])||now,now,Math.max(1,positiveInt_(x.row['SeenCount'],1)),now]]);linkPendingGameResults_(auth.ctx,auth.teacherId,classId,text_(x.row['EnteredName']),studentId,displayName);}});
  return {ok:true,student:{studentId,displayName,aliases,possibleNames},students:studentPayloadList_(sheet,auth.teacherId,classId),candidates:candidatePayloadList_(candidateSheet,auth.teacherId,classId)};
}

function deleteStudent_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId),studentId=text_(body.studentId);
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  if(!studentId)return {ok:false,code:'BAD_STUDENT_ID',message:'삭제할 학생을 확인할 수 없습니다.'};
  const sheet=ensureStudentSheet_(auth.ctx),rows=activeStudentRowsForClass_(sheet,auth.teacherId,classId),hit=rows.find(x=>text_(x.row['StudentID'])===studentId)||null;
  if(!hit)return {ok:false,code:'STUDENT_NOT_FOUND',message:'삭제할 학생을 찾을 수 없습니다.'};
  const tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,now=fmt_(new Date(),tz),displayName=text_(hit.row['DisplayName']),oldNote=text_(hit.row['Note']);
  sheet.getRange(hit.rowNumber,7).setValue('FALSE');
  sheet.getRange(hit.rowNumber,9).setValue(now);
  sheet.getRange(hit.rowNumber,10).setValue((oldNote?oldNote+'; ':'')+'학생 관리 화면에서 삭제(비활성) '+now);
  const candidateSheet=ensureNameCandidateSheet_(auth.ctx);
  pendingCandidateRows_(candidateSheet,auth.teacherId,classId).forEach(x=>{
    if(text_(x.row['SuggestedStudentID'])===studentId)candidateSheet.getRange(x.rowNumber,5,1,2).setValues([['','']]);
  });
  return {ok:true,message:`'${displayName}' 학생 정보를 삭제했습니다.`,students:studentPayloadList_(sheet,auth.teacherId,classId),candidates:candidatePayloadList_(candidateSheet,auth.teacherId,classId)};
}

function findStudentNameMatches_(rows,enteredName) {
  const key=nameKey_(enteredName),confirmed=[],possible=[];
  rows.forEach(x=>{
    const p=studentPayload_(x);
    if(nameKey_(p.displayName)===key||p.aliases.some(n=>nameKey_(n)===key))confirmed.push(p);
    else if(p.possibleNames.some(n=>nameKey_(n)===key))possible.push(p);
  });
  return {confirmed,possible};
}

function upsertNameCandidate_(ctx,teacherId,classId,enteredName,suggested) {
  const sheet=ensureNameCandidateSheet_(ctx),tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ,now=fmt_(new Date(),tz),key=nameKey_(enteredName);
  const existing=pendingCandidateRows_(sheet,teacherId,classId).find(x=>nameKey_(x.row['EnteredName'])===key);
  const sid=suggested&&suggested.studentId?text_(suggested.studentId):'',sname=suggested&&suggested.displayName?text_(suggested.displayName):'';
  if(existing){
    const count=Math.max(1,positiveInt_(existing.row['SeenCount'],1))+1;
    sheet.getRange(existing.rowNumber,5,1,6).setValues([[sid,sname,'PENDING',text_(existing.row['FirstSeenAt'])||now,now,count]]);
    return {candidateId:text_(existing.row['CandidateID']),enteredName:text_(existing.row['EnteredName']),suggestedStudentId:sid,suggestedDisplayName:sname,seenCount:count};
  }
  const id='N-'+Utilities.getUuid().split('-')[0].toUpperCase();
  sheet.appendRow([teacherId,classId,id,enteredName,sid,sname,'PENDING',now,now,1,'']);
  return {candidateId:id,enteredName,suggestedStudentId:sid,suggestedDisplayName:sname,seenCount:1};
}

function resolveStudentName_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId),enteredName=text_(body.enteredName).replace(/\s+/g,' ').trim();
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  if(!enteredName||enteredName.length>60)return {ok:false,code:'BAD_ENTERED_NAME',message:'학생 이름을 확인해 주세요.'};
  const sheet=ensureStudentSheet_(auth.ctx),rows=activeStudentRowsForClass_(sheet,auth.teacherId,classId),matches=findStudentNameMatches_(rows,enteredName);
  if(matches.confirmed.length===1)return {ok:true,status:'RESOLVED',student:matches.confirmed[0]};
  if(matches.confirmed.length>1){const candidate=upsertNameCandidate_(auth.ctx,auth.teacherId,classId,enteredName,null);return {ok:true,status:'AMBIGUOUS',candidate,message:'같은 확정 이름이 여러 학생에게 있어 교사 확인이 필요합니다.'};}
  const suggested=matches.possible.length===1?matches.possible[0]:null,candidate=upsertNameCandidate_(auth.ctx,auth.teacherId,classId,enteredName,suggested);
  return {ok:true,status:suggested?'POSSIBLE':'UNKNOWN',candidate,suggestedStudent:suggested};
}

function candidateById_(sheet,teacherId,classId,candidateId) {
  return table_(sheet).rows.find(x=>text_(x.row['TeacherID'])===teacherId&&text_(x.row['ClassID'])===classId&&text_(x.row['CandidateID'])===candidateId)||null;
}

function resolveNameCandidate_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId),candidateId=text_(body.candidateId),decision=text_(body.decision).toUpperCase(),studentId=text_(body.studentId);
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const candidateSheet=ensureNameCandidateSheet_(auth.ctx),hit=candidateById_(candidateSheet,auth.teacherId,classId,candidateId);
  if(!hit)return {ok:false,code:'CANDIDATE_NOT_FOUND',message:'이름 후보를 찾을 수 없습니다.'};
  if(text_(hit.row['Status']).toUpperCase()!=='PENDING')return {ok:false,code:'CANDIDATE_DONE',message:'이미 처리된 이름 후보입니다.'};
  const enteredName=text_(hit.row['EnteredName']),studentSheet=ensureStudentSheet_(auth.ctx),rows=activeStudentRowsForClass_(studentSheet,auth.teacherId,classId),tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,now=fmt_(new Date(),tz);
  let linkedId='',linkedName='',message='';
  if(decision==='LINK'){
    const studentRow=rows.find(x=>text_(x.row['StudentID'])===studentId);if(!studentRow)return {ok:false,code:'STUDENT_NOT_FOUND',message:'연결할 학생을 선택해 주세요.'};
    const conflict=studentConfirmedNameConflict_(rows,studentId,[enteredName]);if(conflict)return {ok:false,code:'NAME_CONFLICT',message:`'${enteredName}' 이름은 이미 '${conflict.displayName}' 학생에게 연결되어 있습니다.`};
    const aliases=parseNameList_(studentRow.row['Aliases']);if(!aliases.some(x=>nameKey_(x)===nameKey_(enteredName)))aliases.push(enteredName);
    const possible=parseNameList_(studentRow.row['PossibleNames']).filter(x=>nameKey_(x)!==nameKey_(enteredName));
    studentSheet.getRange(studentRow.rowNumber,5,1,5).setValues([[joinNameList_(aliases),joinNameList_(possible),'TRUE',text_(studentRow.row['CreatedAt'])||now,now]]);
    linkedId=studentId;linkedName=text_(studentRow.row['DisplayName']);message=`'${enteredName}'을(를) '${linkedName}' 학생의 확정 별칭으로 연결했습니다.`;
  }else if(decision==='NEW'){
    const conflict=studentConfirmedNameConflict_(rows,'',[enteredName]);if(conflict)return {ok:false,code:'NAME_CONFLICT',message:`'${enteredName}' 이름은 이미 '${conflict.displayName}' 학생에게 연결되어 있습니다.`};
    linkedId='S-'+Utilities.getUuid().split('-')[0].toUpperCase();linkedName=enteredName;
    studentSheet.appendRow([auth.teacherId,classId,linkedId,linkedName,'','','TRUE',now,now,'이름 후보에서 새 학생으로 등록']);message=`'${enteredName}'을(를) 새 학생으로 등록했습니다.`;
  }else if(decision==='REJECT'){
    message=`'${enteredName}' 이름 후보를 제외했습니다.`;
  }else return {ok:false,code:'BAD_DECISION',message:'이름 후보 처리 방법을 확인해 주세요.'};
  const status=decision==='REJECT'?'REJECTED':'CONFIRMED';
  candidateSheet.getRange(hit.rowNumber,5,1,7).setValues([[linkedId,linkedName,status,text_(hit.row['FirstSeenAt'])||now,now,Math.max(1,positiveInt_(hit.row['SeenCount'],1)),now]]);
  if(linkedId)linkPendingGameResults_(auth.ctx,auth.teacherId,classId,enteredName,linkedId,linkedName);
  if(decision==='REJECT')rejectPendingGameResults_(auth.ctx,auth.teacherId,classId,enteredName);
  return {ok:true,message,students:studentPayloadList_(studentSheet,auth.teacherId,classId),candidates:candidatePayloadList_(candidateSheet,auth.teacherId,classId)};
}



function ensureGameResultSheet_(ctx) {
  let sheet=ctx.ss.getSheetByName(GAME_RESULT_SHEET);
  if(!sheet){
    sheet=ctx.ss.insertSheet(GAME_RESULT_SHEET);
    sheet.getRange(1,1,1,15).setValues([['Date','WeekID','TeacherID','ClassID','StudentID','StudentName','EnteredName','IdentityStatus','GameID','RawScore','DailyRank','WeeklyPoint','DailyLucky','GameSessionID','SavedAt']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function isoWeekId_(date,tz) {
  const ymd=Utilities.formatDate(date,tz,'yyyy-MM-dd').split('-').map(Number);
  const d=new Date(Date.UTC(ymd[0],ymd[1]-1,ymd[2]));
  const day=d.getUTCDay()||7;
  d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear(),start=new Date(Date.UTC(year,0,1));
  const week=Math.ceil((((d-start)/86400000)+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}

function weeklyPointForRank_(rank) {
  const r=Math.max(1,Math.floor(Number(rank)||1));
  if(r===1)return 100;if(r===2)return 90;if(r===3)return 80;if(r===4)return 75;if(r===5)return 70;
  return Math.max(20,70-(r-5)*5);
}

function gameResultRows_(sheet,teacherId,classId) {
  return table_(sheet).rows.filter(x=>text_(x.row['TeacherID'])===teacherId&&text_(x.row['ClassID'])===classId);
}

function linkPendingGameResults_(ctx,teacherId,classId,enteredName,studentId,displayName) {
  if(!enteredName||!studentId)return 0;
  const sheet=ensureGameResultSheet_(ctx),key=nameKey_(enteredName),rows=gameResultRows_(sheet,teacherId,classId),now=fmt_(new Date(),text_(ctx.settings.TIMEZONE)||DEFAULT_TZ);
  let changed=0;
  rows.forEach(x=>{
    if(text_(x.row['IdentityStatus']).toUpperCase()!=='PENDING'||text_(x.row['StudentID']))return;
    if(nameKey_(x.row['EnteredName'])!==key)return;
    sheet.getRange(x.rowNumber,5,1,2).setValues([[studentId,displayName]]);
    sheet.getRange(x.rowNumber,8).setValue('RESOLVED');
    sheet.getRange(x.rowNumber,15).setValue(now);
    changed++;
  });
  return changed;
}

function rejectPendingGameResults_(ctx,teacherId,classId,enteredName) {
  if(!enteredName)return 0;
  const sheet=ensureGameResultSheet_(ctx),key=nameKey_(enteredName);
  let changed=0;
  gameResultRows_(sheet,teacherId,classId).forEach(x=>{
    if(text_(x.row['IdentityStatus']).toUpperCase()!=='PENDING'||text_(x.row['StudentID']))return;
    if(nameKey_(x.row['EnteredName'])!==key)return;
    sheet.getRange(x.rowNumber,8).setValue('REJECTED');
    changed++;
  });
  return changed;
}

function saveDailyResults_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId),gameSessionId=text_(body.gameSessionId),gameId=text_(body.gameId),overwrite=body.overwrite===true||String(body.overwrite).toLowerCase()==='true';
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  if(!gameSessionId||gameSessionId.length>100)return {ok:false,code:'BAD_GAME_SESSION',message:'게임 세션 정보를 확인할 수 없습니다.'};
  if(!gameId||gameId.length>50)return {ok:false,code:'BAD_GAME_ID',message:'게임 종류를 확인할 수 없습니다.'};
  const players=Array.isArray(body.players)?body.players:[];
  if(!players.length||players.length>100)return {ok:false,code:'BAD_PLAYERS',message:'저장할 학생 결과를 확인해 주세요.'};
  const resultSheet=ensureGameResultSheet_(auth.ctx),existing=gameResultRows_(resultSheet,auth.teacherId,classId).filter(x=>text_(x.row['GameSessionID'])===gameSessionId);
  if(existing.length&&!overwrite)return {ok:false,code:'DUPLICATE_SESSION',message:'이 게임 결과는 이미 저장되어 있습니다.'};
  if(existing.length&&overwrite){existing.map(x=>x.rowNumber).sort((a,b)=>b-a).forEach(row=>resultSheet.deleteRow(row));}
  const studentSheet=ensureStudentSheet_(auth.ctx),studentRows=activeStudentRowsForClass_(studentSheet,auth.teacherId,classId),tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,nowDate=new Date(),dateText=Utilities.formatDate(nowDate,tz,'yyyy-MM-dd'),weekId=isoWeekId_(nowDate,tz),savedAt=fmt_(nowDate,tz),luckyKey=nameKey_(body.dailyLuckyName);
  const rows=[],pendingNames=[];
  players.forEach((p,index)=>{
    const enteredName=text_(p&&p.enteredName).replace(/\s+/g,' ').trim();if(!enteredName)return;
    const rawScore=Math.max(0,Math.round(Number(p&&p.rawScore)||0)),rank=Math.max(1,Math.floor(Number(p&&p.dailyRank)||index+1)),matches=findStudentNameMatches_(studentRows,enteredName);
    let student=null,status='PENDING';
    if(matches.confirmed.length===1){student=matches.confirmed[0];status='RESOLVED';}
    else{
      const suggested=matches.possible.length===1?matches.possible[0]:null;
      upsertNameCandidate_(auth.ctx,auth.teacherId,classId,enteredName,suggested);
      pendingNames.push(enteredName);
    }
    rows.push([dateText,weekId,auth.teacherId,classId,student?student.studentId:'',student?student.displayName:'',enteredName,status,gameId,rawScore,rank,weeklyPointForRank_(rank),luckyKey&&nameKey_(enteredName)===luckyKey?'TRUE':'FALSE',gameSessionId,savedAt]);
  });
  if(!rows.length)return {ok:false,code:'NO_VALID_RESULTS',message:'저장할 학생 결과가 없습니다.'};
  resultSheet.getRange(resultSheet.getLastRow()+1,1,rows.length,15).setValues(rows);
  return {ok:true,savedCount:rows.length,pendingCount:pendingNames.length,pendingNames:pendingNames.slice(0,20),date:dateText,weekId:weekId,gameSessionId:gameSessionId};
}


function validDateText_(value) {
  const s=text_(value),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return '';
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),check=new Date(Date.UTC(y,mo-1,d));
  if(check.getUTCFullYear()!==y||check.getUTCMonth()!==mo-1||check.getUTCDate()!==d)return '';
  return s;
}

function isoWeekIdFromDateText_(dateText) {
  const s=validDateText_(dateText);if(!s)return '';
  const parts=s.split('-').map(Number),d=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);
  const year=d.getUTCFullYear(),start=new Date(Date.UTC(year,0,1));
  const week=Math.ceil((((d-start)/86400000)+1)/7);
  return year+'-W'+String(week).padStart(2,'0');
}

function weeklyResultDateText_(value,tz) {
  if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value))return Utilities.formatDate(value,tz,'yyyy-MM-dd');
  const direct=validDateText_(value);if(direct)return direct;
  const raw=text_(value),m=raw.match(/^(\d{4}-\d{2}-\d{2})(?:[ T]|$)/);
  if(m&&validDateText_(m[1]))return m[1];
  const parsed=parseDate_(value,tz);
  return parsed?Utilities.formatDate(parsed,tz,'yyyy-MM-dd'):'';
}

function getWeeklyRanking_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const classId=text_(body.classId);
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ,now=new Date(),requested=text_(body.weekId),endDate=validDateText_(body.endDate);
  const derivedWeek=endDate?isoWeekIdFromDateText_(endDate):'',weekId=requested||derivedWeek||isoWeekId_(now,tz);
  if(!/^\d{4}-W\d{2}$/.test(weekId))return {ok:false,code:'BAD_WEEK_ID',message:'주차 정보를 확인할 수 없습니다.'};
  if(endDate&&derivedWeek&&derivedWeek!==weekId)return {ok:false,code:'BAD_PERIOD',message:'선택한 마감일과 주차가 일치하지 않습니다.'};
  const sheet=ensureGameResultSheet_(auth.ctx);
  const source=gameResultRows_(sheet,auth.teacherId,classId).filter(x=>text_(x.row['WeekID'])===weekId&&(!endDate||weeklyResultDateText_(x.row['Date'],tz)<=endDate));
  const pendingCount=source.filter(x=>{const status=text_(x.row['IdentityStatus']).toUpperCase();return status!=='REJECTED'&&(status!=='RESOLVED'||!text_(x.row['StudentID']));}).length;
  const resolvedResultCount=source.filter(x=>text_(x.row['IdentityStatus']).toUpperCase()==='RESOLVED'&&!!text_(x.row['StudentID'])).length;
  const map={};
  source.forEach(x=>{
    const row=x.row,status=text_(row['IdentityStatus']).toUpperCase(),studentId=text_(row['StudentID']);
    if(status!=='RESOLVED'||!studentId)return;
    if(!map[studentId])map[studentId]={studentId:studentId,studentName:text_(row['StudentName'])||text_(row['EnteredName'])||studentId,weeklyPointTotal:0,gamesPlayed:0,firstCount:0,secondCount:0,thirdCount:0,dailyLuckyCount:0};
    const item=map[studentId],rank=Math.max(1,Math.floor(Number(row['DailyRank'])||999));
    if(text_(row['StudentName']))item.studentName=text_(row['StudentName']);
    item.weeklyPointTotal+=Math.max(0,Math.round(Number(row['WeeklyPoint'])||0));
    item.gamesPlayed++;
    if(rank===1)item.firstCount++;else if(rank===2)item.secondCount++;else if(rank===3)item.thirdCount++;
    if(String(row['DailyLucky']).toUpperCase()==='TRUE')item.dailyLuckyCount++;
  });
  const ranking=Object.keys(map).map(k=>map[k]).sort((a,b)=>b.weeklyPointTotal-a.weeklyPointTotal||b.firstCount-a.firstCount||b.secondCount-a.secondCount||b.thirdCount-a.thirdCount||String(a.studentName).localeCompare(String(b.studentName),'ko'));
  ranking.forEach((x,i)=>x.rank=i+1);
  return {ok:true,weekId:weekId,endDate:endDate,ranking:ranking,pendingCount:pendingCount,resolvedResultCount:resolvedResultCount,totalResultCount:source.length};
}

function ensureWeeklyAwardSheet_(ctx) {
  let sheet=ctx.ss.getSheetByName(WEEKLY_AWARD_SHEET);
  if(!sheet){
    sheet=ctx.ss.insertSheet(WEEKLY_AWARD_SHEET);
    sheet.getRange(1,1,1,9).setValues([['WeekID','TeacherID','ClassID','AwardType','StudentID','StudentName','WeeklyTotal','SavedAt','EndDate']]);
    sheet.setFrozenRows(1);
  } else if(text_(sheet.getRange(1,9).getValue())!=='EndDate') {
    sheet.getRange(1,9).setValue('EndDate');
  }
  return sheet;
}

function weeklyAwardRows_(sheet,teacherId,classId,weekId,endDate) {
  const wantedEnd=validDateText_(endDate);
  return table_(sheet).rows.filter(x=>{
    if(text_(x.row['TeacherID'])!==text_(teacherId)||text_(x.row['ClassID'])!==text_(classId)||text_(x.row['WeekID'])!==text_(weekId))return false;
    // EndDate 열을 도입하기 전에 저장된 기존 주간 시상 기록은 EndDate가 비어 있습니다.
    // 그 기록은 SavedAt 날짜를 기준일로 간주해 같은 주차의 기존 1·2·3위/행운상 기록을
    // 정상적으로 이어서 사용할 수 있게 합니다. 새 기록은 항상 EndDate를 우선 사용합니다.
    const rowEnd=weeklyResultDateText_(x.row['EndDate'],DEFAULT_TZ)||weeklyResultDateText_(x.row['SavedAt'],DEFAULT_TZ);
    return !wantedEnd||rowEnd===wantedEnd;
  });
}

function awardMap_(rows) {
  const out={};
  rows.forEach(x=>{const type=text_(x.row['AwardType']).toUpperCase();if(type&&!out[type])out[type]={awardType:type,studentId:text_(x.row['StudentID']),studentName:text_(x.row['StudentName']),weeklyTotal:Math.max(0,Math.round(Number(x.row['WeeklyTotal'])||0)),savedAt:text_(x.row['SavedAt']),endDate:weeklyResultDateText_(x.row['EndDate'],DEFAULT_TZ)};});
  return out;
}

// 지난 약 한 달(28일) 동안 이 반에서 주간 시상을 받은 학생을 찾습니다.
// 후보가 충분할 때만 이 학생들을 우선 제외하고, 후보가 부족하면 자동으로 전체 후보로 되돌아갑니다.
function recentWeeklyAwardWinnerIds_(sheet,teacherId,classId,endDate,lookbackDays) {
  const end=validDateText_(endDate);if(!end)return {};
  const endMs=Date.parse(end+'T12:00:00Z');if(!isFinite(endMs))return {};
  const days=Math.max(1,Math.floor(Number(lookbackDays)||28)),startMs=endMs-days*24*60*60*1000,out={};
  table_(sheet).rows.forEach(x=>{
    if(text_(x.row['TeacherID'])!==text_(teacherId)||text_(x.row['ClassID'])!==text_(classId))return;
    const rowEnd=weeklyResultDateText_(x.row['EndDate'],DEFAULT_TZ)||weeklyResultDateText_(x.row['SavedAt'],DEFAULT_TZ);
    const ms=rowEnd?Date.parse(rowEnd+'T12:00:00Z'):NaN;
    if(!isFinite(ms)||ms>=endMs||ms<startMs)return;
    const id=text_(x.row['StudentID']);if(id)out[id]=true;
  });
  return out;
}

function preferFreshAwardCandidates_(candidates,recentIds,currentWinnerId) {
  const base=Array.isArray(candidates)?candidates.filter(Boolean):[];
  if(!base.length)return [];
  const current=text_(currentWinnerId);
  let pool=current&&base.length>1?base.filter(x=>text_(x.studentId)!==current):base.slice();
  const fresh=pool.filter(x=>!recentIds[text_(x.studentId)]);
  return fresh.length?fresh:pool;
}

// 같은 주차/기준일의 행운상·아차상은 다시 추첨할 수 있습니다.
// 기존 같은 종류 기록을 지우고 새 결과 한 건만 남깁니다.
function replaceWeeklyAward_(sheet,teacherId,classId,weekId,endDate,type,winner,now) {
  const targetType=text_(type).toUpperCase(),wantedEnd=validDateText_(endDate),rows=table_(sheet).rows;
  for(let i=rows.length-1;i>=0;i--){
    const x=rows[i],row=x.row;
    if(text_(row['TeacherID'])!==text_(teacherId)||text_(row['ClassID'])!==text_(classId)||text_(row['WeekID'])!==text_(weekId)||text_(row['AwardType']).toUpperCase()!==targetType)continue;
    const rowEnd=weeklyResultDateText_(row['EndDate'],DEFAULT_TZ)||weeklyResultDateText_(row['SavedAt'],DEFAULT_TZ);
    if(!wantedEnd||rowEnd===wantedEnd)sheet.deleteRow(x.rowNumber);
  }
  sheet.appendRow([weekId,teacherId,classId,targetType,text_(winner.studentId),text_(winner.studentName),Math.max(0,Math.round(Number(winner.weeklyPointTotal)||0)),now,wantedEnd]);
}

function currentWeekIdFor_(ctx,requested) {
  const tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ,weekId=text_(requested)||isoWeekId_(new Date(),tz);
  return /^\d{4}-W\d{2}$/.test(weekId)?weekId:'';
}

function shuffledCopy_(items) {
  const out=(Array.isArray(items)?items:[]).slice();
  for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=out[i];out[i]=out[j];out[j]=t;}
  return out;
}

function weeklyAwardStateFor_(auth,body) {
  const classId=text_(body.classId),tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ;
  const endDate=validDateText_(body.endDate)||Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  const derivedWeek=isoWeekIdFromDateText_(endDate),requested=text_(body.weekId),weekId=requested||derivedWeek;
  if(!weekId||!/^\d{4}-W\d{2}$/.test(weekId)||derivedWeek!==weekId)return {ok:false,code:'BAD_PERIOD',message:'선택한 시상 기준일을 확인해 주세요.'};
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const rankingResult=getWeeklyRanking_({...body,classId:classId,weekId:weekId,endDate:endDate});
  if(!rankingResult||!rankingResult.ok)return rankingResult||{ok:false,code:'RANKING_ERROR',message:'주간 순위를 불러오지 못했습니다.'};
  const awardSheet=ensureWeeklyAwardSheet_(auth.ctx),rows=weeklyAwardRows_(awardSheet,auth.teacherId,classId,weekId,endDate),awards=awardMap_(rows),ranking=Array.isArray(rankingResult.ranking)?rankingResult.ranking:[];
  const resultRows=gameResultRows_(ensureGameResultSheet_(auth.ctx),auth.teacherId,classId).filter(x=>text_(x.row['WeekID'])===weekId&&weeklyResultDateText_(x.row['Date'],tz)<=endDate);
  const awardDayIds={};
  resultRows.forEach(x=>{const row=x.row,id=text_(row['StudentID']);if(weeklyResultDateText_(row['Date'],tz)===endDate&&text_(row['IdentityStatus']).toUpperCase()==='RESOLVED'&&id)awardDayIds[id]=true;});
  const rankingById={};ranking.forEach(x=>rankingById[text_(x.studentId)]=x);
  const mainMap={};
  resultRows.forEach(x=>{
    const row=x.row,id=text_(row['StudentID']),rank=Math.max(1,Math.floor(Number(row['DailyRank'])||999));
    if(text_(row['IdentityStatus']).toUpperCase()!=='RESOLVED'||!id||rank>3)return;
    const r=rankingById[id];
    if(r&&!mainMap[id])mainMap[id]={studentId:id,studentName:r.studentName,weeklyPointTotal:r.weeklyPointTotal,presentOnAwardDay:!!awardDayIds[id]};
  });
  const mainCandidates=Object.keys(mainMap).map(k=>mainMap[k]).sort((a,b)=>String(a.studentName).localeCompare(String(b.studentName),'ko'));
  const mainEligibleCandidates=ranking.filter(x=>mainMap[text_(x.studentId)]&&awardDayIds[text_(x.studentId)]).map(x=>({studentId:x.studentId,studentName:x.studentName,weeklyPointTotal:x.weeklyPointTotal,presentOnAwardDay:true}));
  const topTypes=['FIRST','SECOND','THIRD'],topIds=topTypes.map(t=>awards[t]&&awards[t].studentId).filter(Boolean),finalized=topIds.length===3;
  const recentAwardIds=recentWeeklyAwardWinnerIds_(awardSheet,auth.teacherId,classId,endDate,28);
  const luckyBase=ranking.filter(x=>awardDayIds[text_(x.studentId)]&&Number(x.dailyLuckyCount||0)>0&&topIds.indexOf(text_(x.studentId))<0).map(x=>({studentId:x.studentId,studentName:x.studentName,weeklyPointTotal:x.weeklyPointTotal}));
  const luckyId=awards.LUCKY&&awards.LUCKY.studentId;
  const luckyCandidates=preferFreshAwardCandidates_(luckyBase,recentAwardIds,luckyId);
  const consolationBase=ranking.filter(x=>awardDayIds[text_(x.studentId)]&&topIds.indexOf(text_(x.studentId))<0&&text_(x.studentId)!==text_(luckyId)).map(x=>({studentId:x.studentId,studentName:x.studentName,weeklyPointTotal:x.weeklyPointTotal}));
  const consolationId=awards.CONSOLATION&&awards.CONSOLATION.studentId;
  const consolationCandidates=preferFreshAwardCandidates_(consolationBase,recentAwardIds,consolationId);
  const presentRankedCount=ranking.filter(x=>awardDayIds[text_(x.studentId)]).length,absentRankedCount=Math.max(0,ranking.length-presentRankedCount);
  const testDataCount=resultRows.filter(x=>text_(x.row['GameID'])==='DEV_WEEKLY_TEST').length;
  return {ok:true,weekId:weekId,endDate:endDate,ranking:ranking,pendingCount:Number(rankingResult.pendingCount)||0,totalResultCount:Number(rankingResult.totalResultCount)||0,resolvedResultCount:Number(rankingResult.resolvedResultCount)||0,finalized:finalized,awards:awards,mainCandidates:mainCandidates,mainCandidateCount:mainCandidates.length,mainEligibleCandidates:mainEligibleCandidates,mainEligibleCandidateCount:mainEligibleCandidates.length,mainExcludedCandidateCount:Math.max(0,mainCandidates.length-mainEligibleCandidates.length),luckyCandidates:luckyCandidates,luckyCandidateCount:luckyCandidates.length,consolationCandidates:consolationCandidates,consolationCandidateCount:consolationCandidates.length,luckyRequiredBeforeConsolation:luckyCandidates.length>0&&!awards.LUCKY,presentRankedCount:presentRankedCount,absentRankedCount:absentRankedCount,testDataCount:testDataCount};
}

function getWeeklyAwardState_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  return weeklyAwardStateFor_(auth,body);
}

function finalizeWeeklyAwards_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const state=weeklyAwardStateFor_(auth,body);if(!state.ok)return state;
  if(state.finalized)return state;
  const savedTopCount=['FIRST','SECOND','THIRD'].filter(t=>state.awards&&state.awards[t]).length;
  if(savedTopCount>0)return {ok:false,code:'PARTIAL_TOP3_STATE',message:'이 기준일의 1·2·3위 저장 상태가 완전하지 않습니다. 기존 기록을 확인한 뒤 다시 진행해 주세요.',savedTopCount:savedTopCount};
  if(state.pendingCount>0)return {ok:false,code:'PENDING_IDENTITIES',message:'이름 확인이 필요한 학생을 먼저 처리해 주세요.',pendingCount:state.pendingCount};
  if(!state.ranking.length)return {ok:false,code:'NO_RESULTS',message:'선택한 기간의 저장 결과가 없습니다.'};
  if(Number(state.mainEligibleCandidateCount)<3)return {ok:false,code:'NOT_ENOUGH_MAIN_CANDIDATES',message:'주간 1·2·3위 발표에는 기간 내 일일 1·2·3위 경험자 중 시상 기준일 게임에 참여한 학생이 최소 3명 필요합니다.',candidateCount:Number(state.mainCandidateCount)||0,eligibleCandidateCount:Number(state.mainEligibleCandidateCount)||0};
  const winners=(Array.isArray(state.mainEligibleCandidates)?state.mainEligibleCandidates:[]).slice(0,3),sheet=ensureWeeklyAwardSheet_(auth.ctx),now=fmt_(new Date(),text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ),types=['FIRST','SECOND','THIRD'],rows=[];
  winners.forEach((x,i)=>rows.push([state.weekId,auth.teacherId,text_(body.classId),types[i],text_(x.studentId),text_(x.studentName),Math.max(0,Math.round(Number(x.weeklyPointTotal)||0)),now,state.endDate]));
  sheet.getRange(sheet.getLastRow()+1,1,rows.length,9).setValues(rows);
  return weeklyAwardStateFor_(auth,{...body,weekId:state.weekId,endDate:state.endDate});
}

function drawWeeklyLucky_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  let state=weeklyAwardStateFor_(auth,body);if(!state.ok)return state;
  if(!state.finalized)return {ok:false,code:'TOP3_NOT_FINALIZED',message:'먼저 주간 1·2·3위를 추첨해 주세요.'};
  const candidates=Array.isArray(state.luckyCandidates)?state.luckyCandidates:[];
  if(!candidates.length)return {ok:false,code:'NO_LUCKY_CANDIDATE',message:'시상 기준일에 참여한 주간 행운상 후보가 없습니다.'};
  const winner=candidates[Math.floor(Math.random()*candidates.length)],sheet=ensureWeeklyAwardSheet_(auth.ctx),now=fmt_(new Date(),text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ);
  replaceWeeklyAward_(sheet,auth.teacherId,text_(body.classId),state.weekId,state.endDate,'LUCKY',winner,now);
  return weeklyAwardStateFor_(auth,{...body,weekId:state.weekId,endDate:state.endDate});
}

function drawWeeklyConsolation_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  let state=weeklyAwardStateFor_(auth,body);if(!state.ok)return state;
  if(!state.finalized)return {ok:false,code:'TOP3_NOT_FINALIZED',message:'먼저 주간 1·2·3위를 추첨해 주세요.'};
  // Daily lucky award is separate from the weekly top-3/consolation ceremony.
  const candidates=Array.isArray(state.consolationCandidates)?state.consolationCandidates:[];
  if(!candidates.length)return {ok:false,code:'NO_CONSOLATION_CANDIDATE',message:'시상 기준일에 참여한 아차상 후보가 없습니다.'};
  const winner=candidates[Math.floor(Math.random()*candidates.length)],sheet=ensureWeeklyAwardSheet_(auth.ctx),now=fmt_(new Date(),text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ);
  replaceWeeklyAward_(sheet,auth.teacherId,text_(body.classId),state.weekId,state.endDate,'CONSOLATION',winner,now);
  return weeklyAwardStateFor_(auth,{...body,weekId:state.weekId,endDate:state.endDate});
}


function requireFullDeveloper_(auth) {
  const level=normalizeAccessLevel_(auth&&auth.license&&auth.license.row&&auth.license.row['권한등급'])||'PLAY_ONLY';
  return level==='FULL'?null:{ok:false,code:'FULL_REQUIRED',message:'개발 테스트 기능은 FULL 권한에서만 사용할 수 있습니다.'};
}

function createWeeklyTestData_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const denied=requireFullDeveloper_(auth);if(denied)return denied;
  const classId=text_(body.classId);
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const tz=text_(auth.ctx.settings.TIMEZONE)||DEFAULT_TZ;
  const endDate=validDateText_(body.endDate)||Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
  const derivedWeek=isoWeekIdFromDateText_(endDate),requested=text_(body.weekId),weekId=requested||derivedWeek;
  if(!weekId||!/^\d{4}-W\d{2}$/.test(weekId)||derivedWeek!==weekId)return {ok:false,code:'BAD_PERIOD',message:'선택한 시상 기준일을 확인해 주세요.'};
  const resultSheet=ensureGameResultSheet_(auth.ctx);
  const existing=gameResultRows_(resultSheet,auth.teacherId,classId).filter(x=>text_(x.row['WeekID'])===weekId);
  if(existing.length)return {ok:false,code:'WEEK_ALREADY_HAS_RESULTS',message:'선택한 주차에 이미 저장된 결과가 있어 테스트 데이터를 만들지 않았습니다.'};
  const studentSheet=ensureStudentSheet_(auth.ctx),students=activeStudentRowsForClass_(studentSheet,auth.teacherId,classId).map(studentPayload_).filter(x=>x.studentId&&x.displayName).slice(0,8);
  if(students.length<4)return {ok:false,code:'NOT_ENOUGH_STUDENTS',message:'주간 시상 테스트에는 활성 학생이 최소 4명 필요합니다.'};
  let end;
  try{end=Utilities.parseDate(endDate,tz,'yyyy-MM-dd');}catch(err){return {ok:false,code:'BAD_END_DATE',message:'시상 기준일 형식을 확인해 주세요.'};}
  const dateTexts=[];
  for(let offset=4;offset>=0;offset--){
    const d=new Date(end.getTime()-offset*24*60*60*1000),dt=Utilities.formatDate(d,tz,'yyyy-MM-dd');
    if(isoWeekIdFromDateText_(dt)===weekId)dateTexts.push(dt);
  }
  if(!dateTexts.length)dateTexts.push(endDate);
  const rows=[],savedAt=fmt_(new Date(),tz),absentStudentId=students[0].studentId;
  dateTexts.forEach((dateText,d)=>{
    const rotated=students.map((s,i)=>({s:s,sort:(i+d*2)%students.length})).sort((a,b)=>a.sort-b.sort).map(x=>x.s);
    const present=dateText===endDate?rotated.filter(s=>s.studentId!==absentStudentId):rotated;
    const luckyIndex=Math.min(present.length-1,3+(d%(Math.max(1,present.length-3))));
    present.forEach((student,i)=>{
      const rank=i+1,rawScore=Math.max(1000,10000-rank*650-d*90),sessionId='DEVTEST-'+weekId+'-'+dateText;
      rows.push([dateText,weekId,auth.teacherId,classId,student.studentId,student.displayName,student.displayName,'RESOLVED','DEV_WEEKLY_TEST',rawScore,rank,weeklyPointForRank_(rank),i===luckyIndex?'TRUE':'FALSE',sessionId,savedAt]);
    });
  });
  resultSheet.getRange(resultSheet.getLastRow()+1,1,rows.length,15).setValues(rows);
  return {ok:true,weekId:weekId,endDate:endDate,createdCount:rows.length,studentCount:students.length,excludedOnAwardDayStudentId:absentStudentId};
}

function clearWeeklyTestData_(body) {
  const auth=teacherRequestContext_(body);if(!auth.ok)return auth.result;
  const denied=requireFullDeveloper_(auth);if(denied)return denied;
  const classId=text_(body.classId),weekId=currentWeekIdFor_(auth.ctx,body.weekId);
  if(!weekId)return {ok:false,code:'BAD_WEEK_ID',message:'주차 정보를 확인할 수 없습니다.'};
  if(!teacherOwnsClass_(auth.ctx,auth.teacherId,classId))return {ok:false,code:'CLASS_NOT_FOUND',message:'선택한 반을 확인할 수 없습니다.'};
  const resultSheet=ensureGameResultSheet_(auth.ctx),weekRows=gameResultRows_(resultSheet,auth.teacherId,classId).filter(x=>text_(x.row['WeekID'])===weekId),testRows=weekRows.filter(x=>text_(x.row['GameID'])==='DEV_WEEKLY_TEST');
  if(!testRows.length)return {ok:true,weekId:weekId,deletedResults:0,deletedAwards:0};
  const nonTest=weekRows.filter(x=>text_(x.row['GameID'])!=='DEV_WEEKLY_TEST');
  if(nonTest.length)return {ok:false,code:'MIXED_WEEK_DATA',message:'이번 주에 실제 결과와 테스트 결과가 함께 있어 자동 삭제하지 않았습니다.'};
  testRows.map(x=>x.rowNumber).sort((a,b)=>b-a).forEach(r=>resultSheet.deleteRow(r));
  const awardSheet=ensureWeeklyAwardSheet_(auth.ctx),awardRows=weeklyAwardRows_(awardSheet,auth.teacherId,classId,weekId);
  awardRows.map(x=>x.rowNumber).sort((a,b)=>b-a).forEach(r=>awardSheet.deleteRow(r));
  return {ok:true,weekId:weekId,deletedResults:testRows.length,deletedAwards:awardRows.length};
}

function context_(){const ss=SpreadsheetApp.openById(SPREADSHEET_ID),licenseSheet=ss.getSheetByName(LICENSE_SHEET),sessionSheet=ss.getSheetByName(SESSION_SHEET),settingsSheet=ss.getSheetByName(SETTINGS_SHEET);if(!licenseSheet||!sessionSheet||!settingsSheet)throw new Error('필수 시트를 찾을 수 없습니다.');return{ss,licenseSheet,sessionSheet,settingsSheet,settings:readSettings_(settingsSheet)};}
function readSettings_(sheet){const values=sheet.getDataRange().getValues(),out={};for(let i=1;i<values.length;i++)if(values[i][0]!=='')out[String(values[i][0]).trim()]=values[i][1];return out;}
function table_(sheet){const values=sheet.getDataRange().getValues();if(!values.length)return{headers:[],rows:[]};const headers=values[0].map(v=>String(v).trim()),rows=[];for(let r=1;r<values.length;r++){if(values[r].every(v=>v===''))continue;const obj={};headers.forEach((h,c)=>obj[h]=values[r][c]);rows.push({rowNumber:r+1,row:obj});}return{headers,rows};}
function permit_(v){return text_(v).toUpperCase();}
function auth_(v){return text_(v).replace(/\D/g,'');}
function licenseId_(license){return text_(license&&license.row&&license.row['순번']);}
function findLicenses_(ctx,a,p){const aa=auth_(a),pp=permit_(p);return table_(ctx.licenseSheet).rows.filter(x=>auth_(x.row['인증번호'])===aa&&permit_(x.row['허가번호'])===pp);}
function findLicensesById_(ctx,id){const wanted=text_(id);if(!wanted)return[];return table_(ctx.licenseSheet).rows.filter(x=>licenseId_(x)===wanted);}
function findLicenseById_(ctx,id){const matches=findLicensesById_(ctx,id);return matches.length===1?matches[0]:null;}
function findLicensesByPermitAndTeacher_(ctx,p,name){const pp=permit_(p),nn=text_(name);return table_(ctx.licenseSheet).rows.filter(x=>permit_(x.row['허가번호'])===pp&&text_(x.row['교사명'])===nn);}
function findSessionByToken_(ctx,t){const hit=table_(ctx.sessionSheet).rows.find(x=>text_(x.row['세션토큰'])===t);return hit?{...hit,token:t}:null;}
function sessionLicenseId_(row){const memo=text_(row&&row['메모']);const m=memo.match(/(?:^|[;\s])LICENSE_ID=([^;\s]+)/i);return m?text_(m[1]):'';}
function memoWithLicenseId_(memo,id){const clean=text_(memo).replace(/(?:^|[;\s])LICENSE_ID=[^;\s]+/ig,' ').replace(/\s*;\s*/g,';').replace(/^[;\s]+|[;\s]+$/g,'').trim();return (clean?clean+'; ':'')+'LICENSE_ID='+text_(id);}
function stampSessionLicenseId_(ctx,rowNumber,id){if(!id)return;const cell=ctx.sessionSheet.getRange(rowNumber,10),current=text_(cell.getValue()),next=memoWithLicenseId_(current,id);if(current!==next)cell.setValue(next);}
function resolveSessionLicense_(ctx,session){
  const sid=sessionLicenseId_(session.row);
  if(sid){
    const license=findLicenseById_(ctx,sid);
    if(!license)return null;
    // 허가번호가 관리자에 의해 바뀌었다면 기존 세션은 재인증하게 합니다.
    if(permit_(license.row['허가번호'])!==permit_(session.row['허가번호']))return null;
    return license;
  }
  // 1.7.3 이하 구형 세션 호환: 허가번호만으로 찾지 않고 당시 교사명까지 함께 일치시킵니다.
  const matches=findLicensesByPermitAndTeacher_(ctx,session.row['허가번호'],session.row['교사명']);
  if(matches.length!==1)return null;
  const lid=licenseId_(matches[0]);if(!lid||findLicensesById_(ctx,lid).length!==1)return null;
  stampSessionLicenseId_(ctx,session.rowNumber,lid);
  return matches[0];
}
function findActiveSession_(ctx,license,d,endAt){
  const lid=licenseId_(license),pp=permit_(license.row['허가번호']),teacher=text_(license.row['교사명']);
  const candidates=table_(ctx.sessionSheet).rows.filter(x=>permit_(x.row['허가번호'])===pp&&text_(x.row['기기ID'])===d&&text_(x.row['상태']).toUpperCase()==='ACTIVE');
  for(const hit of candidates){
    const sid=sessionLicenseId_(hit.row);
    if(sid?sid!==lid:text_(hit.row['교사명'])!==teacher)continue;
    const exp=parseDate_(hit.row['만료일시'],ctx.settings.TIMEZONE||DEFAULT_TZ)||endAt;
    if(!exp||Date.now()>=exp.getTime())continue;
    if(!sid)stampSessionLicenseId_(ctx,hit.rowNumber,lid);
    return{...hit,token:text_(hit.row['세션토큰'])};
  }
  return null;
}
function licenseValidity_(ctx,license){const row=license.row,tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ;if(text_(row['상태']).toUpperCase()!=='ACTIVE')return{ok:false,code:'BLOCKED',message:'현재 사용할 수 없는 허가번호입니다.'};const start=parseDate_(row['시작일시'],tz),end=parseDate_(row['종료일시'],tz),now=new Date();if(!start||!end)return{ok:false,code:'DATE_ERROR',message:'사용 기간 설정을 확인해 주세요.'};if(now.getTime()<start.getTime())return{ok:false,code:'NOT_STARTED',message:'아직 사용 허가 기간이 시작되지 않았습니다.'};if(now.getTime()>=end.getTime())return{ok:false,code:'EXPIRED',message:'사용 허가 기간이 종료되었습니다.'};return{ok:true,startAt:start,endAt:end};}
function accessPayload_(ctx,license,token,endAt,resumed){return{ok:true,sessionToken:token,licenseId:licenseId_(license),teacherName:text_(license.row['교사명'])||'교사',permitCode:text_(license.row['허가번호']),accessLevel:normalizeAccessLevel_(license.row['권한등급'])||'PLAY_ONLY',allowedGames:text_(license.row['허용게임'])||'ALL',expiresAt:endAt.toISOString(),checkMinutes:Math.max(1,positiveInt_(ctx.settings.SESSION_CHECK_MINUTES,1)),resumed:!!resumed,serverTime:new Date().toISOString(),serviceVersion:ACCESS_SERVICE_VERSION};}
function appendSession_(ctx,token,license,deviceId,endAt,ua){const tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ,now=new Date();ctx.sessionSheet.appendRow([token,text_(license.row['허가번호']),text_(license.row['교사명']),deviceId,fmt_(now,tz),fmt_(endAt,tz),fmt_(now,tz),'ACTIVE',ua.slice(0,180),'LICENSE_ID='+licenseId_(license)]);}
function touchSession_(ctx,rowNumber){const tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ;ctx.sessionSheet.getRange(rowNumber,7).setValue(fmt_(new Date(),tz));}
function updateLicenseUsage_(ctx,license,usedValue,devices){const tz=text_(ctx.settings.TIMEZONE)||DEFAULT_TZ;if(usedValue!==null&&usedValue!==undefined)ctx.licenseSheet.getRange(license.rowNumber,12).setValue(usedValue);ctx.licenseSheet.getRange(license.rowNumber,13).setValue(fmt_(new Date(),tz));ctx.licenseSheet.getRange(license.rowNumber,14).setValue(devices.join(','));}
function parseDate_(value,tz){if(Object.prototype.toString.call(value)==='[object Date]'&&!isNaN(value))return value;const s=text_(value);if(!s)return null;try{return Utilities.parseDate(s,tz,'yyyy-MM-dd HH:mm');}catch(err){}const d=new Date(s);return isNaN(d)?null:d;}
function fmt_(date,tz){return Utilities.formatDate(date,tz,'yyyy-MM-dd HH:mm:ss');}
function parseList_(value){return text_(value).split(/[;,\s]+/).map(s=>s.trim()).filter(Boolean);}
function positiveInt_(v,fallback){const n=Math.floor(Number(v));return Number.isFinite(n)&&n>=0?n:Number(fallback)||0;}
function text_(v){return String(v==null?'':v).trim();}
function denied_(){return{ok:false,code:'DENIED',message:'인증번호 또는 허가번호, 사용 기간을 확인해 주세요.'};}
