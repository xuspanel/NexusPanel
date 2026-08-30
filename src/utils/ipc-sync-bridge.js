const net = require('net');
const fs = require('fs');
const { DEFAULT_SOCKET_PATH, formatRequest } = require('../daemon/protocol');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => { resolve(data); });
  });
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) {
      process.stdout.write(JSON.stringify({ ok: false, error: 'Empty stdin payload' }));
      process.exit(1);
    }

    const { command, args, opts } = JSON.parse(raw);
    const sockPath = process.env.NEXUSPANEL_SOCK || DEFAULT_SOCKET_PATH;
    const timeoutMs = (opts && opts.timeout) || 30000;

    const socket = net.createConnection({ path: sockPath });

    const timer = setTimeout(() => {
      socket.destroy();
      process.stdout.write(JSON.stringify({ ok: false, error: 'IPC timeout' }));
      process.exit(1);
    }, timeoutMs + 2000);

    let buffer = '';

    socket.on('connect', () => {
      const payload = formatRequest(null, command, args, opts);
      socket.write(payload);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lineIdx = buffer.indexOf('\n');
      if (lineIdx !== -1) {
        clearTimeout(timer);
        socket.end();
        const line = buffer.substring(0, lineIdx).trim();
        try {
          const resp = JSON.parse(line);
          if (resp.error) {
            process.stdout.write(JSON.stringify({ ok: false, error: resp.error.message || 'Daemon error' }));
          } else {
            process.stdout.write(JSON.stringify({ ok: true, result: resp.result }));
          }
          process.exit(0);
        } catch (e) {
          process.stdout.write(JSON.stringify({ ok: false, error: e.message }));
          process.exit(1);
        }
      }
    });

    socket.on('error', (err) => {
      clearTimeout(timer);
      process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
      process.exit(1);
    });
  } catch (err) {
    process.stdout.write(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

main();
