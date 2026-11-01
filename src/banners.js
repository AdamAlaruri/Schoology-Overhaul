/* Optional course banners: seven real photographs (public domain or CC0, from Wikimedia Commons) bundled in /banners.
 * Nothing is generated and nothing is fetched at run time. Credits are in banners/CREDITS.md. A class keeps its own original
 * Schoology picture unless the student chooses one of these. */
(() => {
  const S = window.SGO;
  if (S.banners) return;
  S.banners = true;
  S.SUBJECT_BANNERS = [['science', 'Science'], ['biology', 'Biology'], ['history', 'History'], ['english', 'English / Literature'], ['cs', 'Computer Science'], ['languages', 'Languages'], ['electives', 'Arts & electives']];
  const KNOWN = new Set(S.SUBJECT_BANNERS.map((b) => b[0]));
  /** Address of a banner photograph inside the extension. Unknown ids (for example the retired "math") return '' so the card falls back. */
  S.bannerUrl = (id) => {
    if (!KNOWN.has(id)) return '';
    const path = `banners/${id}.jpg`;
    return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL(path) : '/' + path;
  };
  /* Suggestions only: shown as a "Suggested" badge in the picker. They never change a student's selection. */
  const RULES = [
    ['languages', /\b(spanish|french|german|latin|chinese|japanese|mandarin|italian|arabic|korean|russian|asl|sign language|world language|esl)\b/i],
    ['cs', /\b(computer|coding|programming|cs[a-z]?|robotics|cyber|software|informatics|data science)\b/i],
    ['science', /\b(math|calculus|calc|algebra|geometry|trigonometry|trig|precalc|pre-calc|statistics|stats|probability)\b/i],
    ['biology', /(biolog|\bbio\b|anatomy|physiolog|medic|health|nutrition|zoology|botany|forensic)/i],
    ['science', /(chemistry|\bchem\b|physics|science|astronomy|geology|environmental|engineering|\bstem\b)/i],
    ['history', /(history|apush|government|politic|econom|geograph|civics|sociolog|psycholog|\bgov\b)/i],
    ['english', /\b(english|literature|lit|composition|comp|writing|journalism|reading|rhetoric|language arts|ela)\b/i],
  ];
  const CODE = { MATH: 'science', BIOL: 'biology', BIO: 'biology', CHEM: 'science', PHYS: 'science', HIST: 'history', ENGL: 'english', ENG: 'english', CS: 'cs', CSE: 'cs' };
  S.recommendBanner = (rawName) => {
    const clean = S.cleanName(rawName || ''), code = (S.courseCode(rawName) || '').replace(/[^A-Z]/g, '');
    for (const [id, re] of RULES) if (re.test(clean)) return id;
    return CODE[code] || 'electives';
  };
})();
