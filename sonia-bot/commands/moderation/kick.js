const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un usuario del servidor.')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Usuario que quieres expulsar.').setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Motivo de la expulsión.').setMaxLength(512)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: 'Necesitas el permiso Expulsar miembros.', ephemeral: true });
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionFlagsBits.KickMembers)) {
        return interaction.reply({ content: 'No tengo el permiso Expulsar miembros.', ephemeral: true });
      }

      const target = await interaction.guild.members.fetch(interaction.options.getUser('usuario', true).id);
      const reason = interaction.options.getString('razon') || 'Sin razón especificada';

      if (target.id === interaction.user.id) {
        return interaction.reply({ content: 'No puedes expulsarte a ti mismo.', ephemeral: true });
      }
      if (!target.kickable) {
        return interaction.reply({ content: 'No puedo expulsar a ese usuario. Revisa la jerarquía de roles.', ephemeral: true });
      }

      await target.kick(reason);
      const embed = new EmbedBuilder()
        .setColor(0xE67E22)
        .setTitle('Usuario expulsado')
        .addFields(
          { name: 'Usuario', value: `${target.user.tag} (${target.id})` },
          { name: 'Moderador', value: interaction.user.tag },
          { name: 'Razón', value: reason }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error ejecutando /kick:', error);
      const response = { content: 'No pude expulsar a ese usuario.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
