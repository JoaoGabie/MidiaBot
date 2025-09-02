const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

const SERVER = 'http://127.0.0.1:8000'; // FastAPI local
const ALLOWED_CHAT = null; // opcional: crava o ID do grupo autorizado

const client = new Client({
  authStrategy: new LocalAuth(), // salva sessão local
});

client.on('qr', (qr) => {
  qrcode.generate(qr, {small: true});
  console.log('Escaneia o QR pra logar no WhatsApp Web');
});

client.on('ready', () => {
  console.log('Bot do WhatsApp pronto!');
});

function cmd(text) {
  const m = text.trim();
  if (!m.startsWith('@bot')) return null;
  const parts = m.slice(4).trim().split(/\s+/);
  const name = (parts.shift() || '').toLowerCase();
  const rest = parts.join(' ');
  return { name, rest };
}

client.on('message', async msg => {
  if (ALLOWED_CHAT && msg.from !== ALLOWED_CHAT) return;

  const c = cmd(msg.body);
  if (!c) return;

  try {
    if (c.name === 'tocar') {
      await axios.post(`${SERVER}/queue`, { query: c.rest, requested_by: msg.author || msg.from });
      await msg.reply('✅ adicionado à fila!');
    } else if (['soltar','play','pause'].includes(c.name)) {
      await axios.post(`${SERVER}/play`);
      await msg.reply('⏯️ play/pause');
    } else if (c.name === 'pular') {
      await axios.post(`${SERVER}/next`);
      await msg.reply('⏭️ próxima');
    } else if (c.name === 'volume') {
      const v = parseInt(c.rest,10);
      if (isNaN(v)) return msg.reply('Use: @bot volume 0-100');
      await axios.post(`${SERVER}/volume`, null, { params:{ value:v } });
      await msg.reply(`🔊 volume ${v}%`);
    } else if (c.name === 'fila') {
      const r = await axios.get(`${SERVER}/queue`);
      const linhas = r.data.playlist.map(it => `${it.current?'▶️':'•'} ${it.index}. ${it.filename}`).slice(0,10).join('\n');
      await msg.reply(linhas || 'fila vazia');
    } else if (c.name === 'limpar') {
      await axios.post(`${SERVER}/queue/clear`);
      await msg.reply('🧹 fila limpa');
    } else {
      await msg.reply('Comandos: tocar <url|termo> | soltar | pular | volume <0-100> | fila | limpar');
    }
  } catch (e) {
    console.error(e);
    await msg.reply('❌ erro ao processar comando');
  }
});

client.initialize();
