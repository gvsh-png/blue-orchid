import { index, integer, primaryKey, sqliteTable, text } from "void/schema-d1";

/** Times are epoch milliseconds in UTC. */
export const shows = sqliteTable("shows", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  imageUrl: text("image_url"),
  episodes: integer("episodes"),
});

export const releases = sqliteTable(
  "releases",
  {
    key: text("key").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    episode: integer("episode").notNull(),
    kind: text("kind").notNull(),
    region: text("region").notNull(),
    airsAt: integer("airs_at").notNull(),
    /** How many times this release has changed. An update's id carries the revision it created. */
    revision: integer("revision").notNull().default(0),
  },
  (table) => [index("releases_airs_at").on(table.airsAt)],
);

/** `change` is the domain Change encoded as JSON by its Schema. */
export const updates = sqliteTable(
  "updates",
  {
    id: text("id").primaryKey(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    detectedAt: integer("detected_at").notNull(),
    change: text("change").notNull(),
  },
  (table) => [index("updates_show_detected").on(table.showId, table.detectedAt)],
);

export const follows = sqliteTable(
  "follows",
  {
    platform: text("platform").notNull(),
    userId: text("user_id").notNull(),
    showId: text("show_id")
      .notNull()
      .references(() => shows.id),
    since: integer("since").notNull(),
  },
  (table) => [primaryKey({ columns: [table.platform, table.userId, table.showId] })],
);

/** One row per update and follower once a run claims it. `status` is claimed, sent or failed. */
export const deliveries = sqliteTable(
  "deliveries",
  {
    updateId: text("update_id")
      .notNull()
      .references(() => updates.id),
    platform: text("platform").notNull(),
    userId: text("user_id").notNull(),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull(),
    claimedAt: integer("claimed_at").notNull(),
    deliveredAt: integer("delivered_at"),
  },
  (table) => [primaryKey({ columns: [table.updateId, table.platform, table.userId] })],
);
