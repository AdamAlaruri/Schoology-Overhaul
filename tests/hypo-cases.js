// Hypothetical grades: the weighted calculation and the layer that sits on the Schoology gradebook. Run: node tests/hypo-cases.js
const path = require('path');
global.window = {};
require(path.join(__dirname, '..', 'src', 'color.js')); require(path.join(__dirname, '..', 'src', 'core.js'));
const S = window.SGO;
let fail = 0;
const near = (a, b, m) => { if (a == null || b == null ? a !== b : Math.abs(a - b) > 1e-6) { fail++; console.log(`FAIL  ${m}: got ${a}, want ${b}`); } };
const cats = [{ id: 'h', name: 'Homework', weight: 20 }, { id: 't', name: 'Tests', weight: 50 }, { id: 'p', name: 'Project', weight: 30 }];
const it = (cat, e, p) => ({ id: Math.random().toString(36), cat, earned: e, possible: p });

// points inside a category, weights between categories
let r = S.hypoGrade(cats, [it('h', 18, 20), it('h', 9, 10), it('t', 45, 50), it('t', 80, 100), it('p', 27, 30)]);
near(r.rows[0].percent, 90, 'homework is points earned over points possible (27/30)');
near(r.rows[1].percent, (125 / 150) * 100, 'tests pool their points (125/150), not an average of percents');
near(r.percent, (20 * 90 + 50 * (125 / 150) * 100 + 30 * 90) / 100, 'weighted average of the three categories');
near(r.totalWeight, 100, 'weights total 100');

// a category with no scores is left out and the others are scaled up
r = S.hypoGrade(cats, [it('h', 18, 20), it('t', 40, 50)]);
near(r.usedWeight, 70, 'only categories with scores carry weight');
near(r.percent, (20 * 90 + 50 * 80) / 70, 'scaled over the weight in use, not dragged down by the empty project');

// weights that do not total 100 are scaled to 100
r = S.hypoGrade([{ id: 'a', name: 'A', weight: 30 }, { id: 'b', name: 'B', weight: 30 }], [it('a', 100, 100), it('b', 50, 100)]);
near(r.totalWeight, 60, 'weights of 60 are reported as 60'); near(r.percent, 75, 'and the grade is still a true average of the two');

// nothing scored, blanks, bad numbers
near(S.hypoGrade(cats, []).percent, null, 'no scores means no grade, not 0%');
near(S.hypoGrade(cats, [it('h', null, 20), it('h', 5, null), it('h', -1, 10), it('h', NaN, 10)]).percent, null, 'blank, negative and invalid scores are ignored');
near(S.hypoGrade([], [it('h', 5, 10)]).percent, null, 'scores need a category');
near(S.hypoGrade([{ id: 'h', name: 'H', weight: 0 }, { id: 't', name: 'T', weight: 0 }], [it('h', 5, 10), it('t', 15, 20)]).percent, (20 / 30) * 100, 'all weights 0: every point counts equally');
near(S.hypoGrade(cats, [it('h', 12, 10)]).percent, 120, 'above 100% is allowed (extra credit)');
near(S.hypoGrade([{ id: 'h', name: 'H', weight: '25' }], [it('h', 1, 2)]).rows[0].weight, 25, 'weights typed as text are read');
near(S.hypoGrade([{ id: 'h', name: 'H', weight: -5 }], [it('h', 1, 2)]).rows[0].weight, 0, 'negative weights count as 0');

// the layer on top of a Schoology gradebook
const book = () => ({ percent: 90, periods: [{ name: 'S1', categories: [
  { name: 'Homework', weight: 40, items: [{ title: 'HW1', dueText: 'Oct 1', earned: 9, possible: 10 }, { title: 'HW2', dueText: 'Oct 8', earned: null, possible: 10 }] },
  { name: 'Tests', weight: 60, items: [{ title: 'T1', dueText: 'Oct 20', earned: 45, possible: 50 }] }] }] });
let o = S.overlayGrade(book(), null);
near(o.changed ? 1 : 0, 0, 'no layer: nothing changed');
near(o.percent, (40 * 90 + 60 * 90) / 100, 'no layer: the weighted grade of the real gradebook');
near(o.cats.length, 2, 'Schoology categories are used as they are'); near(o.cats[0].weight, 40, 'Schoology weights are kept');
// a what-if score for an item that is not graded yet
const k = S.gradeKey({ name: 'Homework' }, { title: 'HW2', dueText: 'Oct 8' });
o = S.overlayGrade(book(), { edits: { [k]: { earned: 5 } } });
near(o.changed ? 1 : 0, 1, 'an edit marks the grade as changed'); near(o.rows[0].percent, (9 + 5) / 20 * 100, 'the ungraded item now counts with the what-if score');
near(o.percent, (40 * 70 + 60 * 90) / 100, 'and the course grade follows');
near(o.items.find((i) => i.key === k).edited ? 1 : 0, 1, 'the edited item is flagged');
near(S.overlayGrade(book(), null).rows[0].earned, 9, 'the real gradebook object is never changed');
// a score added to a Schoology category and a brand new weighted category
o = S.overlayGrade(book(), { items: [{ id: 'x', title: 'Extra', cat: 'o:Tests', earned: 40, possible: 50 }], cats: [{ id: 'c1', name: 'Participation', weight: 20 }] });
near(o.rows[1].percent, (45 + 40) / 100 * 100, 'a score added to Tests pools with the real ones');
near(o.cats.length, 3, 'the new category is listed with the others'); near(o.totalWeight, 120, 'weights now total 120'); near(o.usedWeight, 100, 'the empty new category is left out until it has a score');
o = S.overlayGrade(book(), { items: [{ id: 'y', title: 'Quiz', cat: 'c1', earned: 10, possible: 10 }], cats: [{ id: 'c1', name: 'Participation', weight: 20 }] });
near(o.percent, (40 * 90 + 60 * 90 + 20 * 100) / 120, 'with a score in it the new category carries its weight (scaled over 120)');
// the student sets a weight for a Schoology category
o = S.overlayGrade(book(), { weights: { Homework: 10 } });
near(o.cats[0].weight, 10, 'a weight set by the student replaces the reported one'); near(o.cats[0].set ? 1 : 0, 1, 'and is marked as set');
// a gradebook that reports no weights: every point counts, and weights the student adds are the only ones
const bare = { periods: [{ name: '', categories: [{ name: 'A', weight: null, items: [{ title: 'a', earned: 1, possible: 2 }] }, { name: 'B', weight: null, items: [{ title: 'b', earned: 3, possible: 3 }] }] }] };
near(S.overlayGrade(bare, null).percent, (1 + 3) / (2 + 3) * 100, 'no reported weights: all points count equally');
near(S.overlayGrade(bare, { weights: { A: 50, B: 50 } }).percent, 75, 'weights the student sets are used');
near(S.overlayGrade(Object.assign(book(), { periods: [] }), null).percent, null, 'an empty gradebook gives no grade');
console.log(fail ? `${fail} failing` : 'all hypothetical-grade checks passed');
process.exit(fail ? 1 : 0);
