// ==== IMPORT LIBRARIES ====
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require('@discordjs/voice');

const play = require('play-dl');
const express = require('express');
const cors = require('cors');

// ==== PLAY-DL TOKEN FIX (CAPTCHA ERROR) ====
(async () => {
  try {
    await play.setToken({
      youtube: { cookie: process.env.YT_COOKIE }
    });
    console.log("👍 play-dl cookie loaded");
  } catch (e) {
    console.log("⚠️ No YouTube cookie provided (may cause CAPTCHA)");
  }
})();

// ==== DISCORD CLIENT ====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = createAudioPlayer();
let connection = null;


// ==== FORMAT UPTIME FUNCTION ====
function formatUptime(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

// ==== SLASH COMMANDS ====
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube')
    .addStringOption(option =>
      option.setName('url').setDescription('YouTube URL').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music')
].map(cmd => cmd.toJSON());


// ==== READY EVENT (FIXED) ====
client.on('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log("Registering slash commands...");

  const rest = new (require("@discordjs/rest").REST)({ version: '10' })
      .setToken(process.env.TOKEN);

  try {
    await rest.put(
      require("discord-api-types/v10").Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log("✅ Slash commands registered!");
  } catch (err) {
    console.error("❌ Command registration failed:", err);
  }
});


// ==== SLASH COMMAND HANDLER ====
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = interaction.commandName;

  if (cmd === 'ping') {
    const embed = new EmbedBuilder()
      .setTitle("🏓 Pong!")
      .setColor(0xFBBCFF)
      .setDescription(`Ping: **${client.ws.ping}ms**`);

    return interaction.reply({ embeds: [embed] });
  }

  if (cmd === 'play') {
    const url = interaction.options.getString("url");
    const vc = interaction.member.voice.channel;

    if (!vc)
      return interaction.reply("⚠️ Vào voice channel trước đã!");

    try {
      const stream = await play.stream(url);
      const resource = createAudioResource(stream.stream, { inputType: stream.type });

      connection = joinVoiceChannel({
        channelId: vc.id,
        guildId: vc.guild.id,
        adapterCreator: vc.guild.voiceAdapterCreator
      });

      player.play(resource);
      connection.subscribe(player);

      return interaction.reply(`🎶 Đang phát: **${url}**`);
    } catch (err) {
      console.error(err);
      return interaction.reply("❌ Không thể phát nhạc (play-dl error).");
    }
  }

  if (cmd === 'stop') {
    try {
      player.stop();
      if (connection) {
        connection.destroy();
        connection = null;
      }
      return interaction.reply("⛔ Đã dừng nhạc & rời kênh voice!");
    } catch (e) {
      console.error(e);
      return interaction.reply("⚠️ Không thể dừng nhạc.");
    }
  }
});


// ==== EXPRESS STATUS API ====
const app = express();
app.use(cors());

app.get("/", (req, res) => res.send("🤖 Bot is running!"));

app.listen(process.env.PORT || 3000, () =>
  console.log(`🌐 API running on port ${process.env.PORT || 3000}`)
);


// ==== START BOT ====
client.login(process.env.TOKEN);
