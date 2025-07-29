const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'ping') {
    await interaction.reply('Pong!');
  }
});

client.login(process.env.TOKEN);

// Register slash command
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong!')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('Slash command registered!');
  } catch (error) {
    console.error(error);
  }
})();

const express = require('express');
const cors = require("cors");
const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Bot is running!");
});

app.get("/status", (req, res) => {
  if (!client || !client.isReady()) {
    return res.status(503).json({ status: "offline" });
  }

  const statusData = {
    status: "online",
    ping: client.ws.ping,
    uptime: formatUptime(Date.now() - botStartTime),
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
    updated: new Date().toISOString()
  };

  res.json(statusData);
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});
