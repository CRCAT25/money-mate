import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.DATABASE_PATH = ':memory:';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.VAPID_PUBLIC_KEY = 'BFhokV6XJhdLaLVS9_mPMD2mGbILghzufVL-zwdRUmv1VBOz5BIJPx9CBgMVzBtpHX2Vi6IEjU-bl9no1w3iJdk';
process.env.VAPID_PRIVATE_KEY = 'MyUf1QJ1XZdGf_iD4J4dzeWqsB2dWEUaSFFWyDgucsc';
process.env.VAPID_SUBJECT = 'mailto:test@moneymate.vn';
process.env.GEMINI_MODEL = 'gemini-2.5-flash';
process.env.GEMINI_ENCRYPTION_KEY = 'test-gemini-encryption-key';

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
  const pushConfig = await request(app).get('/api/push/config').set(auth).expect(200);
  assert.equal(pushConfig.body.enabled, true);
  assert.equal(pushConfig.body.publicKey, process.env.VAPID_PUBLIC_KEY);
  const pushSubscription = {
    endpoint: 'https://push.example.com/moneymate-test-device',
    keys: { p256dh: 'test-device-public-key-material', auth: 'test-device-auth' },
  };
  await request(app).post('/api/push/subscriptions').set(auth).send(pushSubscription).expect(201);
  await request(app).post('/api/push/subscriptions').set(auth).send(pushSubscription).expect(201);
  await request(app).delete('/api/push/subscriptions').set(auth).send({ endpoint: pushSubscription.endpoint }).expect(204);

  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  assert.equal(categories.body.length, 14);
  const food = categories.body.find((category) => category.name === 'Ăn uống' && category.type === 'expense');

  const family = await request(app).get('/api/family').set(auth).expect(200);
  const initialSync = await request(app).get('/api/family/sync').set(auth).expect(200);
  assert.deepEqual(initialSync.body, family.body.revisions);
  const ownerId = family.body.members[0].id;
  const createdTransaction = await request(app)
    .post('/api/transactions')
    .set(auth)
    .send({
      type: 'expense',
      amount: 125000,
      categoryId: food.id,
      transactionDate: '2026-08-09',
      assignedTo: '00000000-0000-4000-8000-000000000000',
      note: 'Bữa tối',
    })
    .expect(201);

  const transaction = await request(app).get(`/api/transactions/${createdTransaction.body.id}`).set(auth).expect(200);
  assert.equal(transaction.body.assignedTo.id, ownerId);

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

test('personal spaces are isolated from every other family member', async () => {
  const ownerLogin = await request(app).post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' }).expect(200);
  const ownerAuth = { Authorization: `Bearer ${ownerLogin.body.accessToken}` };
  const ownerPersonal = ownerLogin.body.spaces.find((space) => space.type === 'personal');
  const familySpace = ownerLogin.body.spaces.find((space) => space.type === 'family');
  assert.ok(ownerPersonal);
  assert.ok(familySpace);

  const personalHeaders = { ...ownerAuth, 'X-MoneyMate-Space-Id': ownerPersonal.id };
  const personalCategories = await request(app).get('/api/categories').set(personalHeaders).expect(200);
  const personalFood = personalCategories.body.find((category) => category.type === 'expense');
  const personalTransaction = await request(app).post('/api/transactions').set(personalHeaders).send({
    type: 'expense', amount: 99000, categoryId: personalFood.id,
    transactionDate: '2026-08-10', note: 'Khoản riêng',
  }).expect(201);

  const familySummary = await request(app).get('/api/reports/summary?month=2026-08')
    .set({ ...ownerAuth, 'X-MoneyMate-Space-Id': familySpace.id }).expect(200);
  assert.equal(familySummary.body.expense, 125000);

  const intruderRegistration = await request(app).post('/api/auth/register').send({
    displayName: 'Người dùng khác', email: 'intruder@example.com',
    password: 'Intruder123!', mode: 'personal',
  }).expect(201);
  const intruderToken = new URL(intruderRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: intruderToken }).expect(200);
  const partnerLogin = await request(app).post('/api/auth/login')
    .send({ email: 'intruder@example.com', password: 'Intruder123!' }).expect(200);
  const partnerAuth = { Authorization: `Bearer ${partnerLogin.body.accessToken}` };
  await request(app).get(`/api/transactions/${personalTransaction.body.id}`)
    .set({ ...partnerAuth, 'X-MoneyMate-Space-Id': ownerPersonal.id }).expect(403);
  await request(app).get(`/api/spaces/${ownerPersonal.id}`).set(partnerAuth).expect(404);
});

test('a personal-only account can create and leave a family later', async () => {
  const registration = await request(app).post('/api/auth/register').send({
    displayName: 'Người dùng riêng', email: 'personal@example.com',
    password: 'Personal123!', mode: 'personal',
  }).expect(201);
  const token = new URL(registration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token }).expect(200);
  const login = await request(app).post('/api/auth/login')
    .send({ email: 'personal@example.com', password: 'Personal123!' }).expect(200);
  assert.equal(login.body.spaces.length, 1);
  assert.equal(login.body.spaces[0].type, 'personal');
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };

  const created = await request(app).post('/api/spaces/family').set(auth)
    .send({ name: 'Nhà riêng mới', currency: 'VND', language: 'vi' }).expect(201);
  assert.equal(created.body.space.type, 'family');
  const listed = await request(app).get('/api/spaces').set(auth).expect(200);
  assert.equal(listed.body.spaces.length, 2);

  await request(app).delete('/api/spaces/family').set(auth).expect(204);
  const after = await request(app).get('/api/spaces').set(auth).expect(200);
  assert.equal(after.body.spaces.length, 1);
  assert.equal(after.body.spaces[0].type, 'personal');
});

test('multiple family members can join by invite code', async () => {
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

  const thirdRegistration = await request(app)
    .post('/api/auth/register')
    .send({
      displayName: 'Người thứ ba',
      email: 'third@example.com',
      password: 'ThirdUser123!',
      mode: 'join',
      inviteCode: family.body.inviteCode,
    })
    .expect(201);
  const thirdVerificationToken = new URL(thirdRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: thirdVerificationToken }).expect(200);

  const updatedFamily = await request(app).get('/api/family').set(ownerAuth).expect(200);
  assert.equal(updatedFamily.body.members.length, 3);
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

  const familyDetails = await request(app).get(`/api/spaces/${family.body.id}`).set(ownerAuth).expect(200);
  assert.equal(familyDetails.body.showRecentTransactions, false);
  assert.equal(familyDetails.body.showSpendingPlan, false);
  assert.equal(familyDetails.body.showFundPlan, true);
  assert.equal(familyDetails.body.showShoppingPlan, true);
  await request(app).patch(`/api/spaces/${family.body.id}`).set(ownerAuth).send({
    name: 'Nhà Bình Yên', currency: 'VND', language: 'vi',
    showRecentTransactions: false, showSpendingPlan: false, showFundPlan: false, showShoppingPlan: false,
  }).expect(200);
  const minimalFamilyDetails = await request(app).get(`/api/spaces/${family.body.id}`).set(ownerAuth).expect(200);
  assert.equal(minimalFamilyDetails.body.showRecentTransactions, false);
  assert.equal(minimalFamilyDetails.body.showSpendingPlan, false);
  assert.equal(minimalFamilyDetails.body.showFundPlan, false);
  assert.equal(minimalFamilyDetails.body.showShoppingPlan, false);
  await request(app).patch(`/api/spaces/${family.body.id}`).set(ownerAuth).send({
    name: 'Nhà Bình Yên', currency: 'VND', language: 'vi',
    showRecentTransactions: true, showSpendingPlan: false, showFundPlan: true, showShoppingPlan: false,
  }).expect(200);
  const customFamilyDetails = await request(app).get(`/api/spaces/${family.body.id}`).set(ownerAuth).expect(200);
  assert.equal(customFamilyDetails.body.showSpendingPlan, false);
  assert.equal(customFamilyDetails.body.showFundPlan, true);
  assert.equal(customFamilyDetails.body.showShoppingPlan, false);
  await request(app).patch(`/api/spaces/${family.body.id}`).set(ownerAuth).send({
    name: 'Nhà Bình Yên', currency: 'VND', language: 'vi',
    showRecentTransactions: true, showSpendingPlan: true, showFundPlan: true, showShoppingPlan: true,
  }).expect(200);

  await request(app).delete(`/api/family/members/${partner.id}`).set(ownerAuth).expect(204);
  const remaining = await request(app).get('/api/family').set(ownerAuth).expect(200);
  assert.equal(remaining.body.members.length, 2);
  assert.ok(remaining.body.members.some((member) => member.email === 'third@example.com'));

  const removedLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'partner@example.com', password: 'Partner123!' })
    .expect(200);
  assert.equal(removedLogin.body.spaces.length, 1);
  assert.equal(removedLogin.body.spaces[0].type, 'personal');

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
  const fundAfterCategoryCreate = await request(app).get('/api/fund').set(auth).expect(200);
  const linkedPocket = fundAfterCategoryCreate.body.pockets.find(
    (pocket) => pocket.category?.id === createdCategory.body.id,
  );
  assert.equal(linkedPocket.name, 'Thú cưng');
  assert.equal(linkedPocket.category.icon, 'PawPrint');
  assert.equal(linkedPocket.category.color, '#4A8F8B');

  await request(app)
    .patch(`/api/categories/${createdCategory.body.id}`)
    .set(auth)
    .send({ name: 'Chăm thú cưng', icon: 'HeartPulse', color: '#E56B78' })
    .expect(200);
  const fundAfterCategoryUpdate = await request(app).get('/api/fund').set(auth).expect(200);
  const updatedLinkedPocket = fundAfterCategoryUpdate.body.pockets.find(
    (pocket) => pocket.category?.id === createdCategory.body.id,
  );
  assert.equal(updatedLinkedPocket.id, linkedPocket.id);
  assert.equal(updatedLinkedPocket.name, 'Chăm thú cưng');
  assert.equal(updatedLinkedPocket.category.icon, 'HeartPulse');
  assert.equal(updatedLinkedPocket.category.color, '#E56B78');

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

  await request(app).delete(`/api/categories/${createdCategory.body.id}`).set(auth).expect(204);
  const historicalDetail = await request(app).get(`/api/transactions/${createdTransaction.body.id}`).set(auth).expect(200);
  assert.equal(historicalDetail.body.category.id, null);
  assert.equal(historicalDetail.body.category.name, 'Chăm thú cưng');
  const historicalList = await request(app).get('/api/transactions?month=2026-08').set(auth).expect(200);
  assert.equal(historicalList.body.find((item) => item.id === createdTransaction.body.id).category.name, 'Chăm thú cưng');
  const historicalReport = await request(app).get('/api/reports/summary?month=2026-08').set(auth).expect(200);
  assert.ok(historicalReport.body.categories.some((item) => item.name === 'Chăm thú cưng'));
  const historicalExport = await request(app).get('/api/reports/export?month=2026-08').set(auth).expect(200);
  assert.match(historicalExport.text, /Chăm thú cưng/);

  await request(app).delete(`/api/transactions/${createdTransaction.body.id}`).set(auth).expect(204);
  const fundAfterCategoryDelete = await request(app).get('/api/fund').set(auth).expect(200);
  assert.equal(fundAfterCategoryDelete.body.pockets.some((pocket) => pocket.id === linkedPocket.id), false);
});

test('family fund tracks member contributions and fund-paid expenses independently from income', async () => {
  const ownerRegistration = await request(app).post('/api/auth/register').send({
    displayName: 'Hồng Vân', email: 'fund-owner@example.com',
    password: 'FundOwner123!', mode: 'create', familyName: 'Gia đình Quỹ',
  }).expect(201);
  const ownerToken = new URL(ownerRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: ownerToken }).expect(200);
  const ownerLogin = await request(app).post('/api/auth/login')
    .send({ email: 'fund-owner@example.com', password: 'FundOwner123!' }).expect(200);
  const ownerAuth = { Authorization: `Bearer ${ownerLogin.body.accessToken}` };
  const initialFamily = await request(app).get('/api/family').set(ownerAuth).expect(200);

  const partnerRegistration = await request(app).post('/api/auth/register').send({
    displayName: 'Quốc Thành', email: 'fund-partner@example.com',
    password: 'FundPartner123!', mode: 'join', inviteCode: initialFamily.body.inviteCode,
  }).expect(201);
  const partnerToken = new URL(partnerRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: partnerToken }).expect(200);
  const partnerLogin = await request(app).post('/api/auth/login')
    .send({ email: 'fund-partner@example.com', password: 'FundPartner123!' }).expect(200);
  const family = await request(app).get('/api/family').set(ownerAuth).expect(200);
  const owner = family.body.members.find((member) => member.email === 'fund-owner@example.com');
  const partner = family.body.members.find((member) => member.email === 'fund-partner@example.com');

  const outsiderRegistration = await request(app).post('/api/auth/register').send({
    displayName: 'Người ngoài', email: 'fund-outsider@example.com',
    password: 'FundOutsider123!', mode: 'personal',
  }).expect(201);
  const outsiderToken = new URL(outsiderRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: outsiderToken }).expect(200);
  const outsiderLogin = await request(app).post('/api/auth/login')
    .send({ email: 'fund-outsider@example.com', password: 'FundOutsider123!' }).expect(200);

  const initialFund = await request(app).get('/api/fund').set(ownerAuth).expect(200);
  const expenseCategories = await request(app).get('/api/categories').set(ownerAuth).expect(200);
  const food = expenseCategories.body.find((category) => category.name === 'Ăn uống' && category.type === 'expense');
  const expenseCategoryNames = expenseCategories.body.filter((category) => category.type === 'expense').map((category) => category.name).sort();
  const linkedFundNames = initialFund.body.pockets.filter((pocket) => pocket.category).map((pocket) => pocket.name).sort();
  assert.deepEqual(linkedFundNames, expenseCategoryNames);
  const defaultPocket = initialFund.body.pockets.find((pocket) => pocket.name === 'Quỹ chung');
  assert.ok(defaultPocket);

  await request(app).post('/api/budgets').set(ownerAuth).send({
    month: '2026-08', categoryId: food.id, amount: 1000001,
  }).expect(201);
  const autoFund = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  const foodPocket = autoFund.body.pockets.find((pocket) => pocket.category?.id === food.id);
  assert.equal(foodPocket.monthlyTarget, 1000001);
  assert.equal(foodPocket.memberTargets.find((member) => member.id === owner.id).target, 500001);
  assert.equal(foodPocket.memberTargets.find((member) => member.id === partner.id).target, 500000);

  await request(app).post(`/api/fund/pockets/${foodPocket.id}/target`).set(ownerAuth).send({
    monthlyTarget: 1000001,
    members: [
      { userId: owner.id, amount: 700001 },
      { userId: partner.id, amount: 300000 },
    ],
  }).expect(200);
  const customFund = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  const customFoodPocket = customFund.body.pockets.find((pocket) => pocket.id === foodPocket.id);
  assert.equal(customFoodPocket.memberTargets.find((member) => member.id === owner.id).target, 700001);
  assert.equal(customFoodPocket.memberTargets.find((member) => member.id === partner.id).target, 300000);

  await request(app).post('/api/budgets').set(ownerAuth).send({
    month: '2026-08', categoryId: food.id, amount: 2000000,
  }).expect(201);
  const resyncedFund = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  const resyncedFoodPocket = resyncedFund.body.pockets.find((pocket) => pocket.id === foodPocket.id);
  assert.equal(resyncedFoodPocket.monthlyTarget, 2000000);
  assert.equal(resyncedFoodPocket.memberTargets.find((member) => member.id === owner.id).target, 1000000);
  assert.equal(resyncedFoodPocket.memberTargets.find((member) => member.id === partner.id).target, 1000000);

  const createdPocket = await request(app).post('/api/fund/pockets').set(ownerAuth).send({
    name: 'Tiền mặt', color: '#D47A61',
  }).expect(201);
  const cashPocketId = createdPocket.body.pocket.id;

  await request(app).post('/api/fund/contributions').set(ownerAuth).send({
    contributionDate: '2026-08-15',
    pocketId: cashPocketId,
    note: 'Bỏ tiền vào quỹ',
    contributions: [
      { userId: owner.id, amount: 500000 },
      { userId: partner.id, amount: 500000 },
    ],
  }).expect(201);

  const fund = await request(app).get('/api/fund').set(ownerAuth).expect(200);
  assert.equal(fund.body.totalContributed, 1000000);
  assert.equal(fund.body.totalSpent, 0);
  assert.equal(fund.body.balance, 1000000);
  assert.equal(fund.body.pockets.find((pocket) => pocket.id === cashPocketId).balance, 1000000);
  assert.equal(fund.body.pockets.find((pocket) => pocket.name === 'Quỹ chung').balance, 0);
  assert.equal(fund.body.members.find((member) => member.id === owner.id).contributed, 500000);
  assert.equal(fund.body.members.find((member) => member.id === partner.id).contributed, 500000);

  const beforeExpense = await request(app).get('/api/reports/summary?month=2026-08').set(ownerAuth).expect(200);
  assert.equal(beforeExpense.body.income, 0);
  assert.equal(beforeExpense.body.expense, 0);

  const fundedExpense = await request(app).post('/api/transactions').set(ownerAuth).send({
    type: 'expense', amount: 300000, categoryId: food.id,
    transactionDate: '2026-08-15', note: 'Chi từ quỹ', paidFromFund: true, fundPocketId: cashPocketId,
  }).expect(201);
  const transaction = await request(app).get(`/api/transactions/${fundedExpense.body.id}`).set(ownerAuth).expect(200);
  assert.equal(transaction.body.paidFromFund, true);
  assert.equal(transaction.body.fundPocket.id, cashPocketId);

  const afterExpense = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  assert.equal(afterExpense.body.totalSpent, 300000);
  assert.equal(afterExpense.body.balance, 700000);
  assert.deepEqual(afterExpense.body.dailyActivity, [{
    date: '2026-08-15', contributed: 1000000, spent: 300000,
  }]);
  await request(app).post('/api/transactions').set(ownerAuth).send({
    type: 'expense', amount: 1, categoryId: food.id,
    transactionDate: '2026-08-15', paidFromFund: true, fundPocketId: defaultPocket.id,
  }).expect(422);
  const report = await request(app).get('/api/reports/summary?month=2026-08').set(ownerAuth).expect(200);
  assert.equal(report.body.income, 0);
  assert.equal(report.body.expense, 300000);

  await request(app).patch(`/api/transactions/${fundedExpense.body.id}`).set(ownerAuth).send({
    type: 'expense', amount: 700000, categoryId: food.id,
    transactionDate: '2026-08-15', note: 'Điều chỉnh chi từ quỹ', paidFromFund: true, fundPocketId: cashPocketId,
  }).expect(200);
  const afterEdit = await request(app).get('/api/fund').set(ownerAuth).expect(200);
  assert.equal(afterEdit.body.balance, 300000);
  await request(app).patch(`/api/transactions/${fundedExpense.body.id}`).set(ownerAuth).send({
    type: 'expense', amount: 300000, categoryId: food.id,
    transactionDate: '2026-08-15', note: 'Chi từ quỹ', paidFromFund: true, fundPocketId: cashPocketId,
  }).expect(200);

  await request(app).post('/api/transactions').set(ownerAuth).send({
    type: 'expense', amount: 700001, categoryId: food.id,
    transactionDate: '2026-08-15', paidFromFund: true, fundPocketId: cashPocketId,
  }).expect(422);
  await request(app).post('/api/fund/contributions').set(ownerAuth).send({
    contributionDate: '2026-08-15',
    pocketId: cashPocketId,
    contributions: [{ userId: outsiderLogin.body.user.id, amount: 100000 }],
  }).expect(422);

  const housePocket = await request(app).post('/api/fund/pockets').set(ownerAuth).send({
    name: 'Tiền nhà', color: '#4B83A6',
  }).expect(201);
  await request(app).post('/api/fund/pockets/targets').set(ownerAuth).send({
    items: [{
      pocketId: housePocket.body.pocket.id,
      monthlyTarget: 10000000,
      members: [
        { userId: owner.id, amount: 5000000 },
        { userId: partner.id, amount: 5000000 },
      ],
    }],
  }).expect(200);
  const houseContribution = await request(app).post('/api/fund/contributions').set(ownerAuth).send({
    contributionDate: '2026-08-15',
    pocketId: housePocket.body.pocket.id,
    contributions: [{ userId: owner.id, amount: 3000000 }],
  }).expect(201);
  const houseContributionId = houseContribution.body.contributionIds[0];
  const houseContributionDetails = await request(app)
    .get(`/api/fund/contributions/${houseContributionId}`)
    .set(ownerAuth)
    .expect(200);
  assert.equal(houseContributionDetails.body.amount, 3000000);
  assert.equal(houseContributionDetails.body.contributionDate, '2026-08-15');
  assert.equal(houseContributionDetails.body.pocket.id, housePocket.body.pocket.id);
  await request(app).patch(`/api/fund/contributions/${houseContribution.body.contributionIds[0]}`)
    .set(ownerAuth)
    .send({ amount: 4000000, contributionDate: '2026-08-16', pocketId: housePocket.body.pocket.id, note: 'Điều chỉnh khoản nạp' })
    .expect(200);
  const augustTracking = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  const houseInAugust = augustTracking.body.pockets.find((pocket) => pocket.id === housePocket.body.pocket.id);
  assert.equal(houseInAugust.monthlyTarget, 10000000);
  assert.equal(houseInAugust.monthlyContributed, 4000000);
  assert.equal(houseInAugust.monthlyRemaining, 6000000);
  assert.equal(houseInAugust.memberTargets.find((member) => member.id === owner.id).remaining, 1000000);
  assert.equal(houseInAugust.memberTargets.find((member) => member.id === partner.id).remaining, 5000000);
  await request(app).delete(`/api/fund/contributions/${houseContributionId}`)
    .set(ownerAuth)
    .expect(204);
  const afterContributionDelete = await request(app).get('/api/fund?month=2026-08').set(ownerAuth).expect(200);
  const houseAfterDelete = afterContributionDelete.body.pockets.find((pocket) => pocket.id === housePocket.body.pocket.id);
  assert.equal(houseAfterDelete.monthlyContributed, 0);
  assert.equal(houseAfterDelete.monthlyRemaining, 10000000);
  const septemberTracking = await request(app).get('/api/fund?month=2026-09').set(ownerAuth).expect(200);
  const houseInSeptember = septemberTracking.body.pockets.find((pocket) => pocket.id === housePocket.body.pocket.id);
  assert.equal(houseInSeptember.monthlyContributed, 0);
  assert.equal(houseInSeptember.monthlyRemaining, 10000000);
  assert.equal(houseInSeptember.memberTargets.find((member) => member.id === owner.id).remaining, 5000000);

  const personal = ownerLogin.body.spaces.find((space) => space.type === 'personal');
  const personalAuth = { ...ownerAuth, 'X-MoneyMate-Space-Id': personal.id };
  await request(app).get('/api/fund').set(personalAuth).expect(422);
  const personalCategories = await request(app).get('/api/categories').set(personalAuth).expect(200);
  const personalExpense = personalCategories.body.find((category) => category.type === 'expense');
  await request(app).post('/api/transactions').set(personalAuth).send({
    type: 'expense', amount: 10000, categoryId: personalExpense.id,
    transactionDate: '2026-08-15', paidFromFund: true,
  }).expect(422);

  assert.equal(partnerLogin.body.spaces.some((space) => space.type === 'family'), true);
});

test('monthly spending plans are shared and track actual expenses', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  const food = categories.body.find((category) => category.name === 'Ăn uống' && category.type === 'expense');
  const initialSync = await request(app).get('/api/family/sync').set(auth).expect(200);

  const created = await request(app)
    .post('/api/budgets')
    .set(auth)
    .send({ month: '2026-08', categoryId: food.id, amount: 500000 })
    .expect(201);

  const afterCreateSync = await request(app).get('/api/family/sync').set(auth).expect(200);
  assert.equal(afterCreateSync.body.baseRevision, initialSync.body.baseRevision + 1);
  assert.equal(afterCreateSync.body.transactionsRevision, initialSync.body.transactionsRevision);

  const firstPlan = await request(app).get('/api/budgets?month=2026-08').set(auth).expect(200);
  const foodPlan = firstPlan.body.items.find((item) => item.category.id === food.id);
  assert.equal(firstPlan.body.planned, 500000);
  assert.equal(firstPlan.body.spent, 125000);
  assert.equal(firstPlan.body.remaining, 375000);
  assert.equal(foodPlan.category.name, 'Ăn uống');
  assert.equal(foodPlan.percentage, 25);

  const updated = await request(app)
    .post('/api/budgets')
    .set(auth)
    .send({ month: '2026-08', categoryId: food.id, amount: 1000000 })
    .expect(201);
  assert.equal(updated.body.id, created.body.id);

  const updatedPlan = await request(app).get('/api/budgets?month=2026-08').set(auth).expect(200);
  assert.equal(updatedPlan.body.items.find((item) => item.category.id === food.id).amount, 1000000);

  await request(app).delete(`/api/budgets/${created.body.id}`).set(auth).expect(204);
  const emptyPlan = await request(app).get('/api/budgets?month=2026-08').set(auth).expect(200);
  assert.equal(emptyPlan.body.planned, 0);
  assert.equal(emptyPlan.body.spent, 0);
  assert.ok(emptyPlan.body.items.length > 0);
  assert.equal(emptyPlan.body.items.find((item) => item.category.id === food.id).id, null);
});

test('deleting every spending plan clears linked fund payment pockets', async () => {
  const ownerRegistration = await request(app).post('/api/auth/register').send({
    displayName: 'Người lập kế hoạch', email: 'clear-fund-owner@example.com',
    password: 'ClearFund123!', mode: 'create', familyName: 'Gia đình dọn quỹ',
  }).expect(201);
  const verificationToken = new URL(ownerRegistration.body.previewVerificationUrl).searchParams.get('token');
  await request(app).post('/api/auth/verify-email').send({ token: verificationToken }).expect(200);
  const login = await request(app).post('/api/auth/login').send({
    email: 'clear-fund-owner@example.com', password: 'ClearFund123!',
  }).expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  const food = categories.body.find((category) => category.name === 'Ăn uống' && category.type === 'expense');

  await request(app).post('/api/budgets').set(auth).send({
    month: '2026-08', categoryId: food.id, amount: 200000,
  }).expect(201);
  let fund = await request(app).get('/api/fund?month=2026-08').set(auth).expect(200);
  const foodPocket = fund.body.pockets.find((pocket) => pocket.category?.id === food.id);
  assert.equal(foodPocket.monthlyTarget, 200000);

  await request(app).post('/api/fund/contributions').set(auth).send({
    contributionDate: '2026-08-20', pocketId: foodPocket.id,
    contributions: [{ userId: login.body.user.id, amount: 200000 }],
  }).expect(201);

  await request(app).post('/api/budgets/batch').set(auth).send({
    month: '2026-08', scope: 'month', items: [{ categoryId: food.id, amount: 0 }],
  }).expect(200);
  fund = await request(app).get('/api/fund?month=2026-08').set(auth).expect(200);
  assert.equal(fund.body.pockets.some((pocket) => pocket.id === foodPocket.id), false);
  assert.equal(fund.body.balance, 0);
  assert.equal(fund.body.recentContributions.some((batch) => batch.total === 200000), true);

  await request(app).post('/api/budgets/batch').set(auth).send({
    month: '2026-08', scope: 'month', items: [{ categoryId: food.id, amount: 300000 }],
  }).expect(200);
  fund = await request(app).get('/api/fund?month=2026-08').set(auth).expect(200);
  const restoredPocket = fund.body.pockets.find((pocket) => pocket.category?.id === food.id);
  assert.equal(restoredPocket.id, foodPocket.id);
  assert.equal(restoredPocket.monthlyTarget, 300000);

  const transport = categories.body.find((category) => category.name === 'Giao thông' && category.type === 'expense');
  await request(app).post('/api/budgets').set(auth).send({
    month: '2026-08', categoryId: transport.id, amount: 150000,
  }).expect(201);
  const directPlan = await request(app).get('/api/budgets?month=2026-08').set(auth).expect(200);
  await request(app).delete(`/api/budgets/${directPlan.body.items.find((item) => item.category.id === transport.id).id}`).set(auth).expect(204);
  fund = await request(app).get('/api/fund?month=2026-08').set(auth).expect(200);
  assert.equal(fund.body.pockets.some((pocket) => pocket.category?.id === transport.id), false);

  const clearResult = await request(app).post('/api/budgets/clear-all').set(auth).expect(200);
  assert.match(clearResult.body.message, /toàn bộ kế hoạch/i);
  const clearedPlan = await request(app).get('/api/budgets?month=2026-08').set(auth).expect(200);
  assert.equal(clearedPlan.body.planned, 0);
  fund = await request(app).get('/api/fund?month=2026-08').set(auth).expect(200);
  assert.equal(fund.body.pockets.some((pocket) => pocket.category?.id === food.id), false);
});

test('budget save scopes support recurring plans and monthly overrides', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'MoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  const transport = categories.body.find((category) => category.name === 'Giao thông' && category.type === 'expense');

  await request(app)
    .post('/api/budgets/batch')
    .set(auth)
    .send({ month: '2027-01', scope: 'future', items: [{ categoryId: transport.id, amount: 700000 }] })
    .expect(200);

  const recurringMonth = await request(app).get('/api/budgets?month=2027-04').set(auth).expect(200);
  assert.equal(recurringMonth.body.items.find((item) => item.category.id === transport.id).amount, 700000);

  await request(app)
    .post('/api/budgets/batch')
    .set(auth)
    .send({ month: '2027-02', scope: 'month', items: [{ categoryId: transport.id, amount: 850000 }] })
    .expect(200);

  const overrideMonth = await request(app).get('/api/budgets?month=2027-02').set(auth).expect(200);
  assert.equal(overrideMonth.body.items.find((item) => item.category.id === transport.id).amount, 850000);

  const followingMonth = await request(app).get('/api/budgets?month=2027-03').set(auth).expect(200);
  assert.equal(followingMonth.body.items.find((item) => item.category.id === transport.id).amount, 700000);

  await request(app)
    .post('/api/budgets')
    .set(auth)
    .send({ month: '2027-04', categoryId: transport.id, amount: 750000 })
    .expect(201);

  await request(app)
    .post('/api/budgets/batch')
    .set(auth)
    .send({ month: '2027-04', scope: 'future', items: [{ categoryId: transport.id, amount: 900000 }] })
    .expect(200);

  const updatedLegacyMonth = await request(app).get('/api/budgets?month=2027-04').set(auth).expect(200);
  assert.equal(updatedLegacyMonth.body.items.find((item) => item.category.id === transport.id).amount, 900000);

  await request(app)
    .post('/api/budgets/batch')
    .set(auth)
    .send({ month: '2027-05', scope: 'future', items: [{ categoryId: transport.id, amount: 0 }] })
    .expect(200);

  const stoppedMonth = await request(app).get('/api/budgets?month=2027-06').set(auth).expect(200);
  assert.equal(stoppedMonth.body.items.find((item) => item.category.id === transport.id).amount, 0);
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

test('shopping list estimates prices and applies budget changes idempotently', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'NewMoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  await request(app).patch(`/api/spaces/${login.body.family.id}/gemini`).set(auth).send({
    apiKey: 'GEMINI_API_KEY="AIzaSyTestPerSpaceGeminiKey123456"',
  }).expect(200);
  const geminiStatus = await request(app).get(`/api/spaces/${login.body.family.id}/gemini`).set(auth).expect(200);
  assert.equal(geminiStatus.body.configured, true);
  assert.equal(geminiStatus.body.maskedKey, 'AIzaSy******3456');
  const category = await request(app).post('/api/categories').set(auth).send({
    name: 'Đồ mua thử', type: 'expense', icon: 'ShoppingBag', color: '#4A8F8B',
  }).expect(201);
    const categoryId = category.body.id;

    await request(app).post('/api/shopping').set(auth).send({
      month: '2027-08', name: 'Thiếu danh mục', quantity: 1, plannedUnitPrice: 100000,
    }).expect(422);

  const originalFetch = global.fetch;
  let fetchCount = 0;
  global.fetch = async (url, options) => {
    fetchCount += 1;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent');
    assert.equal(options.headers['x-goog-api-key'], 'AIzaSyTestPerSpaceGeminiKey123456');
    const requestBody = JSON.parse(options.body);
    assert.match(requestBody.contents[0].parts[0].text, /Việt Nam/);
    return {
      ok: true,
      async json() {
        return {
          candidates: [{
            content: { parts: [{ text: JSON.stringify({
              normalizedName: 'Tai nghe thử', priceLow: 120000, priceHigh: 220000,
              recommendedPrice: 180000, total: 360000, categoryName: 'Đồ mua thử', unit: 'cái',
              confidence: 'high', notes: 'Giá tham khảo.',
            }) }] },
            groundingMetadata: { groundingChunks: [{ web: { uri: 'https://shop.example.test/headphones', title: 'Nguồn thử' } }] },
          }],
        };
      },
    };
  };
  try {
    const estimate = await request(app).post('/api/shopping/estimate').set(auth).send({
      query: 'tai nghe', quantity: 2, unit: 'cái',
    }).expect(200);
    assert.equal(estimate.body.total, 360000);
    assert.equal(estimate.body.unit, 'cái');
    assert.deepEqual(estimate.body.sources, []);
    assert.match(estimate.body.notes, /ước lượng AI/i);
    await request(app).post('/api/shopping/estimate').set(auth).send({ query: 'tai nghe', quantity: 2, unit: 'cái' }).expect(200);
    assert.equal(fetchCount, 1);

    const budgetResponse = await request(app).post('/api/budgets').set(auth).send({
      month: '2027-08', categoryId, amount: 1000000,
    });
    assert.equal(budgetResponse.status, 201);
    const created = await request(app).post('/api/shopping').set(auth).send({
      month: '2027-08', name: 'Tai nghe thử', quantity: 2, unit: 'cái',
      plannedUnitPrice: 180000, plannedTotal: 360000, categoryId,
    }).expect(201);
    const itemId = created.body.item.id;
    assert.equal(created.body.item.plannedTotal, 360000);

    await request(app).post('/api/shopping/apply-budget').set(auth).send({ itemId, categoryId }).expect(200);
    await request(app).post('/api/shopping/apply-budget').set(auth).send({ itemId, categoryId }).expect(200);
    let plan = await request(app).get('/api/budgets?month=2027-08').set(auth).expect(200);
    assert.equal(plan.body.items.find((item) => item.category.id === categoryId).amount, 1360000);
    assert.deepEqual(plan.body.items.find((item) => item.category.id === categoryId).shoppingItems.map((item) => item.name), ['Tai nghe thử']);

    await request(app).patch(`/api/shopping/${itemId}`).set(auth).send({
      month: '2027-08', name: 'Tai nghe thử', quantity: 2, unit: 'cái',
      plannedUnitPrice: 200000, plannedTotal: 400000, categoryId,
    }).expect(200);
    plan = await request(app).get('/api/budgets?month=2027-08').set(auth).expect(200);
    assert.equal(plan.body.items.find((item) => item.category.id === categoryId).amount, 1400000);
    assert.equal(plan.body.items.find((item) => item.category.id === categoryId).shoppingItems[0].total, 400000);

    await request(app).delete(`/api/shopping/${itemId}`).set(auth).expect(204);
    plan = await request(app).get('/api/budgets?month=2027-08').set(auth).expect(200);
    assert.equal(plan.body.items.find((item) => item.category.id === categoryId).amount, 1000000);
    assert.deepEqual(plan.body.items.find((item) => item.category.id === categoryId).shoppingItems, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test('shopping estimate works without grounded sources', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'NewMoneyMate123!' })
    .expect(200);
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { candidates: [{ content: { parts: [{ text: '{"normalizedName":"Món thử","unit":"gói","priceLow":1,"priceHigh":2,"recommendedPrice":1,"total":1,"categoryName":"","confidence":"low","notes":""}' }] } }] };
    },
  });
  try {
    const estimate = await request(app).post('/api/shopping/estimate')
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ query: 'món thử', quantity: 1 })
      .expect(200);
    assert.deepEqual(estimate.body.sources, []);
    assert.equal(estimate.body.unit, 'gói');
    assert.match(estimate.body.notes, /ước lượng AI/i);
  } finally {
    global.fetch = originalFetch;
  }
});

test('shopping estimate falls back to another flash model when the primary is unavailable', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'NewMoneyMate123!' })
    .expect(200);
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes('/gemini-3.5-flash-lite:')) {
      return {
        ok: true,
        async json() {
          return {
            candidates: [{ content: { parts: [{ text: '{"normalizedName":"Nồi cơm","priceLow":500000,"priceHigh":1500000,"recommendedPrice":900000,"total":900000,"categoryName":"Nhà cửa","confidence":"medium","notes":""}' }] } }],
          };
        },
      };
    }
    return { ok: false, status: 503, async text() { return '{"error":{"status":"UNAVAILABLE"}}'; } };
  };
  try {
    const estimate = await request(app).post('/api/shopping/estimate')
      .set({ Authorization: `Bearer ${login.body.accessToken}` })
      .send({ query: 'nồi cơm fallback', quantity: 1 })
      .expect(200);
    assert.equal(estimate.body.recommendedPrice, 900000);
    assert.equal(calls.length, 3);
    assert.match(calls[0], /gemini-3\.5-flash/);
    assert.match(calls.at(-1), /gemini-3\.5-flash-lite/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('monthly income plans track planned and received amounts and support batch updates', async () => {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'owner@example.com', password: 'NewMoneyMate123!' })
    .expect(200);
  const auth = { Authorization: `Bearer ${login.body.accessToken}` };
  const categories = await request(app).get('/api/categories').set(auth).expect(200);
  const salary = categories.body.find((category) => category.name === 'Lương' && category.type === 'income');
  const bonus = categories.body.find((category) => category.name === 'Thưởng' && category.type === 'income');
  assert.ok(salary);
  assert.ok(bonus);

  // Record an income transaction
  await request(app).post('/api/transactions').set(auth).send({
    type: 'income', amount: 15000000, categoryId: salary.id,
    transactionDate: '2026-09-05', note: 'Lương tháng 9',
  }).expect(201);

  // Initially, income plan has 0 planned, so total spent/received is 15000000 from the recorded income transaction
  const initialPlan = await request(app).get('/api/budgets?month=2026-09&type=income').set(auth).expect(200);
  assert.equal(initialPlan.body.type, 'income');
  assert.equal(initialPlan.body.planned, 0);
  assert.equal(initialPlan.body.spent, 15000000);
  const salaryRow = initialPlan.body.items.find((item) => item.category.id === salary.id);
  assert.equal(salaryRow.amount, 0);
  assert.equal(salaryRow.spent, 15000000);

  // Set salary income budget
  const created = await request(app).post('/api/budgets').set(auth).send({
    month: '2026-09', categoryId: salary.id, amount: 20000000,
  }).expect(201);
  assert.equal(created.body.message, 'Đã lưu kế hoạch thu nhập.');

  const planAfterSalary = await request(app).get('/api/budgets?month=2026-09&type=income').set(auth).expect(200);
  assert.equal(planAfterSalary.body.planned, 20000000);
  assert.equal(planAfterSalary.body.spent, 15000000);
  assert.equal(planAfterSalary.body.remaining, 5000000);

  // Record income for bonus (currently unbudgeted)
  await request(app).post('/api/transactions').set(auth).send({
    type: 'income', amount: 5000000, categoryId: bonus.id,
    transactionDate: '2026-09-10', note: 'Thưởng quý',
  }).expect(201);

  // Total received should now be 20000000 even though bonus is not yet planned
  const planAfterBonus = await request(app).get('/api/budgets?month=2026-09&type=income').set(auth).expect(200);
  assert.equal(planAfterBonus.body.planned, 20000000);
  assert.equal(planAfterBonus.body.spent, 20000000);

  // Batch save income plan with future scope
  const batchResult = await request(app).post('/api/budgets/batch').set(auth).send({
    month: '2026-09',
    scope: 'future',
    type: 'income',
    items: [
      { categoryId: salary.id, amount: 25000000 },
      { categoryId: bonus.id, amount: 5000000 },
    ],
  }).expect(200);
  assert.equal(batchResult.body.message, 'Đã áp dụng kế hoạch thu nhập cho tháng này và các tháng sau.');

  // Check updated plan for 2026-09
  const updatedSeptember = await request(app).get('/api/budgets?month=2026-09&type=income').set(auth).expect(200);
  assert.equal(updatedSeptember.body.planned, 30000000);
  assert.equal(updatedSeptember.body.spent, 20000000);

  // Check next month (2026-10) has inherited future rule
  const octoberPlan = await request(app).get('/api/budgets?month=2026-10&type=income').set(auth).expect(200);
  assert.equal(octoberPlan.body.planned, 30000000);

  // Overriding a single month (2026-10) with month scope
  await request(app).post('/api/budgets/batch').set(auth).send({
    month: '2026-10',
    scope: 'month',
    type: 'income',
    items: [
      { categoryId: bonus.id, amount: 10000000 },
    ],
  }).expect(200);

  const updatedOctober = await request(app).get('/api/budgets?month=2026-10&type=income').set(auth).expect(200);
  const octoberBonus = updatedOctober.body.items.find((item) => item.category.id === bonus.id);
  assert.equal(octoberBonus.amount, 10000000);
  // Month 2026-11 still has original future rule (5000000)
  const novemberPlan = await request(app).get('/api/budgets?month=2026-11&type=income').set(auth).expect(200);
  const novemberBonus = novemberPlan.body.items.find((item) => item.category.id === bonus.id);
  assert.equal(novemberBonus.amount, 5000000);

  // Verify expense budgets were NOT mixed into income plans
  const expensePlan = await request(app).get('/api/budgets?month=2026-09').set(auth).expect(200);
  assert.ok(expensePlan.body.items.every((item) => categories.body.find((c) => c.id === item.category.id)?.type === 'expense'));

  // Verify created family spaces have all default plan flags enabled
  const spaces = await request(app).get('/api/spaces').set(auth).expect(200);
  const currentSpace = spaces.body.spaces.find((s) => s.type === 'family');
  assert.ok(currentSpace);
  assert.equal(currentSpace.showSpendingPlan, true);
  assert.equal(currentSpace.showIncomePlan, true);
});

