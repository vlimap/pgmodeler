const { setDefaultResultOrder } = require('dns');

try {
  setDefaultResultOrder?.('ipv4first');
} catch (error) {
  // ignore environments that do not support setDefaultResultOrder
}

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const passport = require('./config/passport');
const { sequelize } = require('./config/database');
const { marketingConsentSchema } = require('./utils/validation');
const requireAuth = require('./middleware/requireAuth');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const feedbackRoutes = require('./routes/feedback');
const { User } = require('./models');

const defaultCspDirectives =
  helmet.contentSecurityPolicy && typeof helmet.contentSecurityPolicy.getDefaultDirectives === 'function'
    ? helmet.contentSecurityPolicy.getDefaultDirectives()
    : {};

const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET não definido. Configure a variável de ambiente.');
}
if (!FRONTEND_URL) {
  throw new Error('FRONTEND_URL não definido. Configure a URL autorizada do frontend.');
}

const CORS_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Rate limit específico para endpoints delicados de autenticação.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

// Limite geral para evitar flood em qualquer rota REST.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const createApp = async () => {
  const app = express();
  app.set('trust proxy', 1);

  const store = new SequelizeStore({
    db: sequelize,
    expiration: 7 * 24 * 60 * 60 * 1000,
  });

  // Camada de segurança: CSP dinâmico, Helmet e compressão.
  app.use(
    helmet({
      contentSecurityPolicy:
        NODE_ENV === 'production'
          ? {
              useDefaults: true,
              directives: {
                ...defaultCspDirectives,
                'img-src': ["'self'", 'data:', 'https://avatars.githubusercontent.com'],
                'connect-src': ["'self'", ...CORS_ORIGINS],
              },
            }
          : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  if (NODE_ENV !== 'test') {
    app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || CORS_ORIGINS.includes(origin)) {
          return callback(null, origin || CORS_ORIGINS[0]);
        }
        return callback(new Error('Origin not allowed by CORS'));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(generalLimiter);
  app.use(
    session({
      // Sessão persistida no Postgres via connect-session-sequelize.
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
      store,
    }),
  );

  await store.sync();

  app.use(passport.initialize());
  app.use(passport.session());

  // Health-check simples para uptime monitors.
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/feedback', feedbackRoutes);

  // Retorna usuário logado para hydration do frontend.
  app.get('/api/me', (req, res) => {
    if (!req.user) {
      return res.status(200).json({ user: null });
    }
    res.json({
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatarUrl: req.user.avatarUrl,
        githubId: req.user.githubId,
        marketingOptIn: req.user.marketingOptIn,
        marketingConsentAt: req.user.marketingConsentAt,
      },
    });
  });

  // Armazena consentimento de marketing (LGPD).
  app.post('/api/me/marketing-consent', requireAuth, async (req, res, next) => {
    const parse = marketingConsentSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: parse.error.issues[0].message });
    }
    try {
      const updated = await req.user.update({
        marketingOptIn: parse.data.marketingOptIn,
        marketingConsentAt: new Date(),
      });
      res.json({
        marketingOptIn: updated.marketingOptIn,
        marketingConsentAt: updated.marketingConsentAt,
      });
    } catch (error) {
      next(error);
    }
  });

  if (NODE_ENV === 'test') {
    // Endpoint auxiliar para testes integrais (simula login sem OAuth).
    app.post('/__test/login', async (req, res, next) => {
      try {
        const { userId } = req.body;
        if (!userId) {
          return res.status(400).json({ error: 'userId é obrigatório' });
        }
        const user = await User.findByPk(userId);
        if (!user) {
          return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        req.login(user, (err) => {
          if (err) {
            return next(err);
          }
          res.json({ ok: true });
        });
      } catch (error) {
        next(error);
      }
    });
  }

  // Falhas não tratadas vão usar este handler padrão JSON.
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Erro interno no servidor' });
  });

  return { app, store };
};

module.exports = { createApp, sequelize };
