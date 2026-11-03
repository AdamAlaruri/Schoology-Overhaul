// Hypothetical grade calculator. Run: node tests/hypo-cases.js
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

// importing a Schoology gradebook
const g = { periods: [{ name: 'S1', categories: [{ name: 'Homework', weight: 40, items: [{ title: 'HW1', earned: 9, possible: 10 }, { title: 'HW2', earned: null, possible: 10 }] }, { name: 'Tests', weight: 60, items: [{ title: 'T1', earned: 45, possible: 50 }] }] }] };
let imp = S.hypoFromGradebook(g);
near(imp.cats.length, 2, 'two categories imported'); near(imp.items.length, 2, 'only graded items are imported'); near(imp.cats[0].weight, 40, 'reported weights are kept'); near(imp.evenSplit ? 1 : 0, 0, 'no even split when weights are known');
imp = S.hypoFromGradebook({ periods: [{ name: '', categories: [{ name: 'A', weight: null, items: [{ title: 'x', earned: 1, possible: 2 }] }, { name: 'B', weight: null, items: [{ title: 'y', earned: 2, possible: 2 }] }, { name: 'C', weight: null, items: [] }] }] });
near(imp.cats[0].weight, 33.33, 'unknown weights are split evenly'); near(imp.evenSplit ? 1 : 0, 1, 'and flagged so the student can fix them');
console.log(fail ? `${fail} failing` : 'all hypothetical-grade checks passed');
process.exit(fail ? 1 : 0);
