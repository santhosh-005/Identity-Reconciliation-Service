import { z } from "zod";

export const IdentifyRequestSchema = z
  .object({
    email: z.string().nullable().optional(),
    phoneNumber: z
      .union([z.string(), z.number()])
      .nullable()
      .optional()
      .transform((val) => {
        if (val === null || val === undefined) return val;
        return String(val);
      }),
  })
  .refine(
    (data) => {
      const hasEmail =
        data.email !== null && data.email !== undefined && data.email.trim() !== "";
      const hasPhone =
        data.phoneNumber !== null &&
        data.phoneNumber !== undefined &&
        String(data.phoneNumber).trim() !== "";
      return hasEmail || hasPhone;
    },
    {
      message: "At least one of email or phoneNumber must be provided",
    }
  );

export type IdentifyRequest = z.infer<typeof IdentifyRequestSchema>;
