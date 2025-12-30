require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
} = require('discord.js');

const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

const express = require('express');
const cors = require('cors');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ================= VOICE STATE =================
let voiceConnection = null;
let reconnecting = false;

// ================= UPTIME =================
const botStartTime = Date.now();
function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
}

// ================= SLASH COMMANDS =================
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ================= JOIN & TREO VOICE =================
async function joinVoice() {
  if (reconnecting) return;
  reconnecting = true;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);

    if (!channel || !channel.isVoiceBased()) {
      console.log('❌ Voice channel không hợp lệ');
      reconnecting = false;
      return;
    }

    if (voiceConnection) {
      try {
        voiceConnection.destroy();
      } catch {}
    }

    voiceConnection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      encryptionMode: 'aead_xchacha20_poly1305_rtpsize',
    });

    console.log(`🔊 Bot treo voice tại: ${channel.name}`);

    voiceConnection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.log('⚠️ Voice disconnected → thử reconnect');

      try {
        await Promise.race([
          entersState(voiceConnection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(voiceConnection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        setTimeout(() => {
          reconnecting = false;
          joinVoice();
        }, 3000);
      }
    });

    voiceConnection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log('💥 Voice destroyed → rejoin');
      setTimeout(() => {
        reconnecting = false;
        joinVoice();
      }, 3000);
    });

    reconnecting = false;

  } catch (err) {
    console.error('❌ Join voice error:', err);
    setTimeout(() => {
      reconnecting = false;
      joinVoice();
    }, 5000);
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

  // Check mỗi phút, lỡ connection chết
  setInterval(() => {
    if (!voiceConnection) joinVoice();
  }, 60_000);
});

// ================= COMMAND HANDLER =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

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
});

// ================= BỊ KICK / MOVE → VÀO LẠI =================
client.on('voiceStateUpdate', (oldState, newState) => {
  if (
    oldState.member?.id === client.user.id &&
    oldState.channelId &&
    !newState.channelId
  ) {
    console.log('🚪 Bot bị kick khỏi voice → vào lại');
    setTimeout(joinVoice, 2000);
  }
});

// ================= EXPRESS (GIỮ APP SỐNG) =================
const app = express();
app.use(cors());

app.get('/', (_, res) => res.send('🤖 Bot treo voice đang chạy'));
app.get('/status', (_, res) => {
  res.json({
    status: client.isReady() ? 'online' : 'offline',
    ping: client.ws.ping,
    uptime: formatUptime(Date.now() - botStartTime),
  });
});

app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
});

// ================= LOGIN =================
client.login(TOKEN);
