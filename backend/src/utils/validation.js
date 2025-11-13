const { z } = require('zod');

const projectPayloadSchema = z.object({
  name: z.string().trim().min(1, 'O nome é obrigatório').max(120),
  modelJson: z.any(),
});

module.exports = {
  projectPayloadSchema,
  marketingConsentSchema: z.object({
    marketingOptIn: z.boolean(),
  }),
  feedbackPayloadSchema: z.object({
    rating: z
      .number({ invalid_type_error: 'A avaliação é obrigatória.' })
      .int('A avaliação deve ser um número inteiro.')
      .min(1, 'A avaliação mínima é 1 estrela.')
      .max(5, 'A avaliação máxima é 5 estrelas.'),
    comment: z
      .string()
      .trim()
      .max(2000, 'O feedback deve ter no máximo 2000 caracteres.')
      .optional()
      .transform((value) => (value ? value : null)),
    usageCount: z
      .number()
      .int()
      .min(0)
      .max(10000)
      .optional(),
  }),
};
