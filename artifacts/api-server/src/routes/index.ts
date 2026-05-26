import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import postsRouter from "./posts";
import livestreamsRouter from "./livestreams";
import giftsRouter from "./gifts";
import shopRouter from "./shop";
import moderationRouter from "./moderation";
import storageRouter from "./storage";
import platformRouter from "./platform";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(livestreamsRouter);
router.use(giftsRouter);
router.use(shopRouter);
router.use(moderationRouter);
router.use(storageRouter);
router.use(platformRouter);

export default router;
