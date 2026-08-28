const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Bloquea el canal actual para @everyone.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    try {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: 'Necesitas el permiso Gestionar canales.', ephemeral: true });
      }
      if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return interaction.reply({ content: 'No tengo el permiso Gestionar canales.', ephemeral: true });
      }

      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });

      return interaction.reply({ content: '🔒 Canal bloqueado para @everyone.', ephemeral: true });
    } catch (error) {
      console.error('Error ejecutando /lock:', error);
      const response = { content: 'No pude bloquear este canal.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
