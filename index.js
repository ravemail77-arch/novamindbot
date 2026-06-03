import axios from "axios";
import { Telegraf } from "telegraf";

// =========================
// 🔐 CONFIG
// =========================
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const ADMIN_ID = 7323613661;

const bot = new Telegraf(BOT_TOKEN);

// =========================
// 🧠 MEMORY
// =========================
const db = {
  users: new Set(),
  banned: new Set(),
  mode: new Map(),
  history: new Map(),
  flags: new Map(),
  replyTo: new Map()
};

// =========================
// 🚫 CHECK BANNED
// =========================
function isBanned(id) {
  return db.banned.has(id);
}

// =========================
// 🔘 CALLBACK HANDLERS (same logic)
// =========================
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const user_id = ctx.from.id;

  if (isBanned(user_id)) return;

  // ⚡ MODES
  if (["fast", "smart", "auto"].includes(data)) {
    db.mode.set(user_id, data);

    return ctx.reply(`⚙️ Mode: ${data.toUpperCase()}`);
  }

  // =========================
  // 🛠 ADMIN MENU
  // =========================
  if (user_id === ADMIN_ID) {

    if (data === "admin_menu") {
      return ctx.reply("🛠 Control Panel:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "👤 Users", callback_data: "menu_users" }],
            [{ text: "📣 Broadcast", callback_data: "admin_broadcast" }],
            [{ text: "🚫 Ban", callback_data: "admin_ban" }],
            [{ text: "✅ Unban", callback_data: "admin_unban" }],
            [{ text: "⚡ Modes", callback_data: "admin_modes" }]
          ]
        }
      });
    }

    if (data === "menu_users") {
      return ctx.reply("👤 USERS:\n\n" + [...db.users].join("\n") || "No users");
    }

    if (data === "admin_broadcast") {
      db.flags.set(ADMIN_ID, "broadcast");
      return ctx.reply("📣 Send broadcast message:");
    }

    if (data === "admin_ban") {
      db.flags.set(ADMIN_ID, "ban");
      return ctx.reply("🚫 Send user ID to ban:");
    }

    if (data === "admin_unban") {
      db.flags.set(ADMIN_ID, "unban");
      return ctx.reply("✅ Send user ID to unban:");
    }

    if (data === "admin_modes") {
      return ctx.reply("⚡ Modes:", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚡ Fast", callback_data: "fast" }],
            [{ text: "🧠 Smart", callback_data: "smart" }],
            [{ text: "🤖 Auto", callback_data: "auto" }],
            [{ text: "🔙 Back", callback_data: "admin_menu" }]
          ]
        }
      });
    }

    if (data.startsWith("reply_")) {
      const target = data.split("_")[1];
      db.replyTo.set(ADMIN_ID, target);
      return ctx.reply(`✍️ Reply to: ${target}`);
    }
  }

  await ctx.answerCbQuery();
});

// =========================
// 🟢 START
// =========================
bot.start(async (ctx) => {
  const user_id = ctx.from.id;

  if (isBanned(user_id)) return;

  db.users.add(user_id);

  return ctx.reply("👋 Welcome to NovaMind ⚡", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⚡ Fast", callback_data: "fast" },
          { text: "🧠 Smart", callback_data: "smart" },
          { text: "🤖 Auto", callback_data: "auto" }
        ],
        [
          { text: "🛠 Control Panel", callback_data: "admin_menu" }
        ]
      ]
    }
  });
});

// =========================
// 💬 TEXT HANDLER
// =========================
bot.on("text", async (ctx) => {
  const user_id = ctx.from.id;
  const text = ctx.message.text;

  if (isBanned(user_id)) return;

  db.users.add(user_id);

  const flag = db.flags.get(user_id);

  // =========================
  // 🛠 ADMIN FLAGS
  // =========================
  if (user_id === ADMIN_ID && flag) {

    if (flag === "broadcast") {
      db.flags.delete(user_id);

      for (let id of db.users) {
        try {
          await ctx.telegram.sendMessage(id, `📢 Broadcast:\n\n${text}`);
        } catch {}
      }
    }

    if (flag === "ban") {
      db.flags.delete(user_id);
      db.banned.add(Number(text));
    }

    if (flag === "unban") {
      db.flags.delete(user_id);
      db.banned.delete(Number(text));
    }

    const replyTarget = db.replyTo.get(user_id);
    if (replyTarget) {
      db.replyTo.delete(user_id);
      await ctx.telegram.sendMessage(Number(replyTarget), `📩 Admin:\n\n${text}`);
    }

    return;
  }

  // =========================
  // ⚡ MODE SYSTEM
  // =========================
  let mode = db.mode.get(user_id) || "auto";

  let model = "meta/llama-3.1-70b-instruct";
  let max_tokens = 450;

  if (mode === "fast") {
    model = "meta/llama-3.1-8b-instruct";
    max_tokens = 300;
  }

  if (mode === "smart") {
    model = "meta/llama-3.1-70b-instruct";
    max_tokens = 850;
  }

  try {
    const response = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model,
        temperature: 0.6,
        max_tokens,
        messages: [
          { role: "system", content: "You are NovaMind AI assistant." },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = response.data.choices[0].message.content;
    await ctx.reply(reply);

  } catch {
    await ctx.reply("⚠️ AI unavailable");
  }
});

// =========================
// 🚀 START BOT (POLLING)
// =========================
bot.launch();

console.log("🚀 Bot running in polling mode");
