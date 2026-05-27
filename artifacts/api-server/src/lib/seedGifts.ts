import { db, giftsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

type Seed = {
  name: string;
  emoji: string;
  price: string;
  category: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  description: string;
};

const PREMIUM_GIFTS: Seed[] = [
  { name: "Thor's Hammer", emoji: "🔨", price: "199.99", category: "legendary", rarity: "legendary", description: "Mjölnir crashes down with thunder & lightning — only the worthy can wield it" },
  { name: "Spartan Warlord", emoji: "🛡️", price: "299.99", category: "legendary", rarity: "legendary", description: "300 Spartans charge the screen — THIS IS CLIPPZI!" },
  { name: "King of Atlanta Crown", emoji: "👑", price: "499.99", category: "legendary", rarity: "legendary", description: "A diamond-encrusted crown rains gold across the stream" },
  { name: "Queen's Tiara", emoji: "💎", price: "499.99", category: "legendary", rarity: "legendary", description: "Coronation of royalty — sapphires & roses fill the room" },
  { name: "Phoenix Rebirth", emoji: "🔥", price: "249.99", category: "legendary", rarity: "legendary", description: "A 3D phoenix bursts from ashes — full-screen fire animation" },
  { name: "Dragon Strike", emoji: "🐉", price: "399.99", category: "legendary", rarity: "legendary", description: "An ancient dragon breathes fire across the entire stream" },
  { name: "Galactic Throne", emoji: "🪐", price: "999.99", category: "legendary", rarity: "legendary", description: "Float through the cosmos on a diamond throne — the ultimate flex" },
  { name: "Excalibur", emoji: "⚔️", price: "349.99", category: "legendary", rarity: "legendary", description: "The sword in the stone — pulled only by the chosen one" },
  { name: "Pharaoh's Sarcophagus", emoji: "🏺", price: "299.99", category: "legendary", rarity: "legendary", description: "Golden Egyptian relics rise with hieroglyphics" },
  { name: "Lamborghini Drop", emoji: "🏎️", price: "599.99", category: "legendary", rarity: "legendary", description: "A neon Lambo speeds across the screen with smoke trails" },
  { name: "Private Jet", emoji: "✈️", price: "799.99", category: "legendary", rarity: "legendary", description: "Your own jet flies in dropping confetti and cash" },
  { name: "Stack of Cash", emoji: "💰", price: "150.00", category: "legendary", rarity: "legendary", description: "Bands of $100 bills rain from the top of the screen" },
  { name: "Diamond Crown", emoji: "💠", price: "49.99", category: "epic", rarity: "epic", description: "Crown them king — refracting diamond animation" },
  { name: "Warrior Helmet", emoji: "🪖", price: "29.99", category: "epic", rarity: "epic", description: "Spartan-style helmet with red plume" },
  { name: "Golden Lion", emoji: "🦁", price: "39.99", category: "epic", rarity: "epic", description: "A gold lion roars across the stream" },
  { name: "Ice Castle", emoji: "🏰", price: "44.99", category: "epic", rarity: "epic", description: "Crystal palace rises with snowfall" },
  { name: "Volcano Erupts", emoji: "🌋", price: "34.99", category: "epic", rarity: "epic", description: "Molten lava bursts across the screen" },
  { name: "Lightning Strike", emoji: "⚡", price: "19.99", category: "epic", rarity: "epic", description: "Zeus's bolt cracks the screen" },
  { name: "Royal Carriage", emoji: "🐎", price: "39.99", category: "epic", rarity: "epic", description: "A gilded carriage rolls in with white horses" },
  { name: "Knight on Horseback", emoji: "🐴", price: "29.99", category: "epic", rarity: "epic", description: "A jousting knight charges across the stream" },
  { name: "Treasure Chest", emoji: "🪙", price: "24.99", category: "epic", rarity: "epic", description: "Pirate's chest bursts open with gold coins" },
  { name: "Samurai Katana", emoji: "🗡️", price: "21.99", category: "epic", rarity: "epic", description: "Katana slashes with cherry blossoms" },
  { name: "Eagle of Liberty", emoji: "🦅", price: "29.99", category: "epic", rarity: "epic", description: "A bald eagle soars with stars & stripes" },
  { name: "Viking Longship", emoji: "🛶", price: "44.99", category: "epic", rarity: "epic", description: "Sails into battle with horn blasts" },
];

export async function seedPremiumGifts(): Promise<void> {
  try {
    let inserted = 0;
    for (const g of PREMIUM_GIFTS) {
      const [existing] = await db.select({ id: giftsTable.id }).from(giftsTable).where(eq(giftsTable.name, g.name)).limit(1);
      if (existing) continue;
      await db.insert(giftsTable).values(g);
      inserted++;
    }
    if (inserted > 0) logger.info({ inserted }, "Seeded premium gifts");
  } catch (err) {
    logger.warn({ err }, "Failed to seed premium gifts (non-fatal)");
  }
}
