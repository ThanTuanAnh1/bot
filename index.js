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
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

// ================= DISCORD CLIENT =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ================= STATE =================
let connection;
let joining = false;

// ================= UPTIME =================
const startTime = Date.now();
const uptime = () => {
  const s = Math.floor((Date.now() - startTime) / 1000);
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
};

// ================= SLASH COMMAND =================
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot status'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ================= AUDIO PLAYER (SILENT LOOP) =================
const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Play },
});

// 20ms PCM silence @48kHz stereo
const silence = Buffer.alloc(3840);
const silentResource = () =>
  createAudioResource(silence, { inputType: 'raw' });

// Loop silence forever
player.on(AudioPlayerStatus.Idle, () => {
  player.play(silentResource());
});

player.on('error', err => {
  console.error('🎧 Audio error:', err);
  player.play(silentResource());
});

// ================= JOIN VOICE =================
async function joinVoice() {
  if (joining) return;
  joining = true;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel || !channel.isVoiceBased()) {
      throw new Error('VOICE_CHANNEL_ID không hợp lệ');
    }

    if (connection) connection.destroy();

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    connection.subscribe(player);
    player.play(silentResource());

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await entersState(connection, VoiceConnectionStatus.Connecting, 5000);
      } catch {
        setTimeout(joinVoice, 3000);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      setTimeout(joinVoice, 3000);
    });

    console.log(`🔊 Bot treo voice tại: ${channel.name}`);
  } catch (err) {
    console.error('❌ Join voice failed:', err.message);
    setTimeout(joinVoice, 5000);
  } finally {
    joining = false;
  }
}

// ================= READY =================
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  await rest.put(
    Routes.applicationCommands(CLIENT_ID),
    { body: commands }
  );

  console.log('✅ Slash command registered');

  joinVoice();

  // Check mỗi 60s
  setInterval(() => {
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      joinVoice();
    }
  }, 60000);
});

// ================= COMMAND HANDLER =================
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🤖 Bot Status')
          .setDescription(
            `Ping: ${client.ws.ping}ms\nUptime: ${uptime()}`
          )
          .setColor(0xFBBCFF),
      ],
    });
  }
});

// ================= BỊ KICK VOICE → VÀO LẠI =================
client.on('voiceStateUpdate', (oldState, newState) => {
  if (
    oldState.member?.id === client.user.id &&
    oldState.channelId &&
    !newState.channelId
  ) {
    console.log('🚪 Bot bị kick voice → rejoin');
    setTimeout(joinVoice, 2000);
  }
});

// ================= ANTI CRASH =================
process.on('unhandledRejection', err => {
  console.error('❗ UnhandledRejection:', err);
});
process.on('uncaughtException', err => {
  console.error('❗ UncaughtException:', err);
});

// ================= LOGIN =================
client.login(TOKEN);
