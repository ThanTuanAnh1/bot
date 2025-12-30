const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');

const play = require('play-dl');
const player = createAudioPlayer();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder
} = require('discord.js');

const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Render cũng có thể dùng process.env trực tiếp

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

let voiceConnection = null;

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
});

// ================= UPTIME =================
const botStartTime = Date.now();
function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube')
    .addStringOption(o =>
      o.setName('url').setDescription('YouTube URL').setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music')
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ================= AUTO JOIN + AUTO REJOIN =================
async function joinVoice() {
  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);

    if (!channel || !channel.isVoiceBased()) {
      return console.log('❌ Voice channel không hợp lệ');
    }

    voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    console.log(`🔊 Joined voice: ${channel.name}`);

    // ==== AUTO REJOIN HANDLER ====
    voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log('⚠️ Voice disconnected, rejoining...');

      try {
        await Promise.race([
          entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        setTimeout(joinVoice, 3000);
      }
    });

  } catch (err) {
    console.error('❌ Join voice error:', err);
  }
}

// ================= READY =================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log('✅ Slash commands registered');

  if (VOICE_CHANNEL_ID) joinVoice();

  setInterval(() => {
    console.log(`📡 Ping: ${client.ws.ping}ms`);
  }, 30000);
});

// ================= COMMAND HANDLER =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'ping') {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏓 Pong')
            .setDescription(
              `Ping: ${client.ws.ping}ms\nUptime: ${formatUptime(Date.now() - botStartTime)}`
            )
            .setColor(0xFBBCFF)
        ]
      });
    }

    if (interaction.commandName === 'play') {
      const url = interaction.options.getString('url');
      const vc = interaction.member.voice.channel;

      if (!vc) return interaction.reply('⚠️ Join voice first');

      const stream = await play.stream(url);
      const resource = createAudioResource(stream.stream, { inputType: stream.type });

      if (!voiceConnection)
        voiceConnection = joinVoiceChannel({
          channelId: vc.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });

      player.play(resource);
      voiceConnection.subscribe(player);

      await interaction.reply(`🎶 Playing: ${url}`);
    }

    if (interaction.commandName === 'stop') {
      player.stop();
      await interaction.reply('⛔ Stopped');
    }

  } catch (err) {
    console.error(err);
    interaction.reply('❌ Error');
  }
});

// ================= EXPRESS =================
const app = express();
app.use(cors());

app.get('/', (_, res) => res.send('🤖 Bot running'));
app.get('/status', (_, res) => {
  res.json({
    status: client.isReady() ? 'online' : 'offline',
    ping: client.ws.ping,
    uptime: formatUptime(Date.now() - botStartTime),
  });
});

app.listen(PORT, () =>
  console.log(`🌐 Express server running on port ${PORT}`)
);

// ================= LOGIN =================
client.login(TOKEN);
