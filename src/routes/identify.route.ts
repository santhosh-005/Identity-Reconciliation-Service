import { Router } from "express";
import { identifyController } from "../controllers/identify.controller";
import { validate } from "../middlewares/validate";
import { IdentifyRequestSchema } from "../schemas/identify.schema";

const router = Router();

router.post("/identify", validate(IdentifyRequestSchema), identifyController);

export default router;
