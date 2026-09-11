import test from 'node:test';
import assert from 'node:assert/strict';
import { convertInvoiceLines, invoiceCurrencyAmount } from '../lib/invoice-pricing.ts';

test('home prices convert to document currency without changing quantities or tax rates', () => {
  const [line] = convertInvoiceLines([{ unitPrice: '367.25', unitCost: '183.625', quantity: '2', vatRate: '5' }], 1, 3.6725);
  assert.equal(line.unitPrice, '100');
  assert.equal(line.unitCost, '50');
  assert.equal(line.quantity, '2');
  assert.equal(line.vatRate, '5');
  assert.equal(invoiceCurrencyAmount(367.25, 3.6725), '100');
});

test('currency round trips preserve original home prices and respect manual overrides', () => {
  const original = [{ unitPrice: '367.25', unitCost: '100' }];
  const foreign = convertInvoiceLines(original, 1, 3.6725);
  const another = convertInvoiceLines(foreign, 3.6725, 4);
  assert.equal(another[0].unitPrice, '91.81');
  assert.equal(convertInvoiceLines(another, 4, 1)[0].unitPrice, '367.25');
  const manual = [{ ...another[0], unitPrice: '80', homeUnitPrice: undefined }];
  assert.equal(convertInvoiceLines(manual, 4, 1)[0].unitPrice, '320');
});

test('missing and invalid exchange rates never produce a converted price', () => {
  for (const rate of [0, -1, NaN, Infinity]) {
    assert.throws(() => invoiceCurrencyAmount(100, rate));
    assert.throws(() => convertInvoiceLines([{ unitPrice: '100', unitCost: '50' }], rate, 1));
  }
});
