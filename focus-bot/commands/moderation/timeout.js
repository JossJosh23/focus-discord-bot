const { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Aplica un tiempo fuera a un usuario.')
    .addUserOption((option) =>
      option.setName('usuario').setDescription('Usuario que recibirá el tiempo fuera.').setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('tiempo')
        .setDescription('Duración en minutos (1-40320).')
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option.setName('razon').setDescription('Motivo del tiempo fuera.').setMaxLength(512)
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
      const target = await interaction.guild.members.fetch(targetUser.id);
      const minutes = interaction.options.getInteger('tiempo', true);
      const reason = interaction.options.getString('razon') || 'Sin razón especificada';

      if (target.id === interaction.user.id) {
        return interaction.reply({ content: 'No puedes aplicarte un tiempo fuera a ti mismo.', ephemeral: true });
      }
      if (!target.moderatable) {
        return interaction.reply({ content: 'No puedo moderar a ese usuario. Revisa la jerarquía de roles.', ephemeral: true });
      }

      await target.timeout(minutes * 60 * 1000, reason);
      const embed = new EmbedBuilder()
        .setColor(0xF1C40F)
        .setTitle('Tiempo fuera aplicado')
        .addFields(
          { name: 'Usuario', value: `${target.user.tag} (${target.id})` },
          { name: 'Duración', value: `${minutes} minuto(s)` },
          { name: 'Moderador', value: interaction.user.tag },
          { name: 'Razón', value: reason }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error ejecutando /timeout:', error);
      const response = { content: 'No pude aplicar el tiempo fuera.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
