/* Quirky one-liners shown under the dashboard greeting. Twenty per time of day, one picked at random each
 * time the extension opens. They are fixed text: none of them make claims about the student's data. */
(() => {
  const S = window.SGO;
  if (S.quips) return;

  /* Bands by local hour. "late" is the really-late one. */
  const BANDS = [
    ['late', 0, 5], ['morning', 5, 12], ['afternoon', 12, 17], ['evening', 17, 22], ['night', 22, 24],
  ];
  S.quipBand = (now = new Date()) => { const h = now.getHours(); return BANDS.find(([, a, b]) => h >= a && h < b)[0]; };

  S.quips = {
    late: [
      "It's the middle of the night. Sleep counts as studying, probably.",
      'Even your assignments are asleep right now.',
      'Whatever is due can be done better after some sleep.',
      "The moon is on shift. You're allowed to clock out.",
      'Night owl mode: activated. Hydrate, then hibernate.',
      'Fun fact: brains file their notes while you sleep.',
      'This hour is for ghosts and deadline-chasers. Choose wisely.',
      'Nothing good ever came from a 3 AM formatting crisis.',
      'The to-do list will still be here at sunrise. Promise.',
      "You up? Your pillow is asking.",
      'Tomorrow-you would like a word about tonight-you.',
      'The vampires have gone home. Maybe you should too.',
      'Late-night genius is mostly just tired typing.',
      'Lights low, power-nap high. Just a suggestion.',
      "If you're studying, respect. If you're scrolling, sleep.",
      'The sun will be back soon. So will your energy.',
      'Spoiler: the answer looks clearer after breakfast.',
      'Coffee at this hour is a loan from tomorrow.',
      'Even superheroes take rest days. This could be yours.',
      "It's late enough that “one more tab” is a trap.",
    ],
    morning: [
      'Fresh day, fresh tabs, fewer regrets.',
      'Breakfast first. Deadlines second.',
      'Good vibes loaded. Assignments standing by.',
      'The early bird gets the good seat in class.',
      "Today's plan: do one thing, then another thing.",
      'Coffee optional, courage encouraged.',
      'A little progress before lunch goes a long way.',
      'Rise and sparkle. (Shining is optional.)',
      'Your future self is already proud of this start.',
      "New day, new chance to beat yesterday's to-do list.",
      "Tip: tackle the scariest task while you're fresh.",
      'Mornings are for momentum. Pick a small win.',
      'Sunrise energy detected. Use it wisely.',
      'The day is a blank page. Draft something good.',
      'Stretch, sip some water, then conquer.',
      'Pencil sharpened, brain warming up.',
      "Alarm survived. That's win number one.",
      'Plot twist: today you actually finish the thing.',
      'Small steps count. So do snacks.',
      "Let's make today's homework regret-free.",
    ],
    afternoon: [
      'Post-lunch slump? Stand up and stretch it out.',
      'Halfway through the day. Keep the momentum.',
      'A quick walk makes the hard problems softer.',
      'Afternoon focus: ten minutes on one task, no tabs.',
      "You've survived the morning. The afternoon is easy mode.",
      'Hydration check: yes, now.',
      'Good time to knock out one small assignment.',
      "The day's not over, but your progress is already showing.",
      'Snack break approved. Brain fuel is real.',
      'Check what is due soon, then ignore everything else.',
      'Afternoon plan: one task, one timer, one victory.',
      'Remember: done is better than perfect.',
      'Sunny side up, deadlines down.',
      "Between classes and clubs, you're doing great.",
      'Quick win idea: submit something small right now.',
      'The finish line of the school day is in sight.',
      'Take five, then take on the next thing.',
      'Even a few focused minutes beat an hour of worrying.',
      'Afternoon you has the best ideas. Write them down.',
      'Keep going. The hardest part is starting, and you did.',
    ],
    evening: [
      "Evening check-in: what's one thing to finish tonight?",
      'Dinner, then deadlines. In that order.',
      'Wind down the day with one tidy task.',
      'Golden hour for getting things off your list.',
      "Tonight's goal: future-you wakes up relaxed.",
      'A calm evening plan beats a frantic midnight scramble.',
      'Do the hardest thing first, then enjoy your night.',
      'Cozy lighting, calm brain, small to-do list.',
      "You've done enough today to deserve a break, then a plan.",
      'Plot the evening: one focus block, one snack, one done.',
      'The sun clocked out. You can set your own hours.',
      'Evening study tip: phone in another room.',
      "Today's chapter is almost closed. Finish strong.",
      "Check tomorrow's deadlines so tomorrow is quiet.",
      'A tidy desk is half a finished assignment.',
      'Treat tonight like a team-up: you and your playlist.',
      'Look at you, being responsible after sunset.',
      'Fifteen minutes now saves forty-five panicked ones later.',
      "Make tonight easy for tomorrow's you.",
      'Dim the lights, sharpen the focus.',
    ],
    night: [
      'Getting late. Finish what is quick, save the rest for tomorrow.',
      'Last call for tasks. Then wind down.',
      'Brains work better after sleep. Science says so.',
      'The finish line is closer than it feels.',
      'One more small thing, then lights out.',
      'Time to start the shutdown routine.',
      'Pack the bag now and thank yourself at breakfast.',
      'If it can wait until morning, let it.',
      "A good night's sleep is the best study tool.",
      'Wrap it up. Your pillow has been patient.',
      'Late-night you is brave. Tomorrow-you is rested.',
      'Charge the laptop. Charge yourself.',
      'End the day on a win, even a tiny one.',
      'Screen time is winding down. So should you.',
      "You've done enough. Rest counts as progress.",
      "Set tomorrow's top three, then call it a night.",
      'The to-do list is not going anywhere.',
      'Almost bedtime. Almost.',
      "Quiet hour. Great for tidying tomorrow's plan.",
      'Good work today. Seriously. Goodnight.',
    ],
  };

  /** One message for this time of day. It is chosen once per time the extension opens and stays put while the student
   *  clicks around; the last one shown is remembered so it is not repeated back to back. */
  let current = null, last = null;
  S.quipReady = S.store.get('sgo_quip_last').then((v) => { last = v || null; });
  S.quip = (now = new Date()) => {
    const band = S.quipBand(now);
    if (current && current.band === band) return current.text;
    const pool = S.quips[band];
    let i = Math.floor(Math.random() * pool.length);
    if (last && last.band === band && last.i === i) i = (i + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length;
    current = { band, i, text: pool[i] };
    S.store.set('sgo_quip_last', { band, i });
    return current.text;
  };
})();
