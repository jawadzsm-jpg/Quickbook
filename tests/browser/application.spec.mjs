import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('authenticated navigation and accounting lifecycle', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const login = JSON.parse(await readFile('.local-data/login.json', 'utf8'));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(login.email);
  await page.getByLabel('Password', { exact: true }).fill(login.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Local Administrator', { exact: true })).toBeVisible();
  for (const name of ['Inventory Overview', 'Sales & Invoicing', 'Customer Center', 'Purchases & Bills', 'Vendor Center', 'Inventory', 'HS Code & Dimensions', 'Inventory Check Reports', 'Stock Transfers', 'Banking', 'General Journal', 'Chart of Accounts', 'VAT Management', 'Employees & HR', 'Reports', 'Companies', 'Company Setup', 'Inventories', 'Invoice Series', 'Currencies', 'VAT Codes', 'Admin Controls', 'Company Home']) {
    await page.getByRole('button', { name, exact: true }).first().click();
    await expect(page.locator('h1').first()).toBeVisible();
  }
  expect(pageErrors).toEqual([]);
  // Same browser session and API routes as the UI, using an isolated company fixture.
  const call = (path, method, data) => page.evaluate(async ({path, method, data}) => {
    const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, ...(data ? {body:JSON.stringify(data)} : {}) });
    return { status: response.status, data: await response.json() };
  }, {path, method, data});
  const company = await call('/api/workspaces', 'POST', { type: 'company', name: `Browser QA ${Date.now()}`, baseCurrency: 'AED' });
  expect(company.status, JSON.stringify(company.data)).toBe(201);
  const companyId = company.data.company.id, locationId = company.data.company.locations[0].id;
  const item = await call('/api/records', 'POST', {kind:'items', companyId, locationId, name:'Browser test stock', quantity:5, salesPrice:100, cost:40});
  expect(item.status).toBe(201);
  const invoice = await call('/api/records', 'POST', { kind:'transactions', type:'invoice', companyId, locationId, party:'Browser Customer', currency:'AED', exchangeRate:1, lines:[{itemId:item.data.record.id, quantity:2, unitPrice:100, unitCost:40, vatCode:'STANDARD'}], attachments:[{fileName:'invoice-note.txt',mimeType:'text/plain',fileData:'data:text/plain;base64,aGVsbG8=',fileSize:5}] });
  expect(invoice.status, JSON.stringify(invoice.data)).toBe(201);
  expect(invoice.data.record.total).toBe(210);
  const stock = await call(`/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`, 'GET');
  expect(stock.data.records[0].quantity).toBe(3);
  const journal = await call(`/api/records?kind=transactions&id=${invoice.data.record.id}&companyId=${companyId}`, 'GET');
  expect(journal.data.journal.reduce((sum,l)=>sum+l.debit-l.credit,0)).toBe(0);
  const attachments = await call(`/api/attachments?companyId=${companyId}&entityType=transaction&entityId=${invoice.data.record.id}`, 'GET');
  expect(attachments.data.attachments).toHaveLength(1);
  const shortage = await call('/api/records', 'POST', {kind:'transactions',type:'invoice',companyId,locationId,party:'Browser Customer',lines:[{itemId:item.data.record.id,quantity:10,unitPrice:100}]});
  expect(shortage.status).toBe(409);
  const removed = await call('/api/records', 'DELETE', {kind:'transactions',id:invoice.data.record.id,companyId});
  expect(removed.status).toBe(200);
  const restored = await call(`/api/records?kind=items&companyId=${companyId}&locationId=${locationId}`, 'GET');
  expect(restored.data.records[0].quantity).toBe(5);
  await page.screenshot({path:'.local-data/application-running.png',fullPage:true});
  expect(pageErrors).toEqual([]);
});

test('staff creation assigns company access through the form', async ({ page }) => {
  const login = JSON.parse(await readFile('.local-data/login.json', 'utf8'));
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(login.email);
  await page.getByLabel('Password', { exact: true }).fill(login.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Admin Controls', exact: true }).click();
  await page.getByRole('button', { name: 'Add user', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const email = `browser-staff-${Date.now()}@comnet.local`;
  await dialog.getByLabel('Full name', { exact: true }).fill('Browser Staff');
  await dialog.getByLabel('Email', { exact: true }).fill(email);
  await dialog.locator('fieldset').getByRole('checkbox').first().check();
  await dialog.getByRole('checkbox', { name: /Email login details/ }).uncheck();
  await dialog.getByRole('button', { name: 'Add user', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'User login created' })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toHaveCount(2);
  const result = await page.evaluate(async (email) => {
    const {users} = await (await fetch('/api/admin-users')).json();
    const user = users.find((entry) => entry.email === email);
    const response = await fetch('/api/admin-users', {method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:user.id})});
    return {companyIds:user.companyIds,role:user.role,status:response.status};
  }, email);
  expect(result.companyIds).toHaveLength(1);
  expect(result.role).toBe('viewer');
  expect(result.status).toBe(200);
});
