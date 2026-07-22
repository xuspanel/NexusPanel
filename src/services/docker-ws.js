const Docker = require('dockerode');
const jwt = require('jsonwebtoken');
const { validators } = require('../utils/shell');

const docker = new Docker();

function parseCookies(cookieHeader) {
  var cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(function (pair) {
    var parts = pair.split('=');
    if (parts.length >= 2) cookies[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
  });
  return cookies;
}

function handleConnection(ws, req) {
  var token = parseCookies(req.headers.cookie || '').token;
  if (!token) { ws.close(4001, 'No auth cookie'); return; }
  try { req.user = jwt.verify(token, process.env.JWT_SECRET); } catch (_) { ws.close(4001, 'Invalid token'); return; }

  var streams = {};
  var closed = false;

  function cleanup(key) {
    if (streams[key]) {
      try {
        if (streams[key].destroy) streams[key].destroy();
        if (streams[key].end) streams[key].end();
      } catch (_) {}
      delete streams[key];
    }
  }

  ws.on('message', async function (raw) {
    if (closed) return;
    var msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

    if (msg.type === 'exec') {
      var cid = msg.containerId;
      if (!cid || !validators.containerId.test(cid)) {
        ws.send(JSON.stringify({ type: 'exec-error', error: 'Invalid container ID' }));
        return;
      }
      try {
        var container = docker.getContainer(cid);
        var exec = await container.exec({
          Cmd: msg.cmd || ['/bin/sh'],
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true
        });
        var stream = await exec.start({ hijack: true, stdin: true });
        var key = 'exec:' + cid;
        streams[key] = stream;

        stream.on('data', function (chunk) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'exec-output', containerId: cid, data: chunk.toString('base64') }));
          }
        });

        stream.on('end', function () {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'exec-end', containerId: cid }));
          cleanup(key);
        });

        stream.on('error', function (err) {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'exec-error', containerId: cid, error: err.message }));
          cleanup(key);
        });

        ws.send(JSON.stringify({ type: 'exec-started', containerId: cid }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'exec-error', containerId: cid, error: err.message }));
      }
      return;
    }

    if (msg.type === 'exec-input') {
      var ek = 'exec:' + msg.containerId;
      if (streams[ek]) {
        streams[ek].write(Buffer.from(msg.data, 'base64'));
      }
      return;
    }

    if (msg.type === 'exec-resize') {
      var erk = 'exec:' + msg.containerId;
      if (streams[erk] && msg.cols && msg.rows) {
        try {
          var container = docker.getContainer(msg.containerId);
          var exec = await container.getExec({ id: msg.execId });
          await exec.resize({ h: msg.rows, w: msg.cols });
        } catch (_) {}
      }
      return;
    }

    if (msg.type === 'exec-stop') {
      cleanup('exec:' + msg.containerId);
      ws.send(JSON.stringify({ type: 'exec-stopped', containerId: msg.containerId }));
      return;
    }

    if (msg.type === 'logs') {
      var cid = msg.containerId;
      if (!cid || !validators.containerId.test(cid)) {
        ws.send(JSON.stringify({ type: 'logs-error', error: 'Invalid container ID' }));
        return;
      }
      try {
        var container = docker.getContainer(cid);
        var opts = { follow: msg.follow !== false, stdout: true, stderr: true };
        if (msg.tail) opts.tail = parseInt(msg.tail, 10) || 200;
        var stream = await container.logs(opts);
        var key = 'logs:' + cid;
        streams[key] = stream;

        stream.on('data', function (chunk) {
          if (ws.readyState === ws.OPEN) {
            var data = chunk.toString('utf8');
            ws.send(JSON.stringify({ type: 'logs-data', containerId: cid, data: data }));
          }
        });

        stream.on('end', function () {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'logs-end', containerId: cid }));
          cleanup(key);
        });

        stream.on('error', function (err) {
          if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'logs-error', containerId: cid, error: err.message }));
          cleanup(key);
        });

        ws.send(JSON.stringify({ type: 'logs-started', containerId: cid }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'logs-error', containerId: cid, error: err.message }));
      }
      return;
    }

    if (msg.type === 'logs-stop') {
      cleanup('logs:' + msg.containerId);
      ws.send(JSON.stringify({ type: 'logs-stopped', containerId: msg.containerId }));
      return;
    }

    if (msg.type === 'pull') {
      var image = msg.image;
      if (!image) {
        ws.send(JSON.stringify({ type: 'pull-error', error: 'Image name required' }));
        return;
      }
      try {
        var stream = await docker.pull(image);
        docker.modem.followProgress(stream, function (err, res) {
          if (err) {
            ws.send(JSON.stringify({ type: 'pull-error', error: err.message }));
          } else {
            ws.send(JSON.stringify({ type: 'pull-done', image: image, result: res }));
          }
        }, function (event) {
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'pull-progress', image: image, status: event.status, progress: event.progress, id: event.id }));
          }
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'pull-error', error: err.message }));
      }
      return;
    }
  });

  ws.on('close', function () {
    closed = true;
    Object.keys(streams).forEach(cleanup);
  });
}

module.exports = { handleConnection };
