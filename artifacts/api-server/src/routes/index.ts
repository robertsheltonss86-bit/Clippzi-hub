import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import postsRouter from "./posts";
import livestreamsRouter from "./livestreams";
import giftsRouter from "./gifts";
import shopRouter from "./shop";
import moderationRouter from "./moderation";
import storageRouter from "./storage";
import platformRouter from "./platform";
import stripeConnectRouter from "./stripe-connect";
import checkoutRouter from "./checkout";
import coinsRouter from "./coins";
import messagesRouter from "./messages";
import storiesRouter from "./stories";
import supportRouter from "./support";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(postsRouter);
router.use(livestreamsRouter);
router.use(giftsRouter);
router.use(shopRouter);
router.use(moderationRouter);
router.use(storageRouter);
router.use(platformRouter);
router.use(stripeConnectRouter);
router.use(checkoutRouter);
router.use(coinsRouter);
router.use(messagesRouter);
router.use(storiesRouter);
router.use(supportRouter);

export default router;
