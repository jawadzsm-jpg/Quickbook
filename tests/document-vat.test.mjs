import test from 'node:test';
import assert from 'node:assert/strict';
import { documentVatCode, documentVatCodes, usesSingleVatCode, withDocumentVat } from '../lib/document-vat.ts';

test('sales and purchase documents use one VAT code; returns and payments are unaffected', () => {
  for (const type of ['invoice', 'pending invoice', 'quotation', 'estimate', 'proforma invoice', 'sales order', 'sales receipt', 'credit memo', 'bill', 'purchase order']) assert.equal(usesSingleVatCode(type), true, type);
  for (const type of ['vendor credit', 'item receipt', 'customer payment', 'cheque']) assert.equal(usesSingleVatCode(type), false, type);
});

test('mixed VAT codes are detected, stock-return lines are ignored', () => {
  assert.deepEqual(documentVatCodes([{ vatCode: 'ZERO', quantity: 10 }, { vatCode: 'STANDARD', quantity: 20 }]), ['ZERO', 'STANDARD']);
  assert.deepEqual(documentVatCodes([{ vatCode: 'STANDARD', quantity: 1 }, { vatCode: 'ZERO', quantity: -1 }]), ['STANDARD']);
});

test('changing VAT applies to every line except stock returns', () => {
  const lines = withDocumentVat([{ vatCode: 'ZERO', vatRate: '0', quantity: '10' }, { vatCode: 'STANDARD', vatRate: '5', quantity: '2' }, { vatCode: 'ZERO', vatRate: '0', quantity: '-1' }], 'STANDARD', '5');
  assert.deepEqual(lines.map((line) => line.vatCode), ['STANDARD', 'STANDARD', 'ZERO']);
});

test('new and edited lines take the VAT code already chosen on the document, even on an empty first line', () => {
  const lines = [{ vatCode: 'ZERO', quantity: '1' }, { vatCode: 'EXEMPT', quantity: '1' }];
  assert.equal(documentVatCode(lines), 'ZERO');
  assert.equal(documentVatCode(lines, 0), 'EXEMPT');
  assert.equal(documentVatCode([{ vatCode: 'ZERO', quantity: '-1' }]), undefined);
});
