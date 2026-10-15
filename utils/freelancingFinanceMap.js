'use strict';

const CURRENCY_INR = 'INR';
const CURRENCY_PKR = 'PKR';

function parseMoney(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, '').trim());
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

function clientReceivedInr(lead, clientPaymentSumInr) {
  const ledger = clientPaymentSumInr != null ? Number(clientPaymentSumInr) : null;
  const advance = parseMoney(lead.advance_amount) || 0;
  if (ledger == null) return advance;
  return advance;
}

function clientOutstandingInr(lead, receivedInr) {
  const due = parseMoney(lead.lead_price) || 0;
  const rec = receivedInr != null ? receivedInr : parseMoney(lead.advance_amount) || 0;
  return Math.max(0, Math.round((due - rec) * 100) / 100);
}

function agentPaidInr(agentPaymentSum) {
  return Math.round(Number(agentPaymentSum || 0) * 100) / 100;
}

function agentOutstandingInr(lead, agentPaid) {
  const cost = parseMoney(lead.agent_price) || 0;
  const paid = agentPaid != null ? agentPaid : 0;
  return Math.max(0, Math.round((cost - paid) * 100) / 100);
}

function clientPaymentStatus(lead, receivedInr) {
  const out = clientOutstandingInr(lead, receivedInr);
  const due = parseMoney(lead.lead_price) || 0;
  if (due <= 0) return 'no_contract';
  if (out <= 0) return 'paid';
  if ((receivedInr || 0) > 0) return 'partial';
  return 'unpaid';
}

function agentPaymentStatus(lead, agentPaid) {
  const out = agentOutstandingInr(lead, agentPaid);
  const cost = parseMoney(lead.agent_price) || 0;
  if (cost <= 0) return 'no_cost';
  if (out <= 0) return 'paid';
  if ((agentPaid || 0) > 0) return 'partial';
  return 'unpaid';
}

function grossProjectProfit(lead) {
  const lp = parseMoney(lead.lead_price) || 0;
  const ap = parseMoney(lead.agent_price) || 0;
  return Math.round((lp - ap) * 100) / 100;
}

module.exports = {
  CURRENCY_INR,
  CURRENCY_PKR,
  parseMoney,
  clientReceivedInr,
  clientOutstandingInr,
  agentPaidInr,
  agentOutstandingInr,
  clientPaymentStatus,
  agentPaymentStatus,
  grossProjectProfit,
};
