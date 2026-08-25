const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes recientes del canal.')
    .addIntegerOption((option) =>
      option
        .setName('cantidad')
        .setDescription('Cantidad de mensajes que quieres borrar (1-100).')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: 'Necesitas el permiso Gestionar mensajes para usar este comando.',
          ephemeral: true,
        });
      }

      if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({
          content: 'No tengo el permiso Gestionar mensajes en este servidor.',
          ephemeral: true,
        });
      }

      const cantidad = interaction.options.getInteger('cantidad', true);
      const eliminados = await interaction.channel.bulkDelete(cantidad, true);

      return interaction.reply({
        content: `Se eliminaron ${eliminados.size} mensaje(s).`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error ejecutando /clear:', error);

      if (interaction.replied || interaction.deferred) {
        return interaction.followUp({ content: 'No pude borrar los mensajes.', ephemeral: true });
      }

      return interaction.reply({ content: 'No pude borrar los mensajes.', ephemeral: true });
    }
  },
};
