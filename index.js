require('dotenv').config();

const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
} = require('@discordjs/voice');

const express = require('express');

// ================= ENV =================
const TOKEN = process.env.TOKEN;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;
const PORT = process.env.PORT || 3000;

// ================= EXPRESS =================
const app = express();
app.get('/', (_, res) => res.send('ok'));
app.listen(PORT);

// ================= DISCORD =================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ================= VOICE STATE =================
let connection = null;
let joining = false;
let retryDelay = 5000; // backoff

// ================= AUDIO (ONE TIME ONLY) =================
const player = createAudioPlayer({
  behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
});

// 20ms PCM silence @48kHz stereo — TẠO 1 LẦN
const silenceBuffer = Buffer.alloc(3840);
const silentResource = createAudioResource(silenceBuffer, {
  inputType: 'raw',
});

player.on(AudioPlayerStatus.Idle, () => {
  // KHÔNG tạo resource mới
  player.play(silentResource);
});

player.on('error', () => {
  player.play(silentResource);
});

// ================= JOIN VOICE =================
async function joinVoice() {
  if (joining) return;
  joining = true;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel?.isVoiceBased()) throw new Error('Invalid channel');

    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
    }

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    connection.subscribe(player);
    player.play(silentResource);

    retryDelay = 5000; // reset backoff
    console.log('🔊 Bot treo voice');

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      console.log('💥 Voice disconnected');
      setTimeout(joinVoice, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000); // max 60s
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      console.log('💥 Voice destroyed');
      setTimeout(joinVoice, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    });

  } catch {
    setTimeout(joinVoice, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  } finally {
    joining = false;
  }
}

// ================= READY =================
client.once('ready', () => {
  console.log('✅ Bot ready');
  joinVoice();

  // Check chậm hơn
  setInterval(() => {
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      joinVoice();
    }
  }, 120_000);
});

// ================= ANTI CRASH =================
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

// ================= LOGIN =================
client.login(TOKEN);
