const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');
const player = createAudioPlayer();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType,
  EmbedBuilder
} = require('discord.js');
const express = require('express');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const botStartTime = Date.now();

function formatUptime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  return `${h}h ${m}m ${s}s`;
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot latency'),
  new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play music from YouTube')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('YouTube URL')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop the music')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  });

  try {
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands
    });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }

  setInterval(() => {
    console.log(`✅ Ping: ${client.ws.ping.toFixed(2)}ms`);
  }, 30000);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    if (commandName === 'ping') {
      const ping = client.ws.ping;
      const uptime = formatUptime(Date.now() - botStartTime);

      const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(0xFBBCFF)
        .setDescription(`**Ping:** ${ping.toFixed(2)}ms\n**Uptime:** ${uptime}`)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    }
    
    if (commandName === 'play') {
      const url = interaction.options.getString('url');
      const voiceChannel = interaction.member.voice.channel;
  
      if (!voiceChannel)
        return interaction.reply('⚠️ You must enter the voice channel first!');
  
      try {
        const stream = await play.stream(url);
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
  
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator,
        });
  
        player.play(resource);
        connection.subscribe(player);
  
        await interaction.reply(`🎶 Now playing: **${url}**`);
      } catch (err) {
        console.error(err);
        await interaction.reply('❌ Cannot play music.');
      }
    }
  
    if (commandName === 'stop') {
      try {
        player.stop();
        await interaction.reply('⛔ Music stopped.');
      } catch (err) {
        console.error(err);
        await interaction.reply('⚠️ Cant stop the music.');
      }
    }

  } catch (err) {
    console.error('❌ Interaction error:', err);
    await interaction.reply({ content: '⚠️ Something went wrong.', ephemeral: true });
  }
});
    
// ==== EXPRESS API ====
const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('🤖 Bot is running!');
});

app.get('/status', (req, res) => {
  if (!client || !client.isReady()) {
    return res.status(503).json({ status: 'offline' });
  }

  res.json({
    status: 'online',
    ping: client.ws.ping,
    uptime: formatUptime(Date.now() - botStartTime),
    guilds: client.guilds.cache.size,
    users: client.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0),
    updated: new Date().toISOString()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express server running at http://localhost:${PORT}`);
});

// ==== START BOT ====
if (!process.env.TOKEN || !process.env.CLIENT_ID) {
  console.error('❌ Missing TOKEN or CLIENT_ID in .env');
  process.exit(1);
}

setTimeout(() => {
  console.log('🔑 Logging into Discord...');
  client.login(process.env.TOKEN);
}, 1000);
