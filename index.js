import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

// =========================
// 🔐 CONFIG
// =========================
const BOT_TOKEN = process.env.TELEGRAM_TOKEN;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY;
const ADMIN_ID = 7323613661; // 🔴 بدليه

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

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
// 📡 WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {

    const update = req.body;

    const message = update.message;
    const callback = update.callback_query;

    // =========================
    // 🔘 CALLBACK HANDLER
    // =========================
    if (callback) {
      const data = callback.data;
      const user_id = callback.from.id;

      // ⚡ MODES
      if (["fast", "smart", "auto"].includes(data)) {
        db.mode.set(user_id, data);

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: user_id,
          text: `⚙️ Mode: ${data.toUpperCase()}`
        });

        return res.sendStatus(200);
      }

      // =========================
      // 🛠 ADMIN MENU
      // =========================
      if (user_id === ADMIN_ID) {

        // OPEN CONTROL PANEL
        if (data === "admin_menu") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "🛠 Control Panel:",
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

        // USERS PAGE
        if (data === "menu_users") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "👤 USERS:\n\n" + [...db.users].join("\n") || "No users",
            reply_markup: {
              inline_keyboard: [
                [{ text: "🔙 Back", callback_data: "admin_menu" }]
              ]
            }
          });
        }

        // BROADCAST
        if (data === "admin_broadcast") {
          db.flags.set(ADMIN_ID, "broadcast");
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "📣 Send broadcast message:"
          });
        }

        // BAN
        if (data === "admin_ban") {
          db.flags.set(ADMIN_ID, "ban");
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "🚫 Send user ID to ban:"
          });
        }

        // UNBAN
        if (data === "admin_unban") {
          db.flags.set(ADMIN_ID, "unban");
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "✅ Send user ID to unban:"
          });
        }

        // MODES
        if (data === "admin_modes") {
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: "⚡ Modes:",
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

        // REPLY SYSTEM
        if (data.startsWith("reply_")) {
          const target = data.split("_")[1];
          db.replyTo.set(ADMIN_ID, target);

          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: ADMIN_ID,
            text: `✍️ Reply to: ${target}`
          });
        }
      }

      return res.sendStatus(200);
    }

    // =========================
    // 💬 MESSAGE HANDLER
    // =========================
    if (!message) return res.sendStatus(200);

    const chat_id = message.chat.id;
    const user_id = message.from.id;
    const text = (message.text || "").toString();
    const photo = message.photo;

    if (isBanned(user_id)) return res.sendStatus(200);

    db.users.add(user_id);

    // =========================
    // 🟢 START
    // =========================
    if (text === "/start") {
      await axios.post(`${TELEGRAM_API}/sendMessage`, {
        chat_id,
        text: "👋 Welcome to NovaMind ⚡",
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

      return res.sendStatus(200);
    }

    // =========================
    // 🛠 ADMIN FLAGS
    // =========================
    const flag = db.flags.get(user_id);

    if (user_id === ADMIN_ID && flag) {

      if (flag === "broadcast") {
        db.flags.delete(user_id);

        for (let id of db.users) {
          try {
            await axios.post(`${TELEGRAM_API}/sendMessage`, {
              chat_id: id,
              text: `📢 Broadcast:\n\n${text}`
            });
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

        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: Number(replyTarget),
          text: `📩 Admin:\n\n${text}`
        });
      }

      return res.sendStatus(200);
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

    if (mode === "auto") {
      model = text.length > 60
        ? "meta/llama-3.1-70b-instruct"
        : "meta/llama-3.1-8b-instruct";
    }

    // =========================
    // 🤖 AI REQUEST
    // =========================
    let reply = "⚠️ Error";

    try {
      const response = await axios.post(
        "https://integrate.api.nvidia.com/v1/chat/completions",
        {
          model,
          temperature: 0.6,
          max_tokens,
          messages: [
            {
              role: "system",
              content: "You are NovaMind AI assistant."
            },
            {
              role: "user",
              content: text || "..."
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${NVIDIA_KEY}`,
            "Content-Type": "application/json"
          },
          timeout: 25000
        }
      );

      reply = response.data.choices[0].message.content;

    } catch {
      reply = "⚠️ AI unavailable";
    }

    await axios.post(`${TELEGRAM_API}/sendMessage`, {
      chat_id,
      text: reply
    });

    return res.sendStatus(200);

  } catch (err) {
    console.log(err.message);
    return res.sendStatus(200);
  }
});

// =========================
// 🚀 SERVER
// =========================
app.listen(3000, () => {
  console.log("🚀 Bot running on port 3000");
});
