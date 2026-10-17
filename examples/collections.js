const scores = [80, 90, 100];
const student = { name: 'Amo', scores, active: true };

const firstScore = student.scores[0];
const count = scores.length;
const greeting = 'Hello, ' + student.name;

scores[1] = 95;
student.active = false;

/** @param {{name: string, scores: number[]}} user @returns {number} */
function first(user) {
  return user.scores[0];
}
const result = first(student);
