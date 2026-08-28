const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Desbloquea el canal actual para @everyone.')
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
        // Elimina solo la regla creada por /lock y restaura la herencia del canal.
        // Forzar `true` podría abrir un canal que ya estaba restringido.
        SendMessages: null,
      });

      return interaction.reply({ content: '🔓 Canal desbloqueado para @everyone.', ephemeral: true });
    } catch (error) {
      console.error('Error ejecutando /unlock:', error);
      const response = { content: 'No pude desbloquear este canal.', ephemeral: true };
      return interaction.replied || interaction.deferred
        ? interaction.followUp(response)
        : interaction.reply(response);
    }
  },
};
