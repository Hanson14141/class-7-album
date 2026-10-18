// Store only the login name, never passwords or session credentials.
function rememberAccountName(){
  if(app.account?.signedIn&&app.account.username)safeWrite('class7-last-username',app.account.username);
}
let identityRequest=0,ownershipGeneration=0;
