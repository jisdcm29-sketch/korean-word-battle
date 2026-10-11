/* KGA60: pure, network-free request builder for a FUTURE server-verified API.
   Never infer StudentID from name, UID or phone. No production API calls here. */
import { phase41BuildPreview } from './phase41-finish-preview.js';
const clean = x => String(x ?? '').trim();
export function phase60BuildVerifiedRequest(room, context) {
  const preview = phase41BuildPreview(room,context);
  if (preview.status !== 'PREVIEW_ONLY') return {ok:false,code:preview.reason||'NOT_READY'};
  if (context?.mode !== 'CLASS' || clean(context.classId)!==preview.classId)
    return {ok:false,code:'CLASS_NOT_SELECTED'};
  if (!preview.players.every(p=>p.uid&&p.enteredName&&Number.isSafeInteger(p.rawScore)&&p.rawScore>=0))
    return {ok:false,code:'BAD_PLAYER_DATA'};
  return {ok:true,request:{action:'saveVerifiedDailyResults',classId:preview.classId,
    gameSessionId:preview.gameSessionId,gameId:preview.gameId,
    players:preview.players.map(p=>({uid:p.uid,enteredName:p.enteredName,rawScore:p.rawScore,dailyRank:p.dailyRank}))}};
}
