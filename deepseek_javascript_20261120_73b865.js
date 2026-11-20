const fs = require('fs');
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, PermissionFlagsBits, ChannelType, SlashCommandBuilder,
  REST, Routes, ChannelSelectMenuBuilder, RoleSelectMenuBuilder
} = require('discord.js');

// קורא את הטוקן ממשתנה הסביבה (לא נמצא בקוד!)
const TOKEN = process.env.TOKEN;
if (!TOKEN) {
  console.error('❌ חסר משתנה סביבה TOKEN. הגדר אותו בלוח הבקרה של השרת.');
  process.exit(1);
}

// טוען הגדרות (נוצר אוטומטית אחרי /setup)
const CONFIG_FILE = './config.json';
let config = fs.existsSync(CONFIG_FILE)
  ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  : {};

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', () => console.log(`✅ מחובר בתור ${client.user.tag}`));

// ============ 1) ברכה ============
client.on('guildMemberAdd', async (member) => {
  if (!config.welcomeChannelId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setTitle('ברוך הבא! 🎉')
    .setDescription(`ברוך הבא ${member} לשרת!\nקרא את החוקים ותהנה 😊`)
    .setColor('#5865F2')
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();
  channel.send({ embeds: [embed] });
});

// ============ 2) אינטראקציות ============
client.on('interactionCreate', async (interaction) => {

  // ---------- /setup ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    const embed = new EmbedBuilder()
      .setTitle('⚙️ הגדרת הבוט')
      .setDescription('בחר את הערוצים והתפקיד למטה. כל בחירה נשמרת אוטומטית.')
      .setColor('#5865F2');

    const welcomeRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('set_welcome')
        .setPlaceholder('ערוץ ברכה').addChannelTypes(ChannelType.GuildText)
    );
    const episodesRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('set_episodes')
        .setPlaceholder('ערוץ עדכוני פרקים').addChannelTypes(ChannelType.GuildText)
    );
    const announceRow = new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId('set_announce')
        .setPlaceholder('ערוץ עדכונים כלליים').addChannelTypes(ChannelType.GuildText)
    );
    const staffRow = new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId('set_staff')
        .setPlaceholder('תפקיד צוות (רואה טיקטים)')
    );

    return interaction.reply({
      embeds: [embed],
      components: [welcomeRow, episodesRow, announceRow, staffRow],
      ephemeral: true
    });
  }

  // ---------- תפריטי בחירה ----------
  if (interaction.isChannelSelectMenu()) {
    if (interaction.customId === 'set_welcome') config.welcomeChannelId = interaction.values[0];
    if (interaction.customId === 'set_episodes') config.episodesChannelId = interaction.values[0];
    if (interaction.customId === 'set_announce') config.announceChannelId = interaction.values[0];
    saveConfig();
    return interaction.reply({ content: '✅ נשמר', ephemeral: true });
  }

  if (interaction.isRoleSelectMenu() && interaction.customId === 'set_staff') {
    config.staffRoleId = interaction.values[0];
    saveConfig();
    return interaction.reply({ content: '✅ נשמר', ephemeral: true });
  }

  // ---------- /ticketpanel ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'ticketpanel') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('open_ticket')
        .setLabel('פתח טיקט').setEmoji('🎫').setStyle(ButtonStyle.Primary)
    );
    const embed = new EmbedBuilder()
      .setTitle('מערכת טיקטים')
      .setDescription('לחץ על הכפתור כדי לפתוח טיקט עם הצוות.')
      .setColor('#5865F2');
    return interaction.reply({ embeds: [embed], components: [row] });
  }

  // ---------- /announce ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'announce') {
    if (!config.announceChannelId)
      return interaction.reply({ content: '❌ קודם הרץ `/setup`.', ephemeral: true });
    const title = interaction.options.getString('title');
    const msg = interaction.options.getString('message');
    const embed = new EmbedBuilder()
      .setTitle(`📢 ${title}`).setDescription(msg)
      .setColor('#FEE75C').setTimestamp();
    const ch = interaction.guild.channels.cache.get(config.announceChannelId);
    if (!ch) return interaction.reply({ content: '❌ הערוץ לא נמצא.', ephemeral: true });
    await ch.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ נשלח ב-${ch}`, ephemeral: true });
  }

  // ---------- /update ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'update') {
    if (!config.episodesChannelId)
      return interaction.reply({ content: '❌ קודם הרץ `/setup`.', ephemeral: true });

    const anime = interaction.options.getString('anime');
    const episode = interaction.options.getInteger('episode');
    const link = interaction.options.getString('link');
    const note = interaction.options.getString('note');

    const embed = new EmbedBuilder()
      .setTitle('🎬 פרק חדש!')
      .setDescription(`**${anime}** — פרק **${episode}** עלה לאוויר!`)
      .setColor('#57F287').setTimestamp();

    if (note) embed.addFields({ name: 'הערה', value: note });
    if (link) {
      embed.setURL(link);
      embed.addFields({ name: 'קישור', value: `[לצפייה](${link})` });
    }

    const ch = interaction.guild.channels.cache.get(config.episodesChannelId);
    if (!ch) return interaction.reply({ content: '❌ הערוץ לא נמצא.', ephemeral: true });
    await ch.send({ embeds: [embed] });

    if (config.staffRoleId) {
      const ping = await ch.send(`<@&${config.staffRoleId}>`);
      setTimeout(() => ping.delete().catch(() => {}), 100);
    }
    return interaction.reply({ content: `✅ עדכון נשלח ב-${ch}`, ephemeral: true });
  }

  // ---------- פתיחת טיקט ----------
  if (interaction.isButton() && interaction.customId === 'open_ticket') {
    if (!config.staffRoleId)
      return interaction.reply({ content: '❌ קודם הרץ `/setup`.', ephemeral: true });

    const existing = interaction.guild.channels.cache.find(
      c => c.name === `ticket-${interaction.user.id}`
    );
    if (existing)
      return interaction.reply({ content: `כבר יש לך טיקט: ${existing}`, ephemeral: true });

    const channel = await interaction.guild.channels.create({
      name: `ticket-${interaction.user.id}`,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: config.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket')
        .setLabel('סגור טיקט').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `${interaction.user} פתח טיקט. הצוות יטפל בך בקרוב.\n<@&${config.staffRoleId}>`,
      components: [row]
    });
    return interaction.reply({ content: `✅ הטיקט שלך: ${channel}`, ephemeral: true });
  }

  // ---------- סגירת טיקט ----------
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: 'הטיקט ייסגר בעוד 5 שניות...' });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
  }
});

// ============ רישום פקודות ============
client.once('ready', async () => {
  const commands = [
    new SlashCommandBuilder().setName('setup').setDescription('הגדרת הבוט (פעם אחת)')
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder().setName('ticketpanel').setDescription('שלח פאנל טיקטים')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName('announce').setDescription('הודעת עדכון כללית')
      .addStringOption(o => o.setName('title').setDescription('כותרת').setRequired(true))
      .addStringOption(o => o.setName('message').setDescription('תוכן').setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    new SlashCommandBuilder().setName('update').setDescription('עדכון פרק חדש')
      .addStringOption(o => o.setName('anime').setDescription('שם האנימה').setRequired(true))
      .addIntegerOption(o => o.setName('episode').setDescription('מספר פרק').setRequired(true))
      .addStringOption(o => o.setName('link').setDescription('קישור לפרק'))
      .addStringOption(o => o.setName('note').setDescription('הערה'))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  ].map(c => c.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ הפקודות נרשמו');
  } catch (err) {
    console.error('❌ שגיאה ברישום פקודות:', err);
  }
});

client.login(TOKEN);