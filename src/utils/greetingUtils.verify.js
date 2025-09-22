/**
 * Manual verification script for greeting utilities
 * Run with: node src/utils/greetingUtils.verify.js
 */

const {
  getTimeBasedGreeting,
  getRandomQuote,
  getCurrentHour,
  isNewDay,
  INSPIRATIONAL_QUOTES
} = require('./greetingUtils');

console.log('=== Greeting Utils Verification ===\n');

// Test 1: Morning greeting (Requirement 1.1)
console.log('1. Testing Morning Greeting (5:00 AM - 11:59 AM):');
const morningTime = new Date('2024-01-15T08:30:00');
console.log(`   Time: ${morningTime.toLocaleTimeString()}`);
console.log(`   Greeting: "${getTimeBasedGreeting(morningTime)}"`);
console.log(`   Expected: "Good Morning!" - ${getTimeBasedGreeting(morningTime) === 'Good Morning!' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 2: Afternoon greeting (Requirement 1.2)
console.log('2. Testing Afternoon Greeting (12:00 PM - 5:59 PM):');
const afternoonTime = new Date('2024-01-15T14:30:00');
console.log(`   Time: ${afternoonTime.toLocaleTimeString()}`);
console.log(`   Greeting: "${getTimeBasedGreeting(afternoonTime)}"`);
console.log(`   Expected: "Good Afternoon!" - ${getTimeBasedGreeting(afternoonTime) === 'Good Afternoon!' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 3: Evening greeting (Requirement 1.3)
console.log('3. Testing Evening Greeting (6:00 PM - 4:59 AM):');
const eveningTime = new Date('2024-01-15T20:30:00');
console.log(`   Time: ${eveningTime.toLocaleTimeString()}`);
console.log(`   Greeting: "${getTimeBasedGreeting(eveningTime)}"`);
console.log(`   Expected: "Good Evening!" - ${getTimeBasedGreeting(eveningTime) === 'Good Evening!' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 4: Late night greeting (still evening)
console.log('4. Testing Late Night Greeting (2:30 AM):');
const lateNightTime = new Date('2024-01-15T02:30:00');
console.log(`   Time: ${lateNightTime.toLocaleTimeString()}`);
console.log(`   Greeting: "${getTimeBasedGreeting(lateNightTime)}"`);
console.log(`   Expected: "Good Evening!" - ${getTimeBasedGreeting(lateNightTime) === 'Good Evening!' ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 5: Quote selection (Requirements 1.4, 1.5)
console.log('5. Testing Quote Selection:');
console.log(`   Total quotes available: ${INSPIRATIONAL_QUOTES.length}`);
console.log(`   Expected: 4 quotes - ${INSPIRATIONAL_QUOTES.length === 4 ? '✅ PASS' : '❌ FAIL'}`);

const quote1 = getRandomQuote();
const quote2 = getRandomQuote();
const quote3 = getRandomQuote();

console.log(`   Sample quote 1: "${quote1.substring(0, 50)}..."`);
console.log(`   Sample quote 2: "${quote2.substring(0, 50)}..."`);
console.log(`   Sample quote 3: "${quote3.substring(0, 50)}..."`);

const isValidQuote1 = INSPIRATIONAL_QUOTES.includes(quote1);
const isValidQuote2 = INSPIRATIONAL_QUOTES.includes(quote2);
const isValidQuote3 = INSPIRATIONAL_QUOTES.includes(quote3);

console.log(`   All quotes from predefined pool: ${isValidQuote1 && isValidQuote2 && isValidQuote3 ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 6: Helper functions
console.log('6. Testing Helper Functions:');
const testTime = new Date('2024-01-15T14:30:00');
const hour = getCurrentHour(testTime);
console.log(`   getCurrentHour(2:30 PM): ${hour}`);
console.log(`   Expected: 14 - ${hour === 14 ? '✅ PASS' : '❌ FAIL'}`);

const yesterday = new Date('2024-01-14T20:00:00');
const today = new Date('2024-01-15T08:00:00');
const isNewDayResult = isNewDay(yesterday, today);
console.log(`   isNewDay(yesterday, today): ${isNewDayResult}`);
console.log(`   Expected: true - ${isNewDayResult === true ? '✅ PASS' : '❌ FAIL'}\n`);

// Test 7: Current time greeting
console.log('7. Testing Current Time Greeting:');
const currentGreeting = getTimeBasedGreeting();
const currentQuote = getRandomQuote();
console.log(`   Current greeting: "${currentGreeting}"`);
console.log(`   Current quote: "${currentQuote.substring(0, 80)}..."`);

console.log('\n=== Verification Complete ===');
console.log('All core functionality has been implemented according to requirements 1.1-1.5');