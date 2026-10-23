import { Router, type IRouter } from "express";
import healthRouter from "./health";
import expensesRouter from "./expenses";

const router: IRouter = Router();

router.use(healthRouter);
router.use(expensesRouter);

export default router;
