'use strict';
// Only classify an interactive prerequisite when no password field is visible.
// This is an observation, not permission to bypass an invitation/MFA challenge.
function loginGate(state){
 if(state.challenge)return 'human_verification';
 if(!state.password&&/\b(?:(?:invitation|invite|access|one[- ]time|verification|authentication|security)\s+code|two[- ]factor|multi[- ]factor|passkey)\b/i.test((state.text||'')+'\n'+(state.loginPrompts||[]).join('\n')))return 'interactive_access_required';
 return null;
}
module.exports={loginGate};
