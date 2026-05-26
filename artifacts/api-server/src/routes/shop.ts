import { Router } from "express";
import { db } from "@workspace/db";
import { shopProductsTable, shopOrdersTable, usersTable } from "@workspace/db";
import { eq, sql, desc, ilike } from "drizzle-orm";
import {
  ListShopProductsQueryParams,
  CreateShopProductBody,
  GetShopProductParams,
  UpdateShopProductParams,
  UpdateShopProductBody,
  DeleteShopProductParams,
  ListShopOrdersQueryParams,
  CreateShopOrderBody,
  UpdateShopOrderParams,
  UpdateShopOrderBody,
  GetTrendingShopProductsQueryParams,
} from "@workspace/api-zod";

const router = Router();

async function enrichProduct(p: typeof shopProductsTable.$inferSelect) {
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, p.sellerId));
  return {
    ...p,
    price: Number(p.price),
    rating: p.rating ? Number(p.rating) : null,
    seller: seller ? { ...seller, createdAt: seller.createdAt.toISOString() } : null,
    imageUrls: p.imageUrls ?? [],
    tags: p.tags ?? [],
    createdAt: p.createdAt.toISOString(),
  };
}

async function enrichOrder(o: typeof shopOrdersTable.$inferSelect) {
  const [product] = await db.select().from(shopProductsTable).where(eq(shopProductsTable.id, o.productId));
  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, o.buyerId));
  return {
    ...o,
    totalAmount: Number(o.totalAmount),
    product: product ? { ...product, price: Number(product.price), rating: product.rating ? Number(product.rating) : null, imageUrls: product.imageUrls ?? [], tags: product.tags ?? [], createdAt: product.createdAt.toISOString() } : null,
    buyer: buyer ? { ...buyer, createdAt: buyer.createdAt.toISOString() } : null,
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  };
}

// GET /shop/products
router.get("/shop/products", async (req, res) => {
  try {
    const query = ListShopProductsQueryParams.parse(req.query);
    let q = db.select().from(shopProductsTable).where(eq(shopProductsTable.isActive, true)).$dynamic();
    if (query.sellerId) q = q.where(eq(shopProductsTable.sellerId, query.sellerId));
    if (query.category) q = q.where(eq(shopProductsTable.category, query.category));
    if (query.q) q = q.where(ilike(shopProductsTable.title, `%${query.q}%`));
    const products = await q.orderBy(desc(shopProductsTable.salesCount)).limit(query.limit ?? 20).offset(query.offset ?? 0);
    res.json(await Promise.all(products.map(enrichProduct)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /shop/products
router.post("/shop/products", async (req, res) => {
  try {
    const body = CreateShopProductBody.parse(req.body);
    const [product] = await db.insert(shopProductsTable).values({
      sellerId: body.sellerId,
      title: body.title,
      description: body.description ?? null,
      price: String(body.price),
      stock: body.stock,
      category: body.category,
      imageUrl: body.imageUrl ?? null,
      imageUrls: body.imageUrls ?? [],
      tags: body.tags ?? [],
    }).returning();
    res.status(201).json(await enrichProduct(product));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /shop/trending
router.get("/shop/trending", async (req, res) => {
  try {
    const query = GetTrendingShopProductsQueryParams.parse(req.query);
    const products = await db.select().from(shopProductsTable)
      .where(eq(shopProductsTable.isActive, true))
      .orderBy(desc(shopProductsTable.salesCount))
      .limit(query.limit ?? 12);
    res.json(await Promise.all(products.map(enrichProduct)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /shop/products/:id
router.get("/shop/products/:id", async (req, res) => {
  try {
    const { id } = GetShopProductParams.parse({ id: Number(req.params.id) });
    const [product] = await db.select().from(shopProductsTable).where(eq(shopProductsTable.id, id));
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(await enrichProduct(product));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /shop/products/:id
router.patch("/shop/products/:id", async (req, res) => {
  try {
    const { id } = UpdateShopProductParams.parse({ id: Number(req.params.id) });
    const body = UpdateShopProductBody.parse(req.body);
    const update: Partial<typeof shopProductsTable.$inferInsert> = {};
    if (body.title) update.title = body.title;
    if (body.description) update.description = body.description;
    if (body.price !== undefined) update.price = String(body.price);
    if (body.stock !== undefined) update.stock = body.stock;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    const [product] = await db.update(shopProductsTable).set(update).where(eq(shopProductsTable.id, id)).returning();
    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(await enrichProduct(product));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// DELETE /shop/products/:id
router.delete("/shop/products/:id", async (req, res) => {
  try {
    const { id } = DeleteShopProductParams.parse({ id: Number(req.params.id) });
    await db.delete(shopProductsTable).where(eq(shopProductsTable.id, id));
    res.status(204).send();
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// GET /shop/orders
router.get("/shop/orders", async (req, res) => {
  try {
    const query = ListShopOrdersQueryParams.parse(req.query);
    let q = db.select().from(shopOrdersTable).$dynamic();
    if (query.buyerId) q = q.where(eq(shopOrdersTable.buyerId, query.buyerId));
    if (query.sellerId) q = q.where(eq(shopOrdersTable.sellerId, query.sellerId));
    if (query.status) q = q.where(eq(shopOrdersTable.status, query.status as "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded"));
    const orders = await q.orderBy(desc(shopOrdersTable.createdAt));
    res.json(await Promise.all(orders.map(enrichOrder)));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// POST /shop/orders
router.post("/shop/orders", async (req, res) => {
  try {
    const body = CreateShopOrderBody.parse(req.body);
    const [product] = await db.select().from(shopProductsTable).where(eq(shopProductsTable.id, body.productId));
    if (!product) return res.status(404).json({ error: "Product not found" });
    const totalAmount = Number(product.price) * body.quantity;
    const [order] = await db.insert(shopOrdersTable).values({
      productId: body.productId,
      buyerId: body.buyerId,
      sellerId: product.sellerId,
      quantity: body.quantity,
      totalAmount: String(totalAmount),
      shippingAddress: body.shippingAddress,
      status: "pending",
    }).returning();
    await db.update(shopProductsTable).set({
      salesCount: sql`${shopProductsTable.salesCount} + ${body.quantity}`,
      stock: sql`GREATEST(${shopProductsTable.stock} - ${body.quantity}, 0)`,
    }).where(eq(shopProductsTable.id, body.productId));
    res.status(201).json(await enrichOrder(order));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

// PATCH /shop/orders/:id
router.patch("/shop/orders/:id", async (req, res) => {
  try {
    const { id } = UpdateShopOrderParams.parse({ id: Number(req.params.id) });
    const body = UpdateShopOrderBody.parse(req.body);
    const [order] = await db.update(shopOrdersTable).set({
      status: body.status as "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded",
      trackingNumber: body.trackingNumber ?? undefined,
      updatedAt: new Date(),
    }).where(eq(shopOrdersTable.id, id)).returning();
    if (!order) return res.status(404).json({ error: "Order not found" });
    res.json(await enrichOrder(order));
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

export default router;
