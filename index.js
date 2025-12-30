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

// ================= VOICE =================
let connection;
let joining = false;

const player = createAudioPlayer({
  behaviors: {
    noSubscriber: NoSubscriberBehavior.Pause,
  },
});

// 20ms silence @48kHz stereo
const silence = Buffer.alloc(3840);
const silent = () =>
  createAudioResource(silence, {
    inputType: 'raw',
    inlineVolume: true,
  });

player.on(AudioPlayerStatus.Idle, () => player.play(silent()));
player.on('error', () => player.play(silent()));

async function joinVoice() {
  if (joining) return;
  joining = true;

  try {
    const channel = await client.channels.fetch(VOICE_CHANNEL_ID);
    if (!channel?.isVoiceBased()) throw 'Invalid channel';

    if (connection) connection.destroy();

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);

    connection.subscribe(player);
    player.play(silent());

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await entersState(connection, VoiceConnectionStatus.Connecting, 5_000);
      } catch {
        setTimeout(joinVoice, 3000);
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      setTimeout(joinVoice, 3000);
    });

    console.log('🔊 Treo voice');

  } catch {
    setTimeout(joinVoice, 5000);
  } finally {
    joining = false;
  }
}

// ================= READY =================
client.once('ready', () => {
  console.log('✅ Bot ready');
  joinVoice();

  setInterval(() => {
    if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
      joinVoice();
    }
  }, 60_000);
});

// ================= ANTI CRASH =================
process.on('unhandledRejection', () => {});
process.on('uncaughtException', () => {});

// ================= LOGIN =================
client.login(TOKEN);
