import { relations } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Data sources (government / wholesale) that prices come from.
 * slug values: "dit", "oae", "taladthai", "simummuang", "eppo"
 */
export const sources = pgTable("sources", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  nameTh: varchar("name_th", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  url: varchar("url", { length: 255 }).notNull(),
  /** "government" | "wholesale" */
  type: varchar("type", { length: 20 }).notNull(),
  /** "retail" | "wholesale" — UI toggle filters comparisons by this field */
  priceType: varchar("price_type", { length: 20 }).notNull().default("retail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Product categories shown on the home page grid.
 * slug values: "meat", "vegetables", "rice", "eggs", "oil", "seasoning", "fuel", "fruit"
 */
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  nameTh: varchar("name_th", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
  /** Emoji icon rendered on the category card */
  icon: varchar("icon", { length: 50 }),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * Canonical products. Thai name is primary; English name is a subtitle where available.
 */
export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  nameTh: varchar("name_th", { length: 200 }).notNull(),
  nameEn: varchar("name_en", { length: 200 }),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * All 77 Thai provinces. code "90" = Songkhla (default province).
 */
export const provinces = pgTable("provinces", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 10 }).notNull().unique(),
  nameTh: varchar("name_th", { length: 100 }).notNull(),
  nameEn: varchar("name_en", { length: 100 }).notNull(),
});

/**
 * A single reported price for a product from a source.
 * province_id is NULL for national/wholesale prices.
 * UNIQUE (product_id, source_id, province_id, source_date) with NULLS NOT DISTINCT
 * prevents duplicate rows for the same product/source/province/date.
 */
export const prices = pgTable(
  "prices",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    provinceId: integer("province_id").references(() => provinces.id),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    unit: varchar("unit", { length: 50 }).notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull(),
    /** The date the source reports (may differ from scrape date) */
    sourceDate: date("source_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("prices_product_source_province_date_idx").on(
      table.productId,
      table.sourceId,
      table.provinceId,
      table.sourceDate,
    ),
    // Speed up "prices for product X" lookups on the product detail page.
    index("prices_product_id_idx").on(table.productId),
  ],
);

/**
 * Maps a canonical product to the exact raw name (and optional code) a source uses.
 * e.g. our "pork-belly" maps to DIT's "หมูสามชั้น (สุกร)".
 */
export const productSourceMappings = pgTable("product_source_mappings", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  sourceId: integer("source_id")
    .notNull()
    .references(() => sources.id),
  sourceProductName: varchar("source_product_name", { length: 300 }).notNull(),
  sourceProductCode: varchar("source_product_code", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- relations -----------------------------------------------------------

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  prices: many(prices),
  sourceMappings: many(productSourceMappings),
}));

export const sourcesRelations = relations(sources, ({ many }) => ({
  prices: many(prices),
  sourceMappings: many(productSourceMappings),
}));

export const provincesRelations = relations(provinces, ({ many }) => ({
  prices: many(prices),
}));

export const pricesRelations = relations(prices, ({ one }) => ({
  product: one(products, {
    fields: [prices.productId],
    references: [products.id],
  }),
  source: one(sources, {
    fields: [prices.sourceId],
    references: [sources.id],
  }),
  province: one(provinces, {
    fields: [prices.provinceId],
    references: [provinces.id],
  }),
}));

export const productSourceMappingsRelations = relations(productSourceMappings, ({ one }) => ({
  product: one(products, {
    fields: [productSourceMappings.productId],
    references: [products.id],
  }),
  source: one(sources, {
    fields: [productSourceMappings.sourceId],
    references: [sources.id],
  }),
}));