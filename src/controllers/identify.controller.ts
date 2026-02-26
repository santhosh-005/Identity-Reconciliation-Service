import { Request, Response, NextFunction } from "express";
import { contactService } from "../services/contact.service";
import { IdentifyRequest } from "../schemas/identify.schema";

export async function identifyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, phoneNumber } = req.body as IdentifyRequest;

    const result = await contactService.identifyContact(
      email ?? undefined,
      phoneNumber ?? undefined
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
