export interface DemoProgram {
  id: string;
  title: string;
  description: string;
  source: string;
  expectedCodes: string[];
  analysisComplete: boolean;
}

/** Shared by the playground, presentation, and behavioral tests. */
export const demoPrograms: DemoProgram[] = [
  {
    id: 'checkout',
    title: 'A checkout with two problems',
    description: 'A variable changes type, then a function receives the wrong argument.',
    source: `const price = 24;
const quantity = 3;
const subtotal = price * quantity;

let discount = 5;
discount = "five";

/**
 * @param {number} total
 * @returns {number}
 */
function withTax(total) {
  return total * 1.09;
}

const finalTotal = withTax("72");`,
    expectedCodes: ['W100', 'E302'],
    analysisComplete: true,
  },
  {
    id: 'clean',
    title: 'Matching types',
    description: 'Numbers stay numbers. The function call matches its declared signature.',
    source: `/**
 * @param {number} price
 * @param {number} quantity
 * @returns {number}
 */
function calculateTotal(price, quantity) {
  return price * quantity;
}

const total = calculateTotal(24, 3);
const message = "Total: " + String(total);`,
    expectedCodes: [],
    analysisComplete: true,
  },
  {
    id: 'coercion',
    title: 'Implicit coercion',
    description: 'Valid JavaScript can still deserve a strict-policy warning.',
    source: `const price = "24";
const quantity = 3;

const total = price * quantity;
const label = "Items: " + quantity;

// Explicit conversion makes the intended type clear.
const explicitTotal = Number(price) * quantity;`,
    expectedCodes: ['W101', 'W101'],
    analysisComplete: true,
  },
  {
    id: 'scope',
    title: 'Scopes and shadowing',
    description: 'Each block owns its bindings. A block-local name cannot escape.',
    source: `const label = "Outside";

{
  const label = 42;
  const doubled = label * 2;
}

const greeting = label + "!";
const escaped = doubled;`,
    expectedCodes: ['E200'],
    analysisComplete: true,
  },
  {
    id: 'returns',
    title: 'An incorrect return',
    description: 'The return expression disagrees with the JSDoc contract.',
    source: `/**
 * @param {number} score
 * @returns {number}
 */
function doubleScore(score) {
  return "Double: " + String(score);
}

const result = doubleScore(10);`,
    expectedCodes: ['E303'],
    analysisComplete: true,
  },
  {
    id: 'unknown',
    title: 'An unknown parameter',
    description: 'The checker explains uncertainty instead of guessing a type from one call.',
    source: `function double(value) {
  return value * 2;
}

const result = double(10);`,
    expectedCodes: ['I101', 'I101', 'I101'],
    analysisComplete: false,
  },
  {
    id: 'collections',
    title: 'Arrays and objects',
    description: 'Infer nested shapes, read members, and update matching types.',
    source: `const scores = [80, 90, 100];
const student = { name: "Amo", scores, active: true };

const firstScore = student.scores[0];
const count = scores.length;
const greeting = "Hello, " + student.name;

scores[1] = 95;
student.active = false;

/** @param {{name: string, scores: number[]}} user @returns {number} */
function first(user) {
  return user.scores[0];
}
const result = first(student);`,
    expectedCodes: [],
    analysisComplete: true,
  },
  {
    id: 'collection-errors',
    title: 'Array and object mistakes',
    description: 'Find incompatible writes, a missing property, and an invalid index.',
    source: `const scores = [80, 90, 100];
const student = { name: "Amo", active: true };

scores[0] = "eighty";
student.active = "yes";
const missing = student.grade;
const invalidIndex = scores[true];`,
    expectedCodes: ['E403', 'E403', 'E400', 'E402'],
    analysisComplete: true,
  },
  {
    id: 'collection-contracts',
    title: 'Collection function contracts',
    description: 'Check array arguments, required object properties, and return shapes.',
    source: `/** @param {number[]} scores @returns {number} */
function first(scores) {
  return scores[0];
}
const wrongScores = first(["80", "90"]);

/** @param {{name: string, active: boolean}} user @returns {string} */
function label(user) {
  return user.name;
}
const wrongUser = label({ name: "Amo" });

/** @returns {{total: number}} */
function summary() {
  return { total: "100" };
}`,
    expectedCodes: ['E302', 'E302', 'E303'],
    analysisComplete: true,
  },
  {
    id: 'unsupported',
    title: 'Outside the subset',
    description: 'Branching is explicitly marked as partial analysis in this first release.',
    source: `let count = 3;

if (count > 0) {
  count = "three";
}`,
    expectedCodes: ['I100'],
    analysisComplete: false,
  },
  {
    id: 'syntax',
    title: 'A syntax error',
    description: 'Parsing comes first. Broken syntax prevents type analysis.',
    source: `const total = ;`,
    expectedCodes: ['E100'],
    analysisComplete: false,
  },
];

export const assignmentDemo = `let age = 20;
age = "twenty";`;

export const correctedAssignmentDemo = `const age = 20;
const ageLabel = "twenty";`;
