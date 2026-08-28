const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea a un usuario del servidor.')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Usuario que quieres banear.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Motivo del baneo.').setMaxLength(512)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: 'Necesitas el permiso Banear miembros.', ephemeral: true });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) {
        return interaction.reply({ content: 'No tengo el permiso Banear miembros.', ephemeral: true });
      }

      const targetUser = interaction.options.getUser('usuario', true);
      const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      const reason = interaction.options.getString('razon') || 'Sin razón especificada';

      if (target?.id === interaction.user.id) {
        return interaction.reply({ content: 'No puedes banearte a ti mismo.', ephemeral: true });
      }
      if (target && !target.bannable) {
        return interaction.reply({ content: 'No puedo banear a ese usuario. Revisa la jerarquía de roles.', ephemeral: true });
      }

      await interaction.guild.members.ban(targetUser.id, { reason });
      const embed = new EmbedBuilder()
        .setColor(0xC0392B)
        .setTitle('Usuario baneado')
        .addFields(
          { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})` },
          { name: 'Moderador', value: interaction.user.tag },
          { name: 'Razón', value: reason }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error ejecutando /ban:', error);
      const response = { content: 'No pude banear a ese usuario.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
