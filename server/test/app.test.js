import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.DATABASE_PATH = ':memory:';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:5173';

const { createApp } = await import('../src/app.js');
const { closeDb } = await import('../src/db.js');
const app = createApp();

after(() => closeDb());

test('health endpoint is available', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
});

test('family owner can register, verify, login and record a transaction', async () => {
  const email = 'owner@example.com';
  const password = 'MoneyMate123!';
  const registration = await request(app)
    .post('/api/auth/register')
    .send({
      displayName: 'Minh Anh',
      email,
      password,
      mode: 'create',
      familyName: 'Nhà Bình Yên',
    })
    .expect(201);

  assert.match(registration.body.previewVerificationUrl, /verify-email\?token=/);
  const verificationToken = new URL(registration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: verificationToken }).expect(200);

  const login = await request(app).post('/api/auth/login').send({ email, password }).expect(200);
  assert.equal(login.body.user.role, 'owner');
  assert.equal(login.body.family.name, 'Nhà Bình Yên');
  assert.ok(login.body.accessToken);
  assert.ok(login.body.refreshToken);

  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  assert.equal(categories.body.length, 14);
  const food = categories.body.find((category) => category.name === 'Ăn uống' && category.type === 'expense');

  const family = await request(app).get('/api/family').set(auth).expect(200);
  const initialSync = await request(app).get('/api/family/sync').set(auth).expect(200);
  assert.deepEqual(initialSync.body, family.body.revisions);
  const ownerId = family.body.members[0].id;
  await request(app)
    .post('/api/transactions')
    .set(auth)
    .send({
      type: 'expense',
      amount: 125000,
      categoryId: food.id,
      transactionDate: '2026-08-09',
      assignedTo: ownerId,
      note: 'Bữa tối',
    })
    .expect(201);

  const changedSync = await request(app).get('/api/family/sync').set(auth).expect(200);
  assert.equal(changedSync.body.baseRevision, initialSync.body.baseRevision);
  assert.equal(changedSync.body.transactionsRevision, initialSync.body.transactionsRevision + 1);

  const summary = await request(app).get('/api/reports/summary?month=2026-08').set(auth).expect(200);
  assert.equal(summary.body.expense, 125000);
  assert.equal(summary.body.balance, -125000);
  assert.equal(summary.body.transactionCount, 1);
});

test('transaction validation rejects a category with the wrong type', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  const salary = categories.body.find((category) => category.name === 'Lương');
  const family = await request(app).get('/api/family').set(auth).expect(200);

  const response = await request(app)
    .post('/api/transactions')
    .set(auth)
    .send({
      type: 'expense',
      amount: 100000,
      categoryId: salary.id,
      transactionDate: '2026-08-09',
      assignedTo: family.body.members[0].id,
    })
    .expect(422);
  assert.match(response.body.message, /không phù hợp/);
});

test('a partner can join by invite code and a third member is rejected', async () => {
  const ownerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const ownerAuth = { Authorization: `Bearer ${ownerLogin.body.accessToken}` };
  const family = await request(app).get('/api/family').set(ownerAuth).expect(200);

  const registration = await request(app)
    .post('/api/auth/register')
    .send({
      displayName: 'Ngọc An',
      email: 'partner@example.com',
      password: 'Partner123!',
      mode: 'join',
      inviteCode: family.body.inviteCode,
    })
    .expect(201);
  const verificationToken = new URL(registration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: verificationToken }).expect(200);

  const partnerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'partner@example.com', password: 'Partner123!' })
    .expect(200);
  assert.equal(partnerLogin.body.user.role, 'member');
  await request(app)
    .post('/api/family/invite-code')
    .set({ Authorization: `Bearer ${partnerLogin.body.accessToken}` })
    .expect(403);

  await request(app)
    .post('/api/auth/register')
    .send({
      displayName: 'Người thứ ba',
      email: 'third@example.com',
      password: 'ThirdUser123!',
      mode: 'join',
      inviteCode: family.body.inviteCode,
    })
    .expect(409);

  const updatedFamily = await request(app).get('/api/family').set(ownerAuth).expect(200);
  assert.equal(updatedFamily.body.members.length, 2);
});

test('profile, family settings, member removal and account deletion work', async () => {
  const ownerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const ownerAuth = { Authorization: `Bearer ${ownerLogin.body.accessToken}` };
  const family = await request(app).get('/api/family').set(ownerAuth).expect(200);
  const partner = family.body.members.find((member) => member.email === 'partner@example.com');

  await request(app)
    .patch('/api/users/me')
    .set(ownerAuth)
    .send({ displayName: 'Minh Tạm', email: 'owner@example.com', avatarUrl: null })
    .expect(200);
  await request(app)
    .patch('/api/users/me')
    .set(ownerAuth)
    .send({ displayName: 'Minh Anh', email: 'owner@example.com', avatarUrl: null })
    .expect(200);

  await request(app)
    .patch('/api/family')
    .set(ownerAuth)
    .send({ name: 'Nhà Tạm', currency: 'USD', language: 'en' })
    .expect(200);
  await request(app)
    .patch('/api/family')
    .set(ownerAuth)
    .send({ name: 'Nhà Bình Yên', currency: 'VND', language: 'vi' })
    .expect(200);

  await request(app).delete(`/api/family/members/${partner.id}`).set(ownerAuth).expect(204);
  const remaining = await request(app).get('/api/family').set(ownerAuth).expect(200);
  assert.equal(remaining.body.members.length, 1);

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'partner@example.com', password: 'Partner123!' })
    .expect(403);

  const soloRegistration = await request(app)
    .post('/api/auth/register')
    .send({
      displayName: 'Tài khoản thử',
      email: 'solo@example.com',
      password: 'SoloPassword123!',
      mode: 'create',
      familyName: 'Gia đình thử',
    })
    .expect(201);
  const soloToken = new URL(soloRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: soloToken }).expect(200);
  const soloLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'solo@example.com', password: 'SoloPassword123!' })
    .expect(200);
  const soloAuth = { Authorization: `Bearer ${soloLogin.body.accessToken}` };
  const emailUpdate = await request(app)
    .patch('/api/users/me')
    .set(soloAuth)
    .send({
      displayName: 'Tài khoản thử',
      email: 'solo-new@example.com',
      avatarUrl: 'data:image/webp;base64,AAAA',
    })
    .expect(200);
  const emailToken = new URL(emailUpdate.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: emailToken }).expect(200);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'solo-new@example.com', password: 'SoloPassword123!' })
    .expect(200);
  await request(app)
    .patch('/api/users/me/password')
    .set(soloAuth)
    .send({ currentPassword: 'SoloPassword123!', newPassword: 'SoloPassword456!' })
    .expect(200);
  await request(app)
    .delete('/api/users/me')
    .set({ Authorization: `Bearer ${soloLogin.body.accessToken}` })
    .expect(204);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'solo-new@example.com', password: 'SoloPassword456!' })
    .expect(401);
});

test('category and transaction CRUD preserve family data rules', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const family = await request(app).get('/api/family').set(auth).expect(200);

  const createdCategory = await request(app)
    .post('/api/categories')
    .set(auth)
    .send({ name: 'Thú cưng', type: 'expense', icon: 'PawPrint', color: '#4A8F8B' })
    .expect(201);
  await request(app)
    .patch(`/api/categories/${createdCategory.body.id}`)
    .set(auth)
    .send({ name: 'Chăm thú cưng', icon: 'HeartPulse', color: '#E56B78' })
    .expect(200);

  const createdTransaction = await request(app)
    .post('/api/transactions')
    .set(auth)
    .send({
      type: 'expense',
      amount: 350000,
      categoryId: createdCategory.body.id,
      transactionDate: '2026-08-08',
      assignedTo: family.body.members[0].id,
      note: 'Thức ăn cho mèo',
    })
    .expect(201);

  await request(app).delete(`/api/categories/${createdCategory.body.id}`).set(auth).expect(409);
  await request(app)
    .patch(`/api/transactions/${createdTransaction.body.id}`)
    .set(auth)
    .send({
      type: 'expense',
      amount: 375000,
      categoryId: createdCategory.body.id,
      transactionDate: '2026-08-08',
      assignedTo: family.body.members[0].id,
      note: 'Thức ăn và cát cho mèo',
    })
    .expect(200);

  const detail = await request(app).get(`/api/transactions/${createdTransaction.body.id}`).set(auth).expect(200);
  assert.equal(detail.body.amount, 375000);
  assert.equal(detail.body.note, 'Thức ăn và cát cho mèo');

  await request(app).delete(`/api/transactions/${createdTransaction.body.id}`).set(auth).expect(204);
  await request(app).delete(`/api/categories/${createdCategory.body.id}`).set(auth).expect(204);
});

test('reports expose trends and a UTF-8 CSV export', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };

  const trend = await request(app)
    .get('/api/reports/trend?endMonth=2026-08&months=6')
    .set(auth)
    .expect(200);
  assert.equal(trend.body.length, 6);
  assert.equal(trend.body.at(-1).month, '2026-08');

  const csv = await request(app)
    .get('/api/reports/export?month=2026-08')
    .set(auth)
    .expect(200)
    .expect('Content-Type', /text\/csv/);
  assert.match(csv.text, /Ngày/);
  assert.match(csv.text, /Bữa tối/);
});

test('refresh tokens rotate and cannot be reused', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const refreshed = await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: login.body.refreshToken })
    .expect(200);
  assert.notEqual(refreshed.body.refreshToken, login.body.refreshToken);
  await request(app)
    .post('/api/auth/refresh')
    .send({ refreshToken: login.body.refreshToken })
    .expect(401);
});

test('password reset invalidates the old password', async () => {
  const forgot = await request(app)
    .post('/api/auth/forgot-password')
    .send({ email: 'owner@example.com' })
    .expect(200);
  const resetToken = new URL(forgot.body.previewResetUrl).searchParams.get('token');
  await request(app)
    .post('/api/auth/reset-password')
    .send({ token: resetToken, password: 'NewMoneyMate123!' })
    .expect(200);

  await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(401);
  await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'NewMoneyMate123!' })
    .expect(200);
});
