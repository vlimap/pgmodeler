const express = require('express');
const { Feedback } = require('../models');
const { feedbackPayloadSchema } = require('../utils/validation');

const router = express.Router();

router.post('/', async (req, res, next) => {
  const parse = feedbackPayloadSchema.safeParse(req.body);
  if (!parse.success) {
    const issue = parse.error.issues[0];
    return res.status(400).json({ error: issue?.message || 'Payload inválido.' });
  }

  try {
    const feedback = await Feedback.create({
      rating: parse.data.rating,
      comment: parse.data.comment,
      usageCount: parse.data.usageCount ?? null,
      userId: req.user ? req.user.id : null,
    });

    res.status(201).json({
      id: feedback.id,
      rating: feedback.rating,
      comment: feedback.comment,
      usageCount: feedback.usageCount,
      submittedAt: feedback.submittedAt,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
