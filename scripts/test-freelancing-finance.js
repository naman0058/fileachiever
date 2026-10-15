'use strict';

const assert = require('assert');
const {
  parseMoney,
  clientOutstandingInr,
  agentOutstandingInr,
  clientPaymentStatus,
  grossProjectProfit,
  CURRENCY_INR,
} = require('../utils/freelancingFinanceMap');

function test(name, fn) {
  try {
    fn();
    console.log('OK', name);
  } catch (e) {
    console.error('FAIL', name, e.message);
    process.exitCode = 1;
  }
}

test('parseMoney rejects invalid', () => {
  assert.strictEqual(parseMoney('abc'), null);
});

test('client outstanding never negative', () => {
  assert.strictEqual(clientOutstandingInr({ lead_price: 100, advance_amount: 150 }, 150), 0);
});

test('partial payment status', () => {
  assert.strictEqual(clientPaymentStatus({ lead_price: 100 }, 40), 'partial');
});

test('gross project profit not net', () => {
  assert.strictEqual(grossProjectProfit({ lead_price: 100, agent_price: 30 }), 70);
});

test('agent outstanding', () => {
  assert.strictEqual(agentOutstandingInr({ agent_price: 50 }, 20), 30);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('All freelancing finance unit tests passed.');
