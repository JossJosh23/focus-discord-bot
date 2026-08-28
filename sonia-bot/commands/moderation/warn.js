const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const warningsFile = path.join(__dirname, '../../data/warnings.json');
let warningData = {};
try {
  warningData = JSON.parse(fs.readFileSync(warningsFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') console.error('No se pudieron cargar las advertencias:', error);
}
const warnings = new Map(Object.entries(warningData));

function saveWarnings() {
  const temporaryFile = `${warningsFile}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(Object.fromEntries(warnings), null, 2));
  fs.renameSync(temporaryFile, warningsFile);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Registra una advertencia para un usuario.')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Usuario que recibirá la advertencia.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Motivo de la advertencia.').setMaxLength(512).setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: 'Necesitas el permiso Moderar miembros.', ephemeral: true });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return interaction.reply({ content: 'No tengo el permiso Moderar miembros.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('usuario', true);
      const reason = interaction.options.getString('razon', true);
      if (targetUser.id === interaction.user.id) {
        return interaction.reply({ content: 'No puedes advertirte a ti mismo.', ephemeral: true });
      }

      const key = `${interaction.guildId}:${targetUser.id}`;
      const storedWarnings = warnings.get(key);
      const userWarnings = Array.isArray(storedWarnings) ? storedWarnings : [];
      userWarnings.push({ reason, moderatorId: interaction.user.id, createdAt: new Date().toISOString() });
      warnings.set(key, userWarnings);
      saveWarnings();

      const embed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('Advertencia registrada')
        .addFields(
          { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})` },
          { name: 'Moderador', value: interaction.user.tag },
          { name: 'Razón', value: reason },
          { name: 'Total de advertencias', value: String(userWarnings.length) }
        )
        .setTimestamp();

      await targetUser.send({
        content: `Has recibido una advertencia en **${interaction.guild.name}**.`,
        embeds: [embed],
      }).catch(() => null);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
      console.error('Error ejecutando /warn:', error);
      const response = { content: 'No pude registrar la advertencia.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
