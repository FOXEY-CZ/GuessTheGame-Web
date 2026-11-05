/* Guess the Game — conservative, idempotent progress merge.
 * NEVER add XP, currencies, rewards or counters across profiles. */
(() => {
  'use strict';
  const clone = data => JSON.parse(JSON.stringify(data));
  const object = v => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const valid = p => p && typeof p === 'object' && !Array.isArray(p)
    && ['xp','played','bestScore','totalCorrect','bestStreak'].every(k =>
      Number.isSafeInteger(p[k]) && p[k] >= 0 && p[k] < 100000000);
  const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  const maxDate = (a,b) => date(a) >= date(b) ? a || null : b || null;
  function merge(cloud, guest) {
    if(!valid(cloud) || !valid(guest))throw new Error('invalid_profile');
    // Account profile is canonical. Additional fields are never blindly imported.
    const result=clone(cloud);
    for(const k of ['xp','played','bestScore','totalCorrect','bestStreak',
      'shards','crowns','perfectRuns','freeChests','chestsOpened']){
      const left=Number.isSafeInteger(cloud[k])&&cloud[k]>=0?cloud[k]:0;
      const right=Number.isSafeInteger(guest[k])&&guest[k]>=0?guest[k]:0;
      result[k]=Math.max(left,right);
    }
    // Badges and cosmetic unlocks are entitlements, not repeatable rewards.
    const cloudBadges=object(cloud.badgeState), guestBadges=object(guest.badgeState);
    result.badgeState={...cloudBadges};
    for(const [k,v] of Object.entries(guestBadges))
      if(v===true && k.length<80 && !['__proto__','constructor','prototype'].includes(k))
        result.badgeState[k]=true;
    const c=object(cloud.cosmetics), g=object(guest.cosmetics);
    const union=(a,b)=>[...new Set([...(Array.isArray(a)?a:[]),...(Array.isArray(b)?b:[])].filter(x=>typeof x==='string'))];
    result.cosmetics={...c,
      themes:union(c.themes,g.themes),
      avatars:union(c.avatars,g.avatars),
      theme:c.theme||'classic',
      avatar:c.avatar||'alien'
    };
    // Daily awards cannot be claimed again simply by importing a profile.
    result.dailyClaimed=maxDate(cloud.dailyClaimed,guest.dailyClaimed);
    result.dailyPaidDay=maxDate(cloud.dailyPaidDay,guest.dailyPaidDay);
    const db=object(cloud.dailyBest),gb=object(guest.dailyBest);
    if(date(db.date)===date(gb.date) && db.date)
      result.dailyBest={date:db.date,score:Math.max(db.score||0,gb.score||0)};
    else
      result.dailyBest=clone(date(db.date)>=date(gb.date)?(db.date?db:null):(gb.date?gb:null));
    const ds=object(cloud.dailyStreak),gs=object(guest.dailyStreak);
    const latest=date(ds.lastDay)>=date(gs.lastDay)?ds:gs;
    result.dailyStreak={
      ...latest,
      count:Math.max(0,Number.isSafeInteger(latest.count)?latest.count:0),
      lastDay:date(latest.lastDay)||null,
      awardedMilestones:Math.max(ds.awardedMilestones||0,gs.awardedMilestones||0)
    };
    // Prevent replaying the same duel as a fresh reward opportunity.
    result.challengeResults={...object(guest.challengeResults),...object(cloud.challengeResults)};
    result.recentIds=union(cloud.recentIds,guest.recentIds).slice(-105);
    return result;
  }
  window.GTGAccountMerge=Object.freeze({merge,valid});
})();