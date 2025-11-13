const request = require('supertest');
const { createApp, sequelize } = require('../src/app');
const { User, Feedback } = require('../src/models');

describe('API integration', () => {
  let app;
  let sessionStore;

  beforeAll(async () => {
    const setup = await createApp();
    app = setup.app;
    sessionStore = setup.store;
  });

  beforeEach(async () => {
    await sequelize.sync({ force: true });
    await sessionStore.sync();
  });

  afterAll(async () => {
    await sequelize.close();
  });

  const loginAgent = async (overrides = {}) => {
    const user = await User.create({
      githubId: overrides.githubId || `github-${Date.now()}-${Math.random()}`,
      name: 'Test User',
      email: 'test@example.com',
      avatarUrl: 'https://example.com/avatar.png',
      ...overrides,
    });
    const agent = request.agent(app);
    await agent.post('/__test/login').send({ userId: user.id }).expect(200);
    return { agent, user };
  };

  test('GET /api/health responde status ok', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('GET /api/me sem autenticação retorna usuário nulo', async () => {
    const res = await request(app).get('/api/me').expect(200);
    expect(res.body).toEqual({ user: null });
  });

  test('Rotas de projetos exigem autenticação', async () => {
    const res = await request(app).get('/api/projects').expect(401);
    expect(res.body).toEqual({ error: 'Não autenticado' });
  });

  test('Fluxo completo de CRUD de projetos para usuário autenticado', async () => {
    const { agent, user } = await loginAgent();

    const createPayload = {
      name: 'Meu Projeto',
      modelJson: { tables: [] },
    };
    const createRes = await agent.post('/api/projects').send(createPayload).expect(201);
    expect(createRes.body).toMatchObject({
      name: 'Meu Projeto',
      userId: user.id,
      modelJson: createPayload.modelJson,
    });

    const listRes = await agent.get('/api/projects').expect(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0]).toMatchObject({ id: createRes.body.id, name: 'Meu Projeto' });

    const updateRes = await agent
      .put(`/api/projects/${createRes.body.id}`)
      .send({ name: 'Projeto Renomeado' })
      .expect(200);
    expect(updateRes.body.name).toBe('Projeto Renomeado');

    await agent.delete(`/api/projects/${createRes.body.id}`).expect(204);

    const afterDelete = await agent.get('/api/projects').expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  test('Validação de payload em marketing consent', async () => {
    const { agent } = await loginAgent();

    await agent.post('/api/me/marketing-consent').send({}).expect(400);

    const res = await agent
      .post('/api/me/marketing-consent')
      .send({ marketingOptIn: true })
      .expect(200);

    expect(res.body).toMatchObject({
      marketingOptIn: true,
    });
    expect(new Date(res.body.marketingConsentAt).getTime()).toBeGreaterThan(0);
  });

  test('POST /api/feedback registra feedback anônimo', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 5, comment: 'Excelente ferramenta!', usageCount: 22 })
      .expect(201);

    expect(res.body).toMatchObject({
      rating: 5,
      comment: 'Excelente ferramenta!',
      usageCount: 22,
    });

    const stored = await Feedback.findByPk(res.body.id);
    expect(stored).not.toBeNull();
    expect(stored.rating).toBe(5);
    expect(stored.comment).toBe('Excelente ferramenta!');
    expect(stored.usageCount).toBe(22);
    expect(stored.userId).toBeNull();
  });

  test('POST /api/feedback associa usuário autenticado', async () => {
    const { agent, user } = await loginAgent();

    const res = await agent
      .post('/api/feedback')
      .send({ rating: 3, comment: 'Gostei, mas pode melhorar.' })
      .expect(201);

    expect(res.body.rating).toBe(3);

    const stored = await Feedback.findByPk(res.body.id);
    expect(stored.userId).toBe(user.id);
  });

  test('POST /api/feedback valida payload inválido', async () => {
    const res = await request(app)
      .post('/api/feedback')
      .send({ rating: 10 })
      .expect(400);

    expect(res.body).toHaveProperty('error');
  });
});
