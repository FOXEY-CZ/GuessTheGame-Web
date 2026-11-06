/* Only the PUBLIC Supabase publishable key belongs in client-side code.
 * Never add service_role or other secret keys here. */
window.FOXEY_ARCADE_CONFIG=Object.freeze({
  supabaseUrl:'https://ivfhfdrjkktfueeqdgej.supabase.co',
  publishableKey:'sb_publishable_A569sxFOTtPwwFJQtSC7Sg_o47CQEwU',
  sessionKey:'foxey.arcade.auth.v1',
  // Flip this only after the Google provider and OAuth redirect are configured.
  googleOAuthEnabled:true
});
